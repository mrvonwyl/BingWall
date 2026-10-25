import path from 'node:path';
import { ApplyFailedError } from './applier/applierHost.js';
import { buildImageUrl, downloadImage, fetchBingImagesWithFallback, toStoredMetadata } from './bing.js';
import { pruneOrphanedImages } from './history.js';
import { upsertMetadata } from './storage.js';
import type { StoredImageMetadata } from './bing.models.js';
import type { ApplyOutcome } from './applier/applier.models.js';
import type { ImageJob, RunDailyUpdateDeps, RunDailyUpdateResult } from './pipeline.models.js';

// Once `deps.signal` aborts, the refresh writes no more files or metadata, makes no new apply, and rejects
// with the signal's reason as soon as no file write is under way and an apply already sent (with its state
// write) has settled.
export async function runDailyUpdate(deps: RunDailyUpdateDeps): Promise<RunDailyUpdateResult> {
  const { signal } = deps;
  const images = await fetchBingImagesWithFallback(deps.fetchImpl, deps.market, signal);
  signal?.throwIfAborted();
  const newestMetadata = toStoredMetadata(images[0]);
  const resolution = deps.resolutionOverride ?? 'UHD';

  const stored = await deps.readMetadata(deps.dataFolder);
  signal?.throwIfAborted();
  const existingDates = new Set(stored.map((entry) => entry.date));

  // Every download starts at once; each image lands on disk independently.
  const jobs: ImageJob[] = images.map((entry) => {
    const metadata = toStoredMetadata(entry);
    if (existingDates.has(metadata.date) && !deps.replaceExisting) {
      return { metadata, downloaded: false, landed: Promise.resolve(path.join(deps.dataFolder, `${metadata.date}.jpg`)) };
    }
    const landed = untilAborted(downloadImage(deps.fetchImpl, buildImageUrl(entry, resolution), signal), signal).then(
      (data) => {
        signal?.throwIfAborted();
        return deps.saveImage(deps.dataFolder, metadata.date, data);
      },
    );
    return { metadata, downloaded: true, landed };
  });

  // Handles every download's outcome from the start, so none counts as unhandled while the target is chosen.
  const landing = Promise.allSettled(jobs.map((job) => job.landed));

  let target: ImageJob | undefined;
  try {
    target = await pickTarget(jobs, deps);
  } catch (error) {
    // No file write may still be under way once the run settles.
    await landing;
    throw error;
  }
  // The apply goes out as soon as the target is on disk, while the other downloads carry on.
  const applying = target ? applyWhenLanded(target, deps) : Promise.resolve(null);
  // Awaited below; this only stops an early state-write failure from counting as unhandled meanwhile.
  applying.catch(() => undefined);

  const settled = await landing;
  // Not cut short by an abort: an apply already sent must finish, and record its state if applied, before
  // this run settles, so nothing is written once the next refresh has started.
  const applied = await applying;
  signal?.throwIfAborted();

  // A failed date drops out of history, so its image is pruned like any other orphan.
  const failedDates = new Set<string>();
  jobs.forEach((job, index) => {
    if (settled[index].status === 'rejected') {
      failedDates.add(job.metadata.date);
    }
  });
  let retained = stored.filter((entry) => !failedDates.has(entry.date));

  // Oldest first, so the newest ends up at the front of the history.
  for (const job of [...jobs].reverse()) {
    if (job.downloaded && !failedDates.has(job.metadata.date)) {
      retained = upsertMetadata(retained, job.metadata);
    }
  }

  // Read once this run's apply has settled, so a wallpaper it just applied counts as the selected one.
  const appliedDate = (await deps.readState(deps.dataFolder))?.selectedDate;
  if (appliedDate) {
    retained = await keepSelectedEntry(retained, stored, appliedDate, failedDates, deps);
  }

  await deps.writeMetadata(deps.dataFolder, retained);
  await pruneOrphanedImages({
    dataFolder: deps.dataFolder,
    entries: retained,
    keepDates: appliedDate ? [appliedDate] : [],
    listImageDates: deps.listImageDates,
    deleteImage: deps.deleteImage,
  });

  if (target) {
    const targetResult = settled[jobs.indexOf(target)];
    if (targetResult.status === 'rejected') {
      throw targetResult.reason;
    }
  }
  if (applied?.outcome.kind === 'error') {
    throw new ApplyFailedError(applied.outcome);
  }

  const newest = settled[0];
  return {
    imagePath: newest.status === 'fulfilled' ? newest.value : path.join(deps.dataFolder, `${newestMetadata.date}.jpg`),
    metadata: newestMetadata,
    wallpaperChanged: applied?.outcome.kind === 'applied',
    failedDates: [...failedDates],
  };
}

// With daily auto-refresh on, the newest image. With it off, nothing changes unless the stored files are
// being replaced (a market switch): then the selected date's new image, or the newest if that date isn't
// among the new market's images.
async function pickTarget(jobs: ImageJob[], deps: RunDailyUpdateDeps): Promise<ImageJob | undefined> {
  if (deps.dailyAutoRefresh) {
    return jobs[0];
  }
  if (!deps.replaceExisting) {
    return undefined;
  }
  const state = await deps.readState(deps.dataFolder);
  return jobs.find((job) => job.metadata.date === state?.selectedDate) ?? jobs[0];
}

// The selected wallpaper stays in history beyond the retention cap, in its date-ordered place, so history and
// the current-wallpaper lookup keep showing what is on the desktop. Its entry comes from the metadata as read
// before the cap; one whose download failed this run is kept only while its image is still on disk.
async function keepSelectedEntry(
  retained: StoredImageMetadata[],
  stored: StoredImageMetadata[],
  selectedDate: string,
  failedDates: Set<string>,
  deps: RunDailyUpdateDeps,
): Promise<StoredImageMetadata[]> {
  if (retained.some((entry) => entry.date === selectedDate)) {
    return retained;
  }
  const selected = stored.find((entry) => entry.date === selectedDate);
  if (!selected) {
    return retained;
  }
  if (failedDates.has(selectedDate) && !(await deps.listImageDates(deps.dataFolder)).includes(selectedDate)) {
    return retained;
  }
  const olderIndex = retained.findIndex((entry) => entry.date < selectedDate);
  const at = olderIndex === -1 ? retained.length : olderIndex;
  return [...retained.slice(0, at), selected, ...retained.slice(at)];
}

// Settles like `promise`, or rejects with the signal's reason as soon as it aborts, whichever comes first.
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

// Never rejects for a download failure: that is reported through the job's own `landed` promise.
async function applyWhenLanded(target: ImageJob, deps: RunDailyUpdateDeps): Promise<{ outcome: ApplyOutcome } | null> {
  let imagePath: string;
  try {
    imagePath = await target.landed;
  } catch {
    return null;
  }
  if (deps.signal?.aborted) {
    return null;
  }

  const outcome = await deps.setWallpaper(imagePath);
  // Only an applied wallpaper is remembered, so the saved selection always matches the desktop.
  if (outcome.kind === 'applied') {
    await deps.writeState(deps.dataFolder, { selectedDate: target.metadata.date });
  }
  return { outcome };
}

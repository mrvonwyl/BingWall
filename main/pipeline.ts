import path from 'node:path';
import { ApplyFailedError } from './applier/applierHost.js';
import { buildImageUrl, downloadImage, fetchBingImagesWithFallback, toStoredMetadata } from './bing.js';
import { pruneOrphanedImages } from './history.js';
import { upsertMetadata } from './storage.js';
import type { StoredImageMetadata } from './bing.models.js';
import type { ApplyOutcome } from './applier/applier.models.js';
import type { RunDailyUpdateDeps, RunDailyUpdateResult } from './pipeline.models.js';

type ImageJob = {
  metadata: StoredImageMetadata;
  downloaded: boolean;
  // Resolves with the image's path once it is on disk.
  landed: Promise<string>;
};

export async function runDailyUpdate(deps: RunDailyUpdateDeps): Promise<RunDailyUpdateResult> {
  const images = await fetchBingImagesWithFallback(deps.fetchImpl, deps.market);
  const newestMetadata = toStoredMetadata(images[0]);
  const resolution = deps.resolutionOverride ?? 'UHD';

  let retained = await deps.readMetadata(deps.dataFolder);
  const existingDates = new Set(retained.map((entry) => entry.date));

  // Every download starts at once; each image lands on disk independently.
  const jobs: ImageJob[] = images.map((entry) => {
    const metadata = toStoredMetadata(entry);
    if (existingDates.has(metadata.date) && !deps.replaceExisting) {
      return { metadata, downloaded: false, landed: Promise.resolve(path.join(deps.dataFolder, `${metadata.date}.jpg`)) };
    }
    const landed = downloadImage(deps.fetchImpl, buildImageUrl(entry, resolution)).then((data) =>
      deps.saveImage(deps.dataFolder, metadata.date, data),
    );
    return { metadata, downloaded: true, landed };
  });

  const target = deps.dailyAutoRefresh ? jobs[0] : undefined;
  // The apply goes out as soon as the target is on disk, while the other downloads carry on.
  const applying = target ? applyWhenLanded(target, deps) : Promise.resolve(null);
  // Awaited below; this only stops an early state-write failure from counting as unhandled meanwhile.
  applying.catch(() => undefined);

  const settled = await Promise.allSettled(jobs.map((job) => job.landed));
  const applied = await applying;

  const failed = settled.find((result) => result.status === 'rejected');
  if (failed) {
    throw failed.reason;
  }

  // Oldest first, so the newest ends up at the front of the history.
  for (const job of [...jobs].reverse()) {
    if (job.downloaded) {
      retained = upsertMetadata(retained, job.metadata);
    }
  }

  await deps.writeMetadata(deps.dataFolder, retained);
  await pruneOrphanedImages({
    dataFolder: deps.dataFolder,
    entries: retained,
    listImageDates: deps.listImageDates,
    deleteImage: deps.deleteImage,
  });

  if (applied?.outcome.kind === 'error') {
    throw new ApplyFailedError(applied.outcome);
  }

  const newestImagePath = (settled[0] as PromiseFulfilledResult<string>).value;
  return { imagePath: newestImagePath, metadata: newestMetadata, wallpaperChanged: applied?.outcome.kind === 'applied' };
}

// Never rejects: a failed target download is reported through the job's own `landed` promise.
async function applyWhenLanded(target: ImageJob, deps: RunDailyUpdateDeps): Promise<{ outcome: ApplyOutcome } | null> {
  let imagePath: string;
  try {
    imagePath = await target.landed;
  } catch {
    return null;
  }

  const outcome = await deps.setWallpaper(imagePath);
  // Only an applied wallpaper is remembered, so the saved selection always matches the desktop.
  if (outcome.kind === 'applied') {
    await deps.writeState(deps.dataFolder, { selectedDate: target.metadata.date });
  }
  return { outcome };
}

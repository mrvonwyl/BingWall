import path from 'node:path';
import { ApplyFailedError } from './applier/applierHost.js';
import { buildImageUrl, downloadImage, fetchBingImagesWithFallback, resolveImageResolution, toStoredMetadata } from './bing.js';
import { pruneOrphanedImages } from './history.js';
import { upsertMetadata } from './storage.js';
import type { RunDailyUpdateDeps, RunDailyUpdateResult } from './pipeline.models.js';

export async function runDailyUpdate(deps: RunDailyUpdateDeps): Promise<RunDailyUpdateResult> {
  const images = await fetchBingImagesWithFallback(deps.fetchImpl, deps.market);
  const newest = images[0];
  const newestMetadata = toStoredMetadata(newest);

  const resolution = resolveImageResolution(deps.displays, deps.resolutionOverride);

  let retained = await deps.readMetadata(deps.dataFolder);
  const existingDates = new Set(retained.map((entry) => entry.date));

  let newestImagePath = path.join(deps.dataFolder, `${newestMetadata.date}.jpg`);

  for (const entry of [...images].reverse()) {
    const metadata = toStoredMetadata(entry);
    if (existingDates.has(metadata.date) && !deps.replaceExisting) {
      continue;
    }

    const imageUrl = buildImageUrl(entry, resolution);
    const imageData = await downloadImage(deps.fetchImpl, imageUrl);
    const imagePath = await deps.saveImage(deps.dataFolder, metadata.date, imageData);
    retained = upsertMetadata(retained, metadata);

    if (metadata.date === newestMetadata.date) {
      newestImagePath = imagePath;
    }
  }

  await deps.writeMetadata(deps.dataFolder, retained);
  await pruneOrphanedImages({
    dataFolder: deps.dataFolder,
    entries: retained,
    listImageDates: deps.listImageDates,
    deleteImage: deps.deleteImage,
  });

  let wallpaperChanged = false;
  if (deps.dailyAutoRefresh) {
    const outcome = await deps.setWallpaper(newestImagePath);
    if (outcome.kind === 'error') {
      throw new ApplyFailedError(outcome);
    }
    // Only an applied wallpaper is remembered, so the saved selection always matches the desktop.
    if (outcome.kind === 'applied') {
      await deps.writeState(deps.dataFolder, { selectedDate: newestMetadata.date });
      wallpaperChanged = true;
    }
  }

  return { imagePath: newestImagePath, metadata: newestMetadata, wallpaperChanged };
}

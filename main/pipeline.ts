import { buildImageUrl, downloadImage, fetchBingImagesWithFallback, resolveImageResolution, toStoredMetadata } from './bing.js';
import { upsertMetadata } from './storage.js';
import type { RunDailyUpdateDeps, RunDailyUpdateResult } from './pipeline.models.js';

export async function runDailyUpdate(deps: RunDailyUpdateDeps): Promise<RunDailyUpdateResult> {
  const images = await fetchBingImagesWithFallback(deps.fetchImpl);
  const newest = images[0];

  const resolution = resolveImageResolution(deps.display);
  const imageUrl = buildImageUrl(newest, resolution);
  const imageData = await downloadImage(deps.fetchImpl, imageUrl);

  const metadata = toStoredMetadata(newest);
  const imagePath = await deps.saveImage(deps.dataFolder, metadata.date, imageData);

  const existing = await deps.readMetadata(deps.dataFolder);
  await deps.writeMetadata(deps.dataFolder, upsertMetadata(existing, metadata));

  await deps.setWallpaper(imagePath);

  return { imagePath, metadata };
}

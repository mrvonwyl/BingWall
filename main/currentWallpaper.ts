import path from 'node:path';
import type { CurrentWallpaperResult, GetCurrentWallpaperDeps } from './currentWallpaper.models.js';

export async function getCurrentWallpaper(deps: GetCurrentWallpaperDeps): Promise<CurrentWallpaperResult> {
  const entries = await deps.readMetadata(deps.dataFolder);
  const newest = entries[0];

  if (!newest) {
    return null;
  }

  return {
    metadata: newest,
    imagePath: path.join(deps.dataFolder, `${newest.date}.jpg`),
  };
}

import path from 'node:path';
import type { CurrentWallpaperResult, GetCurrentWallpaperDeps } from './currentWallpaper.models.js';

export async function getCurrentWallpaper(deps: GetCurrentWallpaperDeps): Promise<CurrentWallpaperResult> {
  const entries = await deps.readMetadata(deps.dataFolder);

  if (entries.length === 0) {
    return null;
  }

  const state = await deps.readState(deps.dataFolder);
  const selected = state ? entries.find((entry) => entry.date === state.selectedDate) : undefined;
  const metadata = selected ?? entries[0];

  return {
    metadata,
    imagePath: path.join(deps.dataFolder, `${metadata.date}.jpg`),
  };
}

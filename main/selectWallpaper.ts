import path from 'node:path';
import type { SelectWallpaperDeps, SelectWallpaperResult } from './selectWallpaper.models.js';

export async function selectWallpaper(date: string, deps: SelectWallpaperDeps): Promise<SelectWallpaperResult> {
  const entries = await deps.readMetadata(deps.dataFolder);
  const metadata = entries.find((entry) => entry.date === date);

  if (!metadata) {
    return null;
  }

  const imagePath = path.join(deps.dataFolder, `${date}.jpg`);
  await deps.setWallpaper(imagePath);
  await deps.writeState(deps.dataFolder, { selectedDate: date });

  return { metadata, imagePath };
}

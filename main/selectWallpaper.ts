import path from 'node:path';
import type { Settings } from './settings.models.js';
import type { SelectWallpaperDeps, SelectWallpaperResult } from './selectWallpaper.models.js';
import type { StoredImageMetadata } from './storage.models.js';

export async function selectWallpaper(date: string, deps: SelectWallpaperDeps): Promise<SelectWallpaperResult> {
  const entries = await deps.readMetadata(deps.dataFolder);
  const metadata = entries.find((entry) => entry.date === date);

  if (!metadata) {
    return null;
  }

  const imagePath = path.join(deps.dataFolder, `${date}.jpg`);
  const outcome = await deps.setWallpaper(imagePath);
  if (outcome.kind === 'superseded') {
    return { status: 'superseded' };
  }
  if (outcome.kind === 'error') {
    return { status: 'error', error: outcome };
  }
  // Only an applied wallpaper is remembered, so the saved selection always matches the desktop.
  await deps.writeState(deps.dataFolder, { selectedDate: date });
  const updatedSettings = date === newestDate(entries) ? null : await turnOffDailyAutoRefresh(deps);

  return { status: 'applied', metadata, imagePath, updatedSettings };
}

function newestDate(entries: StoredImageMetadata[]): string {
  return entries.reduce((newest, entry) => (entry.date > newest ? entry.date : newest), entries[0].date);
}

// Picking an image other than today's means the user wants it to stay, so the next daily image
// mustn't override it. Returns the written settings, or null when auto-refresh was already off.
async function turnOffDailyAutoRefresh(deps: SelectWallpaperDeps): Promise<Settings | null> {
  const settings = await deps.readSettings(deps.dataFolder);
  if (!settings.dailyAutoRefresh) {
    return null;
  }

  const updated = { ...settings, dailyAutoRefresh: false };
  await deps.writeSettings(deps.dataFolder, updated);
  return updated;
}

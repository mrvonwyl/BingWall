import type { DisplaySize, FetchImpl, ImageResolution, Market, StoredImageMetadata } from './bing.models.js';
import type { ApplyOutcome } from './applier/applier.models.js';
import type { WallpaperState } from './state.models.js';

export type RunDailyUpdateDeps = {
  fetchImpl: FetchImpl;
  market: Market;
  // Re-download dates that are already stored, e.g. after switching market.
  replaceExisting: boolean;
  displays: DisplaySize[];
  resolutionOverride: ImageResolution | null;
  dataFolder: string;
  dailyAutoRefresh: boolean;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  writeMetadata: (folder: string, entries: StoredImageMetadata[]) => Promise<void>;
  saveImage: (folder: string, date: string, data: ArrayBuffer) => Promise<string>;
  // The applier host's `apply`: resolves with the outcome, never rejects for an apply failure.
  setWallpaper: (imagePath: string) => Promise<ApplyOutcome>;
  listImageDates: (folder: string) => Promise<string[]>;
  deleteImage: (folder: string, date: string) => Promise<void>;
  writeState: (folder: string, state: WallpaperState) => Promise<void>;
};

export type RunDailyUpdateResult = {
  imagePath: string;
  metadata: StoredImageMetadata;
  wallpaperChanged: boolean;
};

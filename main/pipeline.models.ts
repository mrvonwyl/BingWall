import type { DisplaySize, FetchImpl, ImageResolution, StoredImageMetadata } from './bing.models.js';
import type { WallpaperState } from './state.models.js';

export type RunDailyUpdateDeps = {
  fetchImpl: FetchImpl;
  display: DisplaySize;
  resolutionOverride: ImageResolution | null;
  dataFolder: string;
  dailyAutoRefresh: boolean;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  writeMetadata: (folder: string, entries: StoredImageMetadata[]) => Promise<void>;
  saveImage: (folder: string, date: string, data: ArrayBuffer) => Promise<string>;
  setWallpaper: (imagePath: string) => Promise<void>;
  listImageDates: (folder: string) => Promise<string[]>;
  deleteImage: (folder: string, date: string) => Promise<void>;
  writeState: (folder: string, state: WallpaperState) => Promise<void>;
};

export type RunDailyUpdateResult = {
  imagePath: string;
  metadata: StoredImageMetadata;
  wallpaperChanged: boolean;
};

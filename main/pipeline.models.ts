import type { DisplaySize, FetchImpl, StoredImageMetadata } from './bing.models.js';

export type RunDailyUpdateDeps = {
  fetchImpl: FetchImpl;
  display: DisplaySize;
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  writeMetadata: (folder: string, entries: StoredImageMetadata[]) => Promise<void>;
  saveImage: (folder: string, date: string, data: ArrayBuffer) => Promise<string>;
  setWallpaper: (imagePath: string) => Promise<void>;
};

export type RunDailyUpdateResult = {
  imagePath: string;
  metadata: StoredImageMetadata;
};

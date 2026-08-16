import type { StoredImageMetadata } from './storage.models.js';

export type GetCurrentWallpaperDeps = {
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
};

export type CurrentWallpaperResult = {
  metadata: StoredImageMetadata;
  imagePath: string;
} | null;

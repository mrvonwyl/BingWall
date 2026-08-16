import type { StoredImageMetadata } from './storage.models.js';

export type SelectWallpaperDeps = {
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  setWallpaper: (imagePath: string) => Promise<void>;
};

export type SelectWallpaperResult = {
  metadata: StoredImageMetadata;
  imagePath: string;
} | null;

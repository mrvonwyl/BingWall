import type { StoredImageMetadata } from './storage.models.js';
import type { WallpaperState } from './state.models.js';

export type SelectWallpaperDeps = {
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  setWallpaper: (imagePath: string) => Promise<void>;
  writeState: (folder: string, state: WallpaperState) => Promise<void>;
};

export type SelectWallpaperResult = {
  metadata: StoredImageMetadata;
  imagePath: string;
} | null;

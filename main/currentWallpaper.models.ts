import type { StoredImageMetadata } from './storage.models.js';
import type { WallpaperState } from './state.models.js';

export type GetCurrentWallpaperDeps = {
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  readState: (folder: string) => Promise<WallpaperState | null>;
};

export type CurrentWallpaperResult = {
  metadata: StoredImageMetadata;
  imagePath: string;
} | null;

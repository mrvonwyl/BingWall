import type { ApplierError, ApplyOutcome } from './applier/applier.models.js';
import type { StoredImageMetadata } from './storage.models.js';
import type { WallpaperState } from './state.models.js';

export type SelectWallpaperDeps = {
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  // The applier host's `apply`: resolves with the outcome, never rejects for an apply failure.
  setWallpaper: (imagePath: string) => Promise<ApplyOutcome>;
  writeState: (folder: string, state: WallpaperState) => Promise<void>;
};

export type SelectWallpaperResult =
  | { status: 'applied'; metadata: StoredImageMetadata; imagePath: string }
  | { status: 'superseded' }
  | { status: 'error'; error: ApplierError }
  | null;

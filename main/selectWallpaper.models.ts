import type { ApplierError, ApplyOutcome } from './applier/applier.models.js';
import type { Settings } from './settings.models.js';
import type { StoredImageMetadata } from './storage.models.js';
import type { WallpaperState } from './state.models.js';

export type SelectWallpaperDeps = {
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
  // The applier host's `apply`: resolves with the outcome, never rejects for an apply failure.
  setWallpaper: (imagePath: string) => Promise<ApplyOutcome>;
  writeState: (folder: string, state: WallpaperState) => Promise<void>;
  readSettings: (folder: string) => Promise<Settings>;
  writeSettings: (folder: string, settings: Settings) => Promise<void>;
};

export type SelectWallpaperResult =
  // `updatedSettings` is set when applying an older image turned daily auto-refresh off.
  | { status: 'applied'; metadata: StoredImageMetadata; imagePath: string; updatedSettings: Settings | null }
  | { status: 'superseded' }
  | { status: 'error'; error: ApplierError }
  | null;

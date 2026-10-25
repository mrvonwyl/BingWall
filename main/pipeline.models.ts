import type { FetchImpl, ImageResolution, Market, StoredImageMetadata } from './bing.models.js';
import type { ApplyOutcome } from './applier/applier.models.js';
import type { WallpaperState } from './state.models.js';

export type RunDailyUpdateDeps = {
  fetchImpl: FetchImpl;
  market: Market;
  // Re-download dates that are already stored, e.g. after switching market. The selected wallpaper is
  // then re-applied from its new file even with daily auto-refresh off.
  replaceExisting: boolean;
  // Null means UHD.
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
  readState: (folder: string) => Promise<WallpaperState | null>;
  writeState: (folder: string, state: WallpaperState) => Promise<void>;
  // Aborted when a newer refresh replaces this one.
  signal?: AbortSignal;
};

export type RunDailyUpdateResult = {
  imagePath: string;
  metadata: StoredImageMetadata;
  wallpaperChanged: boolean;
  // Dates whose download failed while the refresh as a whole went ahead; they are not in history.
  failedDates: string[];
};

// One image of a refresh: either already stored, or being downloaded.
export type ImageJob = {
  metadata: StoredImageMetadata;
  downloaded: boolean;
  // Resolves with the image's path once it is on disk.
  landed: Promise<string>;
};

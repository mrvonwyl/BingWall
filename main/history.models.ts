import type { StoredImageMetadata } from './storage.models.js';

export type HistoryItem = {
  metadata: StoredImageMetadata;
  imagePath: string;
};

export type GetHistoryDeps = {
  dataFolder: string;
  readMetadata: (folder: string) => Promise<StoredImageMetadata[]>;
};

export type PruneOrphanedImagesDeps = {
  dataFolder: string;
  entries: StoredImageMetadata[];
  // Never deleted even when not in `entries`, e.g. the applied wallpaper, which Explorer may need to redraw.
  keepDates?: string[];
  listImageDates: (folder: string) => Promise<string[]>;
  deleteImage: (folder: string, date: string) => Promise<void>;
};

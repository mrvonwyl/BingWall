export type StoredImageMetadata = {
  date: string;
  title: string;
  description: string;
  copyright: string;
  copyrightlink: string;
};

export type CurrentWallpaperPayload = {
  metadata: StoredImageMetadata;
  imageUrl: string;
} | null;

export type HistoryItemPayload = {
  metadata: StoredImageMetadata;
  imageUrl: string;
};

export type Settings = {
  dailyAutoRefresh: boolean;
};

export type BingWallAPI = {
  getCurrentWallpaper: () => Promise<CurrentWallpaperPayload>;
  getHistory: () => Promise<HistoryItemPayload[]>;
  selectWallpaper: (date: string) => Promise<CurrentWallpaperPayload>;
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Settings) => Promise<Settings>;
};

declare global {
  interface Window {
    bingwall: BingWallAPI;
  }
}

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

export type ImageResolution = '1024x768' | '1280x720' | '1366x768' | '1920x1080' | '1920x1200' | 'UHD';

export type Settings = {
  dailyAutoRefresh: boolean;
  resolutionOverride: ImageResolution | null;
};

export type RefreshResultPayload =
  | { ok: true; current: CurrentWallpaperPayload }
  | { ok: false; error: string };

export type BingWallAPI = {
  getCurrentWallpaper: () => Promise<CurrentWallpaperPayload>;
  getHistory: () => Promise<HistoryItemPayload[]>;
  selectWallpaper: (date: string) => Promise<CurrentWallpaperPayload>;
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Settings) => Promise<Settings>;
  refresh: () => Promise<RefreshResultPayload>;
  onRefreshResult: (callback: (result: RefreshResultPayload) => void) => void;
  getDataFolder: () => Promise<string>;
  chooseDataFolder: () => Promise<string | null>;
  relocateDataFolder: (newFolder: string) => Promise<string>;
};

declare global {
  interface Window {
    bingwall: BingWallAPI;
  }
}

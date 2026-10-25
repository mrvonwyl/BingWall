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

export type Market = 'en-US' | 'en-GB' | 'de-DE' | 'de-CH';

export type Settings = {
  dailyAutoRefresh: boolean;
  resolutionOverride: ImageResolution | null;
  market: Market;
};

export type RefreshResultPayload =
  | { ok: true; current: CurrentWallpaperPayload }
  | { ok: false; error: string };

// Reply to select-wallpaper (null when the date isn't in history). A superseded request was replaced
// by a newer one and changes nothing; an error leaves the previous wallpaper and selection in place.
export type SelectWallpaperReply =
  | { status: 'applied'; current: CurrentWallpaperPayload }
  | { status: 'superseded' }
  | { status: 'error'; error: string; message: string }
  | null;

export type BingWallAPI = {
  getCurrentWallpaper: () => Promise<CurrentWallpaperPayload>;
  getHistory: () => Promise<HistoryItemPayload[]>;
  selectWallpaper: (date: string) => Promise<SelectWallpaperReply>;
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Settings) => Promise<Settings>;
  refresh: () => Promise<RefreshResultPayload>;
  onRefreshResult: (callback: (result: RefreshResultPayload) => void) => void;
  getDataFolder: () => Promise<string>;
  chooseDataFolder: () => Promise<string | null>;
  relocateDataFolder: (newFolder: string) => Promise<string>;
  downloadWallpaper: (date: string) => Promise<string | null>;
};

import type { ImageResolution } from './bing.models.js';

export type Settings = {
  dailyAutoRefresh: boolean;
  resolutionOverride: ImageResolution | null;
};

export const DEFAULT_SETTINGS: Settings = {
  dailyAutoRefresh: true,
  resolutionOverride: null,
};

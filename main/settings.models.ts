import type { ImageResolution, Market } from './bing.models.js';

export type Settings = {
  dailyAutoRefresh: boolean;
  resolutionOverride: ImageResolution | null;
  market: Market;
};

export const DEFAULT_SETTINGS: Settings = {
  dailyAutoRefresh: true,
  resolutionOverride: null,
  market: 'de-CH',
};

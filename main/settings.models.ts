import type { ImageResolution, Market } from './bing.models.js';

export type Settings = {
  dailyAutoRefresh: boolean;
  resolutionOverride: ImageResolution | null;
  market: Market;
  startMinimized: boolean;
};

// The settings as they were before an update and as it wrote them.
export type SettingsUpdate = {
  previous: Settings;
  next: Settings;
};

// Returns the settings to write, or null to leave them as they are.
export type SettingsUpdater = (current: Settings) => Settings | null;

export const DEFAULT_SETTINGS: Settings = {
  dailyAutoRefresh: true,
  resolutionOverride: null,
  market: 'de-CH',
  startMinimized: true,
};

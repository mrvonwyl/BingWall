import { ApplyFailedError } from './applier/applierHost.js';

const HTTP_STATUS_PATTERN = /HTTP \d+/;

export function describeRefreshError(error: unknown): string {
  if (error instanceof ApplyFailedError) {
    return `Could not apply the wallpaper: ${error.message}`;
  }
  if (error instanceof Error) {
    if (HTTP_STATUS_PATTERN.test(error.message)) {
      return `Bing API error: ${error.message}`;
    }
    return `Network error: ${error.message}`;
  }
  return 'Unknown error during refresh.';
}

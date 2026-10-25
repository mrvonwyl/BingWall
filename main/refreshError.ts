import type { ApplierError } from './applier/applier.models.js';
import { ApplyFailedError } from './applier/applierHost.js';

const HTTP_STATUS_PATTERN = /HTTP \d+/;

// The banner text for a failed apply. History selection and every refresh share it.
function describeApplyError(outcome: ApplierError, fallback: string): string {
  switch (outcome.error) {
    case 'os-rejected':
      return outcome.code === undefined
        ? 'Windows rejected the wallpaper.'
        : `Windows rejected the wallpaper (error ${outcome.code}).`;
    case 'applier-unavailable':
      return (
        "BingWall's wallpaper helper isn't working, so the wallpaper wasn't changed. " +
        'Try reinstalling BingWall, or check whether your antivirus blocked it.'
      );
    case 'timeout':
      return 'Applying the wallpaper took too long and was cancelled. Please try again.';
    default:
      return `Could not apply the wallpaper: ${fallback}`;
  }
}

export function describeRefreshError(error: unknown): string {
  if (error instanceof ApplyFailedError) {
    return describeApplyError(error.outcome, error.message);
  }
  if (error instanceof Error) {
    if (HTTP_STATUS_PATTERN.test(error.message)) {
      return `Bing API error: ${error.message}`;
    }
    return `Network error: ${error.message}`;
  }
  return 'Unknown error during refresh.';
}

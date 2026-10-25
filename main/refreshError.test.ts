import { describe, expect, it } from 'vitest';
import { ApplyFailedError } from './applier/applierHost.js';
import { describeRefreshError } from './refreshError.js';

describe('describeRefreshError', () => {
  it('labels HTTP-status errors as a Bing API error', () => {
    const result = describeRefreshError(new Error('HPImageArchive request failed for market de-CH: HTTP 500'));

    expect(result).toBe('Bing API error: HPImageArchive request failed for market de-CH: HTTP 500');
  });

  it('says Windows rejected the wallpaper, with its error code', () => {
    const result = describeRefreshError(new ApplyFailedError({ kind: 'error', error: 'os-rejected', code: 1813 }));

    expect(result).toBe('Windows rejected the wallpaper (error 1813).');
  });

  it('suggests reinstalling or checking antivirus when the applier is unavailable', () => {
    const result = describeRefreshError(
      new ApplyFailedError({ kind: 'error', error: 'applier-unavailable', message: 'The wallpaper applier died twice' }),
    );

    expect(result).toBe(
      "BingWall's wallpaper helper isn't working, so the wallpaper wasn't changed. " +
        'Try reinstalling BingWall, or check whether your antivirus blocked it.',
    );
  });

  it('says the apply took too long on timeout', () => {
    const result = describeRefreshError(new ApplyFailedError({ kind: 'error', error: 'timeout' }));

    expect(result).toBe('Applying the wallpaper took too long and was cancelled. Please try again.');
  });

  it('labels other apply failures as such, not as a network error', () => {
    const result = describeRefreshError(new ApplyFailedError({ kind: 'error', error: 'backend-failed', message: 'boom' }));

    expect(result).toBe('Could not apply the wallpaper: boom');
  });

  it('labels other Error instances as a network error', () => {
    const result = describeRefreshError(new Error('fetch failed'));

    expect(result).toBe('Network error: fetch failed');
  });

  it('falls back to a generic message for non-Error values', () => {
    const result = describeRefreshError('boom');

    expect(result).toBe('Unknown error during refresh.');
  });
});

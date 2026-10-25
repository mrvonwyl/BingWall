import { describe, expect, it } from 'vitest';
import { ApplyFailedError } from './applier/applierHost.js';
import { describeRefreshError } from './refreshError.js';

describe('describeRefreshError', () => {
  it('labels HTTP-status errors as a Bing API error', () => {
    const result = describeRefreshError(new Error('HPImageArchive request failed for market de-CH: HTTP 500'));

    expect(result).toBe('Bing API error: HPImageArchive request failed for market de-CH: HTTP 500');
  });

  it('labels a failed wallpaper apply as such, not as a network error', () => {
    const result = describeRefreshError(new ApplyFailedError({ kind: 'error', error: 'os-rejected', code: 1813 }));

    expect(result).toBe('Could not apply the wallpaper: os-rejected (code 1813)');
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

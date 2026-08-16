import { describe, expect, it, vi } from 'vitest';
import { getCurrentWallpaper } from './currentWallpaper.js';
import type { GetCurrentWallpaperDeps } from './currentWallpaper.models.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

describe('getCurrentWallpaper', () => {
  it('returns the newest entry with its image path', async () => {
    const deps: GetCurrentWallpaperDeps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      readMetadata: vi.fn(async () => [entry('2026-08-16'), entry('2026-08-15')]),
    };

    const result = await getCurrentWallpaper(deps);

    expect(result).toEqual({
      metadata: entry('2026-08-16'),
      imagePath: 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg',
    });
  });

  it('returns null when there is no stored metadata yet', async () => {
    const deps: GetCurrentWallpaperDeps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      readMetadata: vi.fn(async () => []),
    };

    const result = await getCurrentWallpaper(deps);

    expect(result).toBeNull();
  });
});

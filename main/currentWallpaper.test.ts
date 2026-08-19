import { describe, expect, it, vi } from 'vitest';
import { getCurrentWallpaper } from './currentWallpaper.js';
import type { GetCurrentWallpaperDeps } from './currentWallpaper.models.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

describe('getCurrentWallpaper', () => {
  it('returns the newest entry with its image path when there is no recorded state', async () => {
    const deps: GetCurrentWallpaperDeps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      readMetadata: vi.fn(async () => [entry('2026-08-16'), entry('2026-08-15')]),
      readState: vi.fn(async () => null),
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
      readState: vi.fn(async () => null),
    };

    const result = await getCurrentWallpaper(deps);

    expect(result).toBeNull();
  });

  it('returns the entry matching the recorded state instead of the newest one', async () => {
    const deps: GetCurrentWallpaperDeps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      readMetadata: vi.fn(async () => [entry('2026-08-16'), entry('2026-08-15')]),
      readState: vi.fn(async () => ({ selectedDate: '2026-08-15' })),
    };

    const result = await getCurrentWallpaper(deps);

    expect(result).toEqual({
      metadata: entry('2026-08-15'),
      imagePath: 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-15.jpg',
    });
  });

  it('falls back to the newest entry when the recorded state date is no longer in history', async () => {
    const deps: GetCurrentWallpaperDeps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      readMetadata: vi.fn(async () => [entry('2026-08-16'), entry('2026-08-15')]),
      readState: vi.fn(async () => ({ selectedDate: '2026-01-01' })),
    };

    const result = await getCurrentWallpaper(deps);

    expect(result).toEqual({
      metadata: entry('2026-08-16'),
      imagePath: 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg',
    });
  });
});

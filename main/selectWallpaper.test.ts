import { describe, expect, it, vi } from 'vitest';
import { selectWallpaper } from './selectWallpaper.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

describe('selectWallpaper', () => {
  it('sets the wallpaper for the matching date and returns its metadata', async () => {
    const setWallpaper = vi.fn(async () => undefined);
    const deps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      readMetadata: vi.fn(async () => [entry('2026-08-16'), entry('2026-08-15')]),
      setWallpaper,
    };

    const result = await selectWallpaper('2026-08-15', deps);

    expect(setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-15.jpg');
    expect(result).toEqual({
      metadata: entry('2026-08-15'),
      imagePath: 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-15.jpg',
    });
  });

  it('returns null and does not touch the wallpaper when the date is not in history', async () => {
    const setWallpaper = vi.fn(async () => undefined);
    const deps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      readMetadata: vi.fn(async () => [entry('2026-08-16')]),
      setWallpaper,
    };

    const result = await selectWallpaper('2026-01-01', deps);

    expect(result).toBeNull();
    expect(setWallpaper).not.toHaveBeenCalled();
  });
});

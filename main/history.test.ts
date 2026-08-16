import { describe, expect, it, vi } from 'vitest';
import { getHistory, pruneOrphanedImages } from './history.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

describe('getHistory', () => {
  it('returns each retained entry with its image path, in metadata order', async () => {
    const readMetadata = vi.fn(async () => [entry('2026-08-16'), entry('2026-08-15')]);

    const result = await getHistory({ dataFolder: 'C:\\fake\\Pictures\\BingWallpapers', readMetadata });

    expect(result).toEqual([
      { metadata: entry('2026-08-16'), imagePath: 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg' },
      { metadata: entry('2026-08-15'), imagePath: 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-15.jpg' },
    ]);
  });
});

describe('pruneOrphanedImages', () => {
  it('deletes image files that have no matching metadata entry', async () => {
    const deleteImage = vi.fn(async () => undefined);
    const deps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      entries: [entry('2026-08-16')],
      listImageDates: vi.fn(async () => ['2026-08-16', '2026-08-01']),
      deleteImage,
    };

    const orphaned = await pruneOrphanedImages(deps);

    expect(orphaned).toEqual(['2026-08-01']);
    expect(deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-01');
    expect(deleteImage).toHaveBeenCalledTimes(1);
  });

  it('deletes nothing when every image on disk is still retained', async () => {
    const deleteImage = vi.fn(async () => undefined);
    const deps = {
      dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
      entries: [entry('2026-08-16')],
      listImageDates: vi.fn(async () => ['2026-08-16']),
      deleteImage,
    };

    const orphaned = await pruneOrphanedImages(deps);

    expect(orphaned).toEqual([]);
    expect(deleteImage).not.toHaveBeenCalled();
  });
});

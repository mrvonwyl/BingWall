import { describe, expect, it, vi } from 'vitest';
import { buildDownloadFilename, downloadWallpaper } from './download.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(overrides: Partial<StoredImageMetadata> = {}): StoredImageMetadata {
  return {
    date: '2026-08-16',
    title: 'A Snowy Mountain',
    description: 'desc',
    copyright: '© someone',
    copyrightlink: 'https://example.com',
    ...overrides,
  };
}

describe('buildDownloadFilename', () => {
  it('combines date and title into a .jpg filename', () => {
    expect(buildDownloadFilename(entry())).toBe('2026-08-16_A Snowy Mountain.jpg');
  });

  it('strips filesystem-unsafe characters from the title', () => {
    expect(buildDownloadFilename(entry({ title: 'Foo: Bar/Baz*Qux?' }))).toBe('2026-08-16_Foo Bar Baz Qux.jpg');
  });
});

describe('downloadWallpaper', () => {
  it('copies the image file into the downloads folder under the sanitized filename', async () => {
    const copyFile = vi.fn(async () => undefined);

    const result = await downloadWallpaper(entry(), 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg', {
      downloadsFolder: 'C:\\fake\\Downloads',
      copyFile,
    });

    expect(result).toEqual({ destinationPath: 'C:\\fake\\Downloads\\2026-08-16_A Snowy Mountain.jpg' });
    expect(copyFile).toHaveBeenCalledWith(
      'C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg',
      'C:\\fake\\Downloads\\2026-08-16_A Snowy Mountain.jpg',
    );
  });
});

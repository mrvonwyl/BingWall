import { describe, expect, it, vi } from 'vitest';
import { runDailyUpdate } from './pipeline.js';
import type { RunDailyUpdateDeps } from './pipeline.models.js';
import type { HPImageArchiveResponse } from './bing.models.js';

const sampleResponse: HPImageArchiveResponse = {
  images: [
    {
      startdate: '20260816',
      urlbase: '/th?id=OHR.Sample_EN-US1234567890',
      copyright: 'Sample place (© Someone)',
      copyrightlink: 'https://www.bing.com/search?q=sample',
      title: 'Sample title',
    },
  ],
};

function buildDeps(overrides: Partial<RunDailyUpdateDeps> = {}): RunDailyUpdateDeps {
  return {
    fetchImpl: vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleResponse,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })),
    display: { width: 3840, height: 2160 },
    dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
    readMetadata: vi.fn(async () => []),
    writeMetadata: vi.fn(async () => undefined),
    saveImage: vi.fn(async (folder: string, date: string) => `${folder}\\${date}.jpg`),
    setWallpaper: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('runDailyUpdate', () => {
  it('fetches, stores, and sets today\'s image as the wallpaper', async () => {
    const deps = buildDeps();

    const result = await runDailyUpdate(deps);

    expect(deps.saveImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-16', expect.any(ArrayBuffer));
    expect(deps.writeMetadata).toHaveBeenCalledWith(
      deps.dataFolder,
      expect.arrayContaining([expect.objectContaining({ date: '2026-08-16', title: 'Sample title' })]),
    );
    expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
    expect(result.metadata.date).toBe('2026-08-16');
    expect(result.imagePath).toBe('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
  });
});

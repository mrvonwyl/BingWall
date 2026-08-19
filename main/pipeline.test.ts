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

const multiDayResponse: HPImageArchiveResponse = {
  images: [
    {
      startdate: '20260816',
      urlbase: '/th?id=OHR.Newest_EN-US1234567890',
      copyright: 'Newest place (© Someone)',
      copyrightlink: 'https://www.bing.com/search?q=newest',
      title: 'Newest title',
    },
    {
      startdate: '20260815',
      urlbase: '/th?id=OHR.Middle_EN-US1234567890',
      copyright: 'Middle place (© Someone)',
      copyrightlink: 'https://www.bing.com/search?q=middle',
      title: 'Middle title',
    },
    {
      startdate: '20260814',
      urlbase: '/th?id=OHR.Oldest_EN-US1234567890',
      copyright: 'Oldest place (© Someone)',
      copyrightlink: 'https://www.bing.com/search?q=oldest',
      title: 'Oldest title',
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
    resolutionOverride: null,
    dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
    dailyAutoRefresh: true,
    readMetadata: vi.fn(async () => []),
    writeMetadata: vi.fn(async () => undefined),
    saveImage: vi.fn(async (folder: string, date: string) => `${folder}\\${date}.jpg`),
    setWallpaper: vi.fn(async () => undefined),
    listImageDates: vi.fn(async () => ['2026-08-16']),
    deleteImage: vi.fn(async () => undefined),
    writeState: vi.fn(async () => undefined),
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

  it('prunes image files that dropped out of retained metadata', async () => {
    const deps = buildDeps({ listImageDates: vi.fn(async () => ['2026-08-16', '2026-08-01']) });

    await runDailyUpdate(deps);

    expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-01');
    expect(deps.deleteImage).not.toHaveBeenCalledWith(deps.dataFolder, '2026-08-16');
  });

  it('applies the wallpaper and records state when daily auto-refresh is on', async () => {
    const deps = buildDeps({ dailyAutoRefresh: true });

    const result = await runDailyUpdate(deps);

    expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
    expect(deps.writeState).toHaveBeenCalledWith(deps.dataFolder, { selectedDate: '2026-08-16' });
    expect(result.wallpaperChanged).toBe(true);
  });

  it('requests the overridden resolution instead of the one inferred from the display', async () => {
    const deps = buildDeps({ resolutionOverride: '1280x720' });

    await runDailyUpdate(deps);

    expect(deps.fetchImpl).toHaveBeenCalledWith(expect.stringContaining('_1280x720.jpg'));
  });

  it('fetches and stores the image but leaves the wallpaper alone when daily auto-refresh is off', async () => {
    const deps = buildDeps({ dailyAutoRefresh: false });

    const result = await runDailyUpdate(deps);

    expect(deps.saveImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-16', expect.any(ArrayBuffer));
    expect(deps.setWallpaper).not.toHaveBeenCalled();
    expect(deps.writeState).not.toHaveBeenCalled();
    expect(result.wallpaperChanged).toBe(false);
  });

  it('backfills every image Bing returns, not just the newest', async () => {
    const deps = buildDeps({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => multiDayResponse,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
      readMetadata: vi.fn(async () => []),
      listImageDates: vi.fn(async () => []),
    });

    const result = await runDailyUpdate(deps);

    expect(deps.saveImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-16', expect.any(ArrayBuffer));
    expect(deps.saveImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-15', expect.any(ArrayBuffer));
    expect(deps.saveImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-14', expect.any(ArrayBuffer));
    expect(deps.writeMetadata).toHaveBeenCalledWith(
      deps.dataFolder,
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-08-16' }),
        expect.objectContaining({ date: '2026-08-15' }),
        expect.objectContaining({ date: '2026-08-14' }),
      ]),
    );
    expect(result.metadata.date).toBe('2026-08-16');
  });

  it('does not re-download images that are already stored', async () => {
    const deps = buildDeps({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => multiDayResponse,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
      readMetadata: vi.fn(async () => [
        { date: '2026-08-15', title: 'Middle title', description: 'Middle place', copyright: '© Someone', copyrightlink: 'https://www.bing.com/search?q=middle' },
        { date: '2026-08-14', title: 'Oldest title', description: 'Oldest place', copyright: '© Someone', copyrightlink: 'https://www.bing.com/search?q=oldest' },
      ]),
      listImageDates: vi.fn(async () => ['2026-08-15', '2026-08-14']),
    });

    await runDailyUpdate(deps);

    expect(deps.saveImage).toHaveBeenCalledTimes(1);
    expect(deps.saveImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-16', expect.any(ArrayBuffer));
  });
});

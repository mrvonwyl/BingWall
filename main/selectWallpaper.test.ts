import { describe, expect, it, vi } from 'vitest';
import type { ApplyOutcome } from './applier/applier.models.js';
import { selectWallpaper } from './selectWallpaper.js';
import type { SelectWallpaperDeps } from './selectWallpaper.models.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

function buildDeps(outcome: ApplyOutcome, dates = ['2026-08-16', '2026-08-15']) {
  return {
    dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
    readMetadata: vi.fn(async () => dates.map(entry)),
    setWallpaper: vi.fn(async (): Promise<ApplyOutcome> => outcome),
    writeState: vi.fn(async () => undefined),
  } satisfies SelectWallpaperDeps;
}

describe('selectWallpaper', () => {
  it('applies the wallpaper for the matching date, records it, and returns its metadata', async () => {
    const deps = buildDeps({ kind: 'applied' });

    const result = await selectWallpaper('2026-08-15', deps);

    expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-15.jpg');
    expect(deps.writeState).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers', { selectedDate: '2026-08-15' });
    expect(result).toEqual({
      status: 'applied',
      metadata: entry('2026-08-15'),
      imagePath: 'C:\\fake\\Pictures\\BingWallpapers\\2026-08-15.jpg',
    });
  });

  it('writes no state and reports superseded when a newer request replaced this one', async () => {
    const deps = buildDeps({ kind: 'superseded' });

    const result = await selectWallpaper('2026-08-15', deps);

    expect(deps.writeState).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'superseded' });
  });

  it('keeps the last applied selection and returns the typed error when the apply fails', async () => {
    const deps = buildDeps({ kind: 'error', error: 'os-rejected', code: 1813 });

    const result = await selectWallpaper('2026-08-15', deps);

    expect(deps.writeState).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'error', error: { kind: 'error', error: 'os-rejected', code: 1813 } });
  });

  it('returns null and does not touch the wallpaper when the date is not in history', async () => {
    const deps = buildDeps({ kind: 'applied' }, ['2026-08-16']);

    const result = await selectWallpaper('2026-01-01', deps);

    expect(result).toBeNull();
    expect(deps.setWallpaper).not.toHaveBeenCalled();
    expect(deps.writeState).not.toHaveBeenCalled();
  });
});

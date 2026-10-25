import { describe, expect, it, vi } from 'vitest';
import type { ApplyOutcome } from './applier/applier.models.js';
import { selectWallpaper } from './selectWallpaper.js';
import type { SelectWallpaperDeps } from './selectWallpaper.models.js';
import type { Settings } from './settings.models.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

const AUTO_REFRESH_OFF: Settings = { dailyAutoRefresh: false, resolutionOverride: 'UHD', market: 'en-GB' };
const AUTO_REFRESH_ON: Settings = { ...AUTO_REFRESH_OFF, dailyAutoRefresh: true };

function buildDeps(outcome: ApplyOutcome, dates = ['2026-08-16', '2026-08-15'], settings = AUTO_REFRESH_OFF) {
  return {
    dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
    readMetadata: vi.fn(async () => dates.map(entry)),
    setWallpaper: vi.fn(async (): Promise<ApplyOutcome> => outcome),
    writeState: vi.fn(async () => undefined),
    readSettings: vi.fn(async () => settings),
    writeSettings: vi.fn(async () => undefined),
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
      updatedSettings: null,
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

  describe('daily auto-refresh switch-off', () => {
    it('turns daily auto-refresh off when an older date is applied, keeping the other settings', async () => {
      const deps = buildDeps({ kind: 'applied' }, ['2026-08-16', '2026-08-15'], AUTO_REFRESH_ON);

      const result = await selectWallpaper('2026-08-15', deps);

      expect(deps.writeSettings).toHaveBeenCalledTimes(1);
      expect(deps.writeSettings).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers', AUTO_REFRESH_OFF);
      expect(result).toMatchObject({ status: 'applied', updatedSettings: AUTO_REFRESH_OFF });
    });

    it('treats the newest date as today regardless of the stored order', async () => {
      const deps = buildDeps({ kind: 'applied' }, ['2026-08-14', '2026-08-16', '2026-08-15'], AUTO_REFRESH_ON);

      const result = await selectWallpaper('2026-08-14', deps);

      expect(deps.writeSettings).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers', AUTO_REFRESH_OFF);
      expect(result).toMatchObject({ status: 'applied', updatedSettings: AUTO_REFRESH_OFF });
    });

    it('leaves the settings alone when the newest date is applied', async () => {
      const deps = buildDeps({ kind: 'applied' }, ['2026-08-15', '2026-08-16'], AUTO_REFRESH_ON);

      const result = await selectWallpaper('2026-08-16', deps);

      expect(deps.writeSettings).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'applied', updatedSettings: null });
    });

    it('writes nothing when daily auto-refresh is already off', async () => {
      const deps = buildDeps({ kind: 'applied' }, ['2026-08-16', '2026-08-15'], AUTO_REFRESH_OFF);

      const result = await selectWallpaper('2026-08-15', deps);

      expect(deps.writeSettings).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'applied', updatedSettings: null });
    });

    it.each<ApplyOutcome>([
      { kind: 'error', error: 'os-rejected', code: 1813 },
      { kind: 'superseded' },
    ])('writes nothing when the apply outcome is ', async (outcome) => {
      const deps = buildDeps(outcome, ['2026-08-16', '2026-08-15'], AUTO_REFRESH_ON);

      await selectWallpaper('2026-08-15', deps);

      expect(deps.writeSettings).not.toHaveBeenCalled();
    });

    it('writes nothing when the date is not in history', async () => {
      const deps = buildDeps({ kind: 'applied' }, ['2026-08-16', '2026-08-15'], AUTO_REFRESH_ON);

      const result = await selectWallpaper('2026-01-01', deps);

      expect(result).toBeNull();
      expect(deps.writeSettings).not.toHaveBeenCalled();
    });

    it('records the selection before switching auto-refresh off', async () => {
      const deps = buildDeps({ kind: 'applied' }, ['2026-08-16', '2026-08-15'], AUTO_REFRESH_ON);

      await selectWallpaper('2026-08-15', deps);

      expect(deps.writeState.mock.invocationCallOrder[0]).toBeLessThan(deps.writeSettings.mock.invocationCallOrder[0]);
    });
  });
});
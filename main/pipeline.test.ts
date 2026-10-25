import { describe, expect, it, vi } from 'vitest';
import { runDailyUpdate } from './pipeline.js';
import type { RunDailyUpdateDeps } from './pipeline.models.js';
import type { HPImageArchiveResponse } from './bing.models.js';
import type { ApplyOutcome } from './applier/applier.models.js';
import { ApplyFailedError } from './applier/applierHost.js';

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

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A fake fetch whose image downloads only finish when the test says so, keyed by the image's name.
function gatedFetch(response: HPImageArchiveResponse) {
  const gates = new Map<string, Deferred<ArrayBuffer>>();
  const gateFor = (name: string) => {
    let gate = gates.get(name);
    if (!gate) {
      gate = deferred<ArrayBuffer>();
      gates.set(name, gate);
    }
    return gate;
  };
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.includes('HPImageArchive')) {
      return { ok: true, status: 200, json: async () => response, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const name = /OHR\.(\w+)_/.exec(url)?.[1] ?? url;
    return { ok: true, status: 200, json: async () => ({}), arrayBuffer: () => gateFor(name).promise };
  });
  const imageRequests = () => fetchImpl.mock.calls.filter(([url]) => !url.includes('HPImageArchive')).length;
  return { fetchImpl, gateFor, imageRequests };
}

function buildDeps(overrides: Partial<RunDailyUpdateDeps> = {}): RunDailyUpdateDeps {
  return {
    fetchImpl: vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sampleResponse,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })),
    market: 'de-CH',
    replaceExisting: false,
    resolutionOverride: null,
    dataFolder: 'C:\\fake\\Pictures\\BingWallpapers',
    dailyAutoRefresh: true,
    readMetadata: vi.fn(async () => []),
    writeMetadata: vi.fn(async () => undefined),
    saveImage: vi.fn(async (folder: string, date: string) => `${folder}\\${date}.jpg`),
    setWallpaper: vi.fn(async (): Promise<ApplyOutcome> => ({ kind: 'applied' })),
    listImageDates: vi.fn(async () => ['2026-08-16']),
    deleteImage: vi.fn(async () => undefined),
    readState: vi.fn(async () => null),
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

  it('writes no state when a newer apply superseded the refresh apply', async () => {
    const deps = buildDeps({ setWallpaper: vi.fn(async (): Promise<ApplyOutcome> => ({ kind: 'superseded' })) });

    const result = await runDailyUpdate(deps);

    expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
    expect(deps.writeState).not.toHaveBeenCalled();
    expect(result.wallpaperChanged).toBe(false);
  });

  it('fails with the typed apply error and keeps the last applied selection when the apply fails', async () => {
    const deps = buildDeps({
      setWallpaper: vi.fn(async (): Promise<ApplyOutcome> => ({ kind: 'error', error: 'os-rejected', code: 1813 })),
    });

    const rejection = await runDailyUpdate(deps).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ApplyFailedError);
    expect((rejection as ApplyFailedError).outcome).toEqual({ kind: 'error', error: 'os-rejected', code: 1813 });
    expect(deps.writeState).not.toHaveBeenCalled();
  });

  it('downloads UHD images when no resolution override is set', async () => {
    const deps = buildDeps();

    await runDailyUpdate(deps);

    expect(deps.fetchImpl).toHaveBeenCalledWith(expect.stringContaining('_UHD.jpg'), expect.anything());
  });

  it('requests the overridden resolution instead of UHD', async () => {
    const deps = buildDeps({ resolutionOverride: '1280x720' });

    await runDailyUpdate(deps);

    expect(deps.fetchImpl).toHaveBeenCalledWith(expect.stringContaining('_1280x720.jpg'), expect.anything());
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

  it('stores backfilled images newest first', async () => {
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

    await runDailyUpdate(deps);

    const writtenEntries = (deps.writeMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as { date: string }[];
    expect(writtenEntries.map((entry) => entry.date)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14']);
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

  it('downloads every image in parallel and applies the target as soon as it lands', async () => {
    const gated = gatedFetch(multiDayResponse);
    const deps = buildDeps({ fetchImpl: gated.fetchImpl, listImageDates: vi.fn(async () => []) });

    const run = runDailyUpdate(deps);

    await vi.waitFor(() => expect(gated.imageRequests()).toBe(3));
    expect(deps.setWallpaper).not.toHaveBeenCalled();

    gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
    await vi.waitFor(() =>
      expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg'),
    );
    expect(deps.writeMetadata).not.toHaveBeenCalled();

    gated.gateFor('Middle').resolve(new Uint8Array([2]).buffer);
    gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);
    await run;

    expect(deps.setWallpaper).toHaveBeenCalledTimes(1);
    const writtenEntries = (deps.writeMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as { date: string }[];
    expect(writtenEntries.map((entry) => entry.date)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14']);
  });

  it('saves no file for an image whose download fails', async () => {
    const gated = gatedFetch(multiDayResponse);
    const deps = buildDeps({ fetchImpl: gated.fetchImpl, listImageDates: vi.fn(async () => []) });
    gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
    gated.gateFor('Middle').reject(new Error('connection reset'));
    gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

    await runDailyUpdate(deps).catch(() => undefined);

    expect(deps.saveImage).not.toHaveBeenCalledWith(deps.dataFolder, '2026-08-15', expect.anything());
    expect(deps.saveImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-16', expect.any(ArrayBuffer));
  });

  it('still applies the target, saves the rest and reports the dates that failed when a non-target download fails', async () => {
    const gated = gatedFetch(multiDayResponse);
    const deps = buildDeps({
      fetchImpl: gated.fetchImpl,
      replaceExisting: true,
      readMetadata: vi.fn(async () => [
        { date: '2026-08-15', title: 'Old market title', description: 'Old place', copyright: '© Someone', copyrightlink: 'https://www.bing.com/search?q=old' },
      ]),
      listImageDates: vi.fn(async () => ['2026-08-16', '2026-08-15', '2026-08-14']),
    });
    gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
    gated.gateFor('Middle').reject(new Error('connection reset'));
    gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

    const result = await runDailyUpdate(deps);

    expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
    expect(deps.writeState).toHaveBeenCalledWith(deps.dataFolder, { selectedDate: '2026-08-16' });
    expect(result.failedDates).toEqual(['2026-08-15']);
    const writtenEntries = (deps.writeMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as { date: string }[];
    expect(writtenEntries.map((entry) => entry.date)).toEqual(['2026-08-16', '2026-08-14']);
    expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-15');
    expect(deps.deleteImage).toHaveBeenCalledTimes(1);
  });

  it('applies nothing and fails when the target download fails', async () => {
    const gated = gatedFetch(multiDayResponse);
    const deps = buildDeps({ fetchImpl: gated.fetchImpl, listImageDates: vi.fn(async () => []) });
    gated.gateFor('Newest').reject(new Error('connection reset'));
    gated.gateFor('Middle').resolve(new Uint8Array([2]).buffer);
    gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

    await expect(runDailyUpdate(deps)).rejects.toThrow('connection reset');

    expect(deps.setWallpaper).not.toHaveBeenCalled();
    expect(deps.writeState).not.toHaveBeenCalled();
  });

  it('never prunes the image currently applied, even when its date drops out of history', async () => {
    const gated = gatedFetch(multiDayResponse);
    const deps = buildDeps({
      fetchImpl: gated.fetchImpl,
      replaceExisting: true,
      dailyAutoRefresh: false,
      readState: vi.fn(async () => ({ selectedDate: '2026-08-15' })),
      readMetadata: vi.fn(async () => [
        { date: '2026-08-15', title: 'Old market title', description: 'Old place', copyright: '© Someone', copyrightlink: 'https://www.bing.com/search?q=old' },
      ]),
      listImageDates: vi.fn(async () => ['2026-08-16', '2026-08-15', '2026-08-14']),
    });
    gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
    gated.gateFor('Middle').reject(new Error('connection reset'));
    gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

    await expect(runDailyUpdate(deps)).rejects.toThrow('connection reset');

    expect(deps.setWallpaper).not.toHaveBeenCalled();
    const writtenEntries = (deps.writeMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as { date: string }[];
    expect(writtenEntries.map((entry) => entry.date)).toEqual(['2026-08-16', '2026-08-14']);
    expect(deps.deleteImage).not.toHaveBeenCalled();
  });

  describe('abort', () => {
    it('writes no files, metadata or state and applies nothing once aborted mid-download', async () => {
      const gated = gatedFetch(multiDayResponse);
      const controller = new AbortController();
      const deps = buildDeps({ fetchImpl: gated.fetchImpl, listImageDates: vi.fn(async () => []), signal: controller.signal });

      const run = runDailyUpdate(deps);
      await vi.waitFor(() => expect(gated.imageRequests()).toBe(3));
      controller.abort();
      gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
      gated.gateFor('Middle').resolve(new Uint8Array([2]).buffer);
      gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

      await expect(run).rejects.toThrow();
      expect(deps.saveImage).not.toHaveBeenCalled();
      expect(deps.setWallpaper).not.toHaveBeenCalled();
      expect(deps.writeState).not.toHaveBeenCalled();
      expect(deps.writeMetadata).not.toHaveBeenCalled();
      expect(deps.deleteImage).not.toHaveBeenCalled();
    });

    it('settles without waiting for downloads that ignore the abort', async () => {
      const gated = gatedFetch(multiDayResponse);
      const controller = new AbortController();
      const deps = buildDeps({ fetchImpl: gated.fetchImpl, listImageDates: vi.fn(async () => []), signal: controller.signal });

      const run = runDailyUpdate(deps);
      await vi.waitFor(() => expect(gated.imageRequests()).toBe(3));
      controller.abort();

      await expect(run).rejects.toThrow();
    });

    it('saves no more images and no metadata when aborted after the target was applied', async () => {
      const gated = gatedFetch(multiDayResponse);
      const controller = new AbortController();
      const deps = buildDeps({ fetchImpl: gated.fetchImpl, listImageDates: vi.fn(async () => []), signal: controller.signal });

      const run = runDailyUpdate(deps);
      gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
      await vi.waitFor(() => expect(deps.setWallpaper).toHaveBeenCalledTimes(1));
      controller.abort();
      gated.gateFor('Middle').resolve(new Uint8Array([2]).buffer);
      gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

      await expect(run).rejects.toThrow();
      expect(deps.saveImage).toHaveBeenCalledTimes(1);
      expect(deps.writeMetadata).not.toHaveBeenCalled();
      expect(deps.deleteImage).not.toHaveBeenCalled();
    });

    it('passes the abort signal on to every request', async () => {
      const controller = new AbortController();
      const deps = buildDeps({ signal: controller.signal });

      await runDailyUpdate(deps);

      for (const call of (deps.fetchImpl as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[1]).toEqual({ signal: controller.signal });
      }
    });
  });

  describe('market switch (replaceExisting)', () => {
    function switchDeps(overrides: Partial<RunDailyUpdateDeps>) {
      return buildDeps({
        fetchImpl: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => multiDayResponse,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        })),
        replaceExisting: true,
        readMetadata: vi.fn(async () => [
          { date: '2026-08-15', title: 'Old market title', description: 'Old place', copyright: '© Someone', copyrightlink: 'https://www.bing.com/search?q=old' },
        ]),
        listImageDates: vi.fn(async () => ['2026-08-15']),
        ...overrides,
      });
    }

    it('re-applies the selected date\'s new image when daily auto-refresh is off', async () => {
      const deps = switchDeps({ dailyAutoRefresh: false, readState: vi.fn(async () => ({ selectedDate: '2026-08-15' })) });

      const result = await runDailyUpdate(deps);

      expect(deps.setWallpaper).toHaveBeenCalledTimes(1);
      expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-15.jpg');
      expect(deps.writeState).toHaveBeenCalledWith(deps.dataFolder, { selectedDate: '2026-08-15' });
      expect(result.wallpaperChanged).toBe(true);
    });

    it('applies the newest image when auto-refresh is off and the selected date is not in the new market', async () => {
      const deps = switchDeps({ dailyAutoRefresh: false, readState: vi.fn(async () => ({ selectedDate: '2026-08-01' })) });

      await runDailyUpdate(deps);

      expect(deps.setWallpaper).toHaveBeenCalledTimes(1);
      expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
      expect(deps.writeState).toHaveBeenCalledWith(deps.dataFolder, { selectedDate: '2026-08-16' });
    });

    it('applies the newest image when daily auto-refresh is on, whatever date is selected', async () => {
      const deps = switchDeps({ dailyAutoRefresh: true, readState: vi.fn(async () => ({ selectedDate: '2026-08-15' })) });

      await runDailyUpdate(deps);

      expect(deps.setWallpaper).toHaveBeenCalledTimes(1);
      expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
    });
  });

  it('re-downloads already stored images when replaceExisting is set', async () => {
    const deps = buildDeps({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => multiDayResponse,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
      replaceExisting: true,
      readMetadata: vi.fn(async () => [
        { date: '2026-08-15', title: 'Old market title', description: 'Old place', copyright: '© Someone', copyrightlink: 'https://www.bing.com/search?q=old' },
      ]),
      listImageDates: vi.fn(async () => ['2026-08-15']),
    });

    await runDailyUpdate(deps);

    expect(deps.saveImage).toHaveBeenCalledTimes(3);
    const writtenEntries = (deps.writeMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as { date: string; title: string }[];
    expect(writtenEntries.map((entry) => entry.date)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14']);
    expect(writtenEntries.find((entry) => entry.date === '2026-08-15')?.title).toBe('Middle title');
  });
});

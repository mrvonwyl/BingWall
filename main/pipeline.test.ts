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

  it('leaves no download failure unhandled while it is still choosing the target', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const gated = gatedFetch(multiDayResponse);
      const deps = buildDeps({
        fetchImpl: gated.fetchImpl,
        replaceExisting: true,
        dailyAutoRefresh: false,
        readState: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error('state unreadable');
        }),
      });
      gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
      gated.gateFor('Middle').reject(new Error('connection reset'));
      gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

      await expect(runDailyUpdate(deps)).rejects.toThrow('state unreadable');
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('never prunes the image currently applied, and keeps its entry when its re-download fails', async () => {
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
    const writtenEntries = (deps.writeMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as { date: string; title: string }[];
    expect(writtenEntries.map((entry) => entry.date)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14']);
    expect(writtenEntries.find((entry) => entry.date === '2026-08-15')?.title).toBe('Old market title');
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

    it('does not settle until an apply already sent and its state write have settled', async () => {
      const gated = gatedFetch(sampleResponse);
      const controller = new AbortController();
      const applying = deferred<ApplyOutcome>();
      const events: string[] = [];
      const deps = buildDeps({
        fetchImpl: gated.fetchImpl,
        signal: controller.signal,
        setWallpaper: vi.fn(() => applying.promise),
        writeState: vi.fn(async () => {
          events.push('state written');
        }),
      });

      const run = runDailyUpdate(deps).then(
        () => events.push('settled'),
        () => events.push('settled'),
      );
      gated.gateFor('Sample').resolve(new Uint8Array([1]).buffer);
      await vi.waitFor(() => expect(deps.setWallpaper).toHaveBeenCalledTimes(1));
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(events).toEqual([]);

      applying.resolve({ kind: 'applied' });
      await run;

      expect(events).toEqual(['state written', 'settled']);
      expect(deps.writeState).toHaveBeenCalledWith(deps.dataFolder, { selectedDate: '2026-08-16' });
      expect(deps.writeMetadata).not.toHaveBeenCalled();
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

  describe('keeping the selected wallpaper in history', () => {
    const storedEntry = (date: string) => ({
      date,
      title: `Title ${date}`,
      description: `Place ${date}`,
      copyright: '© Someone',
      copyrightlink: `https://www.bing.com/search?q=${date}`,
    });

    // Bing's answer for a single day, as an `HPImageArchive` response.
    const dayResponse = (date: string): HPImageArchiveResponse => ({
      images: [
        {
          startdate: date.replaceAll('-', ''),
          urlbase: `/th?id=OHR.Day${date.replaceAll('-', '')}_EN-US1234567890`,
          copyright: `Place ${date} (© Someone)`,
          copyrightlink: `https://www.bing.com/search?q=${date}`,
          title: `Title ${date}`,
        },
      ],
    });

    const fetchFor = (response: HPImageArchiveResponse) =>
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => response,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }));

    const eightStored = () =>
      ['2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09', '2026-08-08'].map(
        storedEntry,
      );

    // An in-memory data folder: metadata, image files and state persist across runs.
    function memoryStore(entries: ReturnType<typeof storedEntry>[], selectedDate: string | null) {
      const store = {
        metadata: entries,
        files: new Set(entries.map((entry) => entry.date)),
        state: selectedDate ? { selectedDate } : null,
      };
      const deps: Partial<RunDailyUpdateDeps> = {
        readMetadata: vi.fn(async () => store.metadata),
        writeMetadata: vi.fn(async (_folder: string, written: ReturnType<typeof storedEntry>[]) => {
          store.metadata = written;
        }),
        saveImage: vi.fn(async (folder: string, date: string) => {
          store.files.add(date);
          return `${folder}\\${date}.jpg`;
        }),
        listImageDates: vi.fn(async () => [...store.files]),
        deleteImage: vi.fn(async (_folder: string, date: string) => {
          store.files.delete(date);
        }),
        readState: vi.fn(async () => store.state),
        writeState: vi.fn(async (_folder: string, state: { selectedDate: string }) => {
          store.state = state;
        }),
      };
      return { store, deps };
    }

    const writtenDates = (deps: RunDailyUpdateDeps) =>
      ((deps.writeMetadata as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as { date: string }[]).map(
        (entry) => entry.date,
      );

    it('keeps the selected oldest entry on top of the newest 8 when auto-refresh is off', async () => {
      const memory = memoryStore(eightStored(), '2026-08-08');
      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: fetchFor(dayResponse('2026-08-16')) });

      const result = await runDailyUpdate(deps);

      expect(writtenDates(deps)).toEqual([
        '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09',
        '2026-08-08',
      ]);
      expect(memory.store.metadata.at(-1)).toEqual(storedEntry('2026-08-08'));
      expect(deps.deleteImage).not.toHaveBeenCalledWith(deps.dataFolder, '2026-08-08');
      expect(deps.setWallpaper).not.toHaveBeenCalled();
      expect(result.wallpaperChanged).toBe(false);
    });

    it('keeps the selected entry over several back-to-back refreshes, at 9 entries', async () => {
      const memory = memoryStore(eightStored(), '2026-08-08');

      for (const date of ['2026-08-16', '2026-08-17', '2026-08-18']) {
        await runDailyUpdate(buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: fetchFor(dayResponse(date)) }));
      }

      expect(memory.store.metadata.map((entry) => entry.date)).toEqual([
        '2026-08-18', '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11',
        '2026-08-08',
      ]);
      expect(memory.store.files.has('2026-08-08')).toBe(true);
      expect(memory.deps.deleteImage).toHaveBeenCalledWith(expect.any(String), '2026-08-10');
    });

    it('keeps history at 8 when the selected date is among the newest 8', async () => {
      const memory = memoryStore(eightStored(), '2026-08-12');
      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: fetchFor(dayResponse('2026-08-16')) });

      await runDailyUpdate(deps);

      expect(writtenDates(deps)).toEqual([
        '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09',
      ]);
      expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-08');
    });

    it('trims the old pick once daily auto-refresh applies the new image', async () => {
      const memory = memoryStore(eightStored(), '2026-08-08');
      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: true, fetchImpl: fetchFor(dayResponse('2026-08-16')) });

      const result = await runDailyUpdate(deps);

      expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
      expect(memory.store.state).toEqual({ selectedDate: '2026-08-16' });
      expect(writtenDates(deps)).toHaveLength(8);
      expect(writtenDates(deps)).not.toContain('2026-08-08');
      expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-08');
      expect(result.wallpaperChanged).toBe(true);
    });

    it('trims the old entry normally once another date is selected', async () => {
      const memory = memoryStore(eightStored(), '2026-08-08');
      await runDailyUpdate(buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: fetchFor(dayResponse('2026-08-16')) }));
      memory.store.state = { selectedDate: '2026-08-14' };

      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: fetchFor(dayResponse('2026-08-17')) });
      await runDailyUpdate(deps);

      expect(writtenDates(deps)).toEqual([
        '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10',
      ]);
      expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-09');
      expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-08');
    });

    it('re-applies on a market switch as before and keeps whatever ends up selected', async () => {
      const memory = memoryStore(eightStored(), '2026-08-08');
      const deps = buildDeps({
        ...memory.deps,
        dailyAutoRefresh: false,
        replaceExisting: true,
        fetchImpl: fetchFor(multiDayResponse),
      });

      await runDailyUpdate(deps);

      expect(deps.setWallpaper).toHaveBeenCalledTimes(1);
      expect(deps.setWallpaper).toHaveBeenCalledWith('C:\\fake\\Pictures\\BingWallpapers\\2026-08-16.jpg');
      expect(memory.store.state).toEqual({ selectedDate: '2026-08-16' });
      expect(writtenDates(deps)).toHaveLength(8);
      expect(writtenDates(deps)[0]).toBe('2026-08-16');
      expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-08');
    });

    it('keeps the old selection on a market switch whose apply was superseded', async () => {
      const memory = memoryStore(eightStored(), '2026-08-08');
      const deps = buildDeps({
        ...memory.deps,
        dailyAutoRefresh: false,
        replaceExisting: true,
        fetchImpl: fetchFor(multiDayResponse),
        setWallpaper: vi.fn(async (): Promise<ApplyOutcome> => ({ kind: 'superseded' })),
      });

      await runDailyUpdate(deps);

      expect(memory.store.state).toEqual({ selectedDate: '2026-08-08' });
      expect(writtenDates(deps)).toHaveLength(9);
      expect(writtenDates(deps).at(-1)).toBe('2026-08-08');
      expect(deps.deleteImage).not.toHaveBeenCalledWith(deps.dataFolder, '2026-08-08');
    });

    it('keeps an entry selected while the trimmed metadata was being written', async () => {
      const memory = memoryStore(eightStored(), '2026-08-12');
      const writeMetadata = memory.deps.writeMetadata as ReturnType<typeof vi.fn>;
      const write = writeMetadata.getMockImplementation()!;
      writeMetadata.mockImplementationOnce(async (folder: string, written: ReturnType<typeof storedEntry>[]) => {
        // An explicit selection of the oldest entry lands mid-refresh.
        memory.store.state = { selectedDate: '2026-08-08' };
        await write(folder, written);
      });
      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: fetchFor(dayResponse('2026-08-16')) });

      await runDailyUpdate(deps);

      expect(memory.store.metadata.map((entry) => entry.date)).toEqual([
        '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10', '2026-08-09',
        '2026-08-08',
      ]);
      expect(memory.store.files.has('2026-08-08')).toBe(true);
      expect(deps.deleteImage).not.toHaveBeenCalled();
    });

    it('trims to 8 when there is no saved state', async () => {
      const memory = memoryStore(eightStored(), null);
      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: fetchFor(dayResponse('2026-08-16')) });

      await runDailyUpdate(deps);

      expect(writtenDates(deps)).toHaveLength(8);
      expect(writtenDates(deps)).not.toContain('2026-08-08');
      expect(deps.deleteImage).toHaveBeenCalledWith(deps.dataFolder, '2026-08-08');
    });

    it('keeps the selected entry when another download in the run fails', async () => {
      const gated = gatedFetch(multiDayResponse);
      const memory = memoryStore(eightStored().slice(2).concat(storedEntry('2026-08-01')), '2026-08-01');
      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: false, fetchImpl: gated.fetchImpl });
      gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
      gated.gateFor('Middle').reject(new Error('connection reset'));
      gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

      const result = await runDailyUpdate(deps);

      expect(result.failedDates).toEqual(['2026-08-15']);
      expect(writtenDates(deps)).toContain('2026-08-01');
      expect(deps.deleteImage).not.toHaveBeenCalledWith(deps.dataFolder, '2026-08-01');
    });

    it('keeps the selected entry whose own re-download failed when its image is already on disk', async () => {
      const gated = gatedFetch(multiDayResponse);
      const memory = memoryStore(eightStored(), '2026-08-15');
      const deps = buildDeps({ ...memory.deps, dailyAutoRefresh: false, replaceExisting: true, fetchImpl: gated.fetchImpl });
      gated.gateFor('Newest').resolve(new Uint8Array([1]).buffer);
      gated.gateFor('Middle').reject(new Error('connection reset'));
      gated.gateFor('Oldest').resolve(new Uint8Array([3]).buffer);

      await expect(runDailyUpdate(deps)).rejects.toThrow('connection reset');

      expect(deps.setWallpaper).not.toHaveBeenCalled();
      expect(writtenDates(deps)).toContain('2026-08-15');
      expect(memory.store.metadata.find((entry) => entry.date === '2026-08-15')).toEqual(storedEntry('2026-08-15'));
      expect(deps.deleteImage).not.toHaveBeenCalledWith(deps.dataFolder, '2026-08-15');
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

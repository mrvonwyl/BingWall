import { describe, expect, it, vi } from 'vitest';
import { createRefreshRunner } from './refreshRunner.js';
import { runDailyUpdate } from './pipeline.js';
import type { RefreshRun } from './refreshRunner.models.js';
import type { HPImageArchiveResponse, Market, StoredImageMetadata } from './bing.models.js';
import type { ApplyOutcome } from './applier/applier.models.js';
import type { WallpaperState } from './state.models.js';

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

// A run that settles when the test says so, or rejects with the signal's reason once aborted.
function scriptedRuns() {
  const calls: { replaceExisting: boolean; signal: AbortSignal; done: Deferred<string> }[] = [];
  const run = vi.fn((options: RefreshRun) => {
    const done = deferred<string>();
    options.signal.addEventListener('abort', () => done.reject(options.signal.reason), { once: true });
    calls.push({ ...options, done });
    return done.promise;
  });
  return { run, calls };
}

describe('createRefreshRunner', () => {
  it('aborts the refresh in flight when a new one starts, and reports it as aborted', async () => {
    const { run, calls } = scriptedRuns();
    const runner = createRefreshRunner({ run });

    const first = runner.refresh(false);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const second = runner.refresh(false);

    expect(calls[0].signal.aborted).toBe(true);
    await expect(first).resolves.toEqual({ status: 'aborted' });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1].done.resolve('second');
    await expect(second).resolves.toEqual({ status: 'done', value: 'second' });
  });

  it('makes the new refresh replace files when the aborted one was replacing them', async () => {
    const { run, calls } = scriptedRuns();
    const runner = createRefreshRunner({ run });

    void runner.refresh(true);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    void runner.refresh(false);

    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].replaceExisting).toBe(true);
  });

  it('carries replaceExisting through a refresh that was itself aborted before it started', async () => {
    const { run, calls } = scriptedRuns();
    const runner = createRefreshRunner({ run });

    void runner.refresh(true);
    void runner.refresh(false);
    void runner.refresh(false);

    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    expect(calls.at(-1)?.replaceExisting).toBe(true);
    expect(calls.at(-1)?.signal.aborted).toBe(false);
  });

  it('does not replace files once the replacing refresh has finished', async () => {
    const { run, calls } = scriptedRuns();
    const runner = createRefreshRunner({ run });

    const first = runner.refresh(true);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0].done.resolve('first');
    await first;
    void runner.refresh(false);

    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].replaceExisting).toBe(false);
  });

  it('starts the new refresh only after the aborted one has settled', async () => {
    let releaseFirst!: () => void;
    const calls: RefreshRun[] = [];
    const run = vi.fn((options: RefreshRun) => {
      calls.push(options);
      // The first run ignores the abort until a file write it started has finished.
      return calls.length === 1
        ? new Promise<string>((_, reject) => {
            releaseFirst = () => reject(options.signal.reason);
          })
        : Promise.resolve('second');
    });
    const runner = createRefreshRunner({ run });

    void runner.refresh(false);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const second = runner.refresh(false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toHaveLength(1);

    releaseFirst();
    await expect(second).resolves.toEqual({ status: 'done', value: 'second' });
  });

  it('leaves only the second market\'s files and wallpaper when a second market switch interrupts the first', async () => {
    const dates = ['20260816', '20260815', '20260814'];
    const marketResponse = (market: string): HPImageArchiveResponse => ({
      images: dates.map((startdate) => ({
        startdate,
        urlbase: `/th?id=OHR.${market}${startdate}_EN-US1`,
        copyright: `${market} place (© Someone)`,
        copyrightlink: 'https://www.bing.com/search?q=x',
        title: `${market} title`,
      })),
    });
    // The first market's downloads only finish when the test says so; the second's finish at once.
    const firstMarketGates = new Map(dates.map((date) => [date, deferred<ArrayBuffer>()]));
    const fetchImpl = vi.fn(async (url: string) => {
      const market = /mkt=([\w-]+)/.exec(url)?.[1];
      if (market) {
        return { ok: true, status: 200, json: async () => marketResponse(market), arrayBuffer: async () => new ArrayBuffer(0) };
      }
      const [, market2, startdate] = /OHR\.([a-z]{2}-[A-Z]{2})(\d{8})_/.exec(url) ?? [];
      const body = new TextEncoder().encode(market2).buffer as ArrayBuffer;
      const arrayBuffer =
        market2 === 'en-US' ? () => firstMarketGates.get(startdate)!.promise.then(() => body) : async () => body;
      return { ok: true, status: 200, json: async () => ({}), arrayBuffer };
    });

    const files = new Map<string, string>([['2026-08-16', 'de-CH'], ['2026-08-15', 'de-CH']]);
    let metadata: StoredImageMetadata[] = [
      { date: '2026-08-16', title: 'de-CH title', description: '', copyright: '', copyrightlink: '' },
      { date: '2026-08-15', title: 'de-CH title', description: '', copyright: '', copyrightlink: '' },
    ];
    let state: WallpaperState | null = { selectedDate: '2026-08-16' };
    const appliedMarkets: string[] = [];
    let market: Market = 'en-US';

    const runner = createRefreshRunner({
      run: ({ replaceExisting, signal }) =>
        runDailyUpdate({
          fetchImpl,
          market,
          replaceExisting,
          resolutionOverride: null,
          dataFolder: 'data',
          dailyAutoRefresh: true,
          signal,
          readMetadata: async () => metadata,
          writeMetadata: async (_folder, entries) => {
            metadata = entries;
          },
          saveImage: async (_folder, date, data) => {
            files.set(date, new TextDecoder().decode(data));
            return `data/${date}.jpg`;
          },
          setWallpaper: async (imagePath): Promise<ApplyOutcome> => {
            appliedMarkets.push(files.get(/(\d{4}-\d{2}-\d{2})/.exec(imagePath)![1])!);
            return { kind: 'applied' };
          },
          listImageDates: async () => [...files.keys()],
          deleteImage: async (_folder, date) => {
            files.delete(date);
          },
          readState: async () => state,
          writeState: async (_folder, next) => {
            state = next;
          },
        }),
    });

    const first = runner.refresh(true);
    await vi.waitFor(() => expect(fetchImpl.mock.calls.filter(([url]) => url.includes('OHR.en-US'))).toHaveLength(3));
    firstMarketGates.get('20260814')!.resolve(new ArrayBuffer(0));
    await vi.waitFor(() => expect(files.get('2026-08-14')).toBe('en-US'));

    market = 'en-GB';
    const second = runner.refresh(false);
    for (const gate of firstMarketGates.values()) {
      gate.resolve(new ArrayBuffer(0));
    }

    await expect(first).resolves.toEqual({ status: 'aborted' });
    await expect(second).resolves.toMatchObject({ status: 'done' });
    expect(Object.fromEntries(files)).toEqual({ '2026-08-16': 'en-GB', '2026-08-15': 'en-GB', '2026-08-14': 'en-GB' });
    expect(metadata.map((entry) => entry.title)).toEqual(['en-GB title', 'en-GB title', 'en-GB title']);
    expect(appliedMarkets).toEqual(['en-GB']);
    expect(state).toEqual({ selectedDate: '2026-08-16' });
  });

  it('passes on a failure of a refresh that was not aborted', async () => {
    const runner = createRefreshRunner({ run: async () => Promise.reject(new Error('HTTP 500')) });

    await expect(runner.refresh(false)).rejects.toThrow('HTTP 500');
  });
});

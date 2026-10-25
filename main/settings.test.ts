import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSettings, readSettingsInOrder, updateSettings, writeSettings } from './settings.js';

describe('readSettings', () => {
  it('returns the default settings when no settings file exists yet', async () => {
    const result = await readSettings('C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toEqual({ dailyAutoRefresh: true, resolutionOverride: null, market: 'de-CH' });
  });
});

describe('writeSettings + readSettings', () => {
  let tempFolder: string;

  afterEach(async () => {
    if (tempFolder) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
  });

  it('round-trips a written settings value', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-settings-'));

    await writeSettings(tempFolder, { dailyAutoRefresh: false, resolutionOverride: '1920x1080', market: 'en-GB' });
    const result = await readSettings(tempFolder);

    expect(result).toEqual({ dailyAutoRefresh: false, resolutionOverride: '1920x1080', market: 'en-GB' });
  });
});

describe('updateSettings', () => {
  let tempFolder: string;

  afterEach(async () => {
    if (tempFolder) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
  });

  it('runs concurrent updates one after another, so none undoes another', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-settings-'));
    await writeSettings(tempFolder, { dailyAutoRefresh: true, resolutionOverride: null, market: 'de-CH' });

    const [market, autoRefresh] = await Promise.all([
      updateSettings(tempFolder, (current) => ({ ...current, market: 'en-GB' })),
      updateSettings(tempFolder, (current) => ({ ...current, dailyAutoRefresh: false })),
    ]);

    expect(market).toEqual({
      previous: { dailyAutoRefresh: true, resolutionOverride: null, market: 'de-CH' },
      next: { dailyAutoRefresh: true, resolutionOverride: null, market: 'en-GB' },
    });
    expect(autoRefresh?.next).toEqual({ dailyAutoRefresh: false, resolutionOverride: null, market: 'en-GB' });
    expect(await readSettings(tempFolder)).toEqual({ dailyAutoRefresh: false, resolutionOverride: null, market: 'en-GB' });
  });

  it('writes nothing when the update returns null', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-settings-'));

    const result = await updateSettings(tempFolder, () => null);

    expect(result).toBeNull();
    await expect(fs.readdir(tempFolder)).resolves.toEqual([]);
  });

  it('keeps running later updates after one fails', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-settings-'));

    const failing = updateSettings(tempFolder, () => {
      throw new Error('boom');
    });
    const later = updateSettings(tempFolder, (current) => ({ ...current, market: 'en-US' }));

    await expect(failing).rejects.toThrow('boom');
    await expect(later).resolves.toMatchObject({ next: { market: 'en-US' } });
  });

  it('reads the settings only after the updates queued before it', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-settings-'));

    void updateSettings(tempFolder, (current) => ({ ...current, dailyAutoRefresh: false }));
    const result = await readSettingsInOrder(tempFolder);

    expect(result.dailyAutoRefresh).toBe(false);
  });
});

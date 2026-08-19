import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSettings, writeSettings } from './settings.js';

describe('readSettings', () => {
  it('returns the default settings when no settings file exists yet', async () => {
    const result = await readSettings('C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toEqual({ dailyAutoRefresh: true, resolutionOverride: null });
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

    await writeSettings(tempFolder, { dailyAutoRefresh: false, resolutionOverride: '1920x1080' });
    const result = await readSettings(tempFolder);

    expect(result).toEqual({ dailyAutoRefresh: false, resolutionOverride: '1920x1080' });
  });
});

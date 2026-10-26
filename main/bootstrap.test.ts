import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBootstrapPointer, writeBootstrapPointer } from './bootstrap.js';

describe('readBootstrapPointer', () => {
  it('returns the default data folder and reports a first start when no pointer file exists yet', async () => {
    const result = await readBootstrapPointer('C:\\fake\\AppData\\BingWall', 'C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toEqual({ pointer: { dataFolder: 'C:\\fake\\Pictures\\BingWallpapers' }, firstStart: true });
  });
});

describe('writeBootstrapPointer + readBootstrapPointer', () => {
  let tempFolder: string;

  afterEach(async () => {
    if (tempFolder) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
  });

  it('round-trips a written pointer, which is no longer a first start', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-bootstrap-'));

    await writeBootstrapPointer(tempFolder, { dataFolder: 'D:\\Wallpapers' });
    const result = await readBootstrapPointer(tempFolder, 'C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toEqual({ pointer: { dataFolder: 'D:\\Wallpapers' }, firstStart: false });
  });

  it('falls back to the default data folder for a broken pointer file, without reporting a first start', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-bootstrap-'));
    await fs.writeFile(path.join(tempFolder, 'bootstrap.json'), '{ not json', 'utf-8');

    const result = await readBootstrapPointer(tempFolder, 'C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toEqual({ pointer: { dataFolder: 'C:\\fake\\Pictures\\BingWallpapers' }, firstStart: false });
  });
});

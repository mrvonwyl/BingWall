import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBootstrapPointer, writeBootstrapPointer } from './bootstrap.js';

describe('readBootstrapPointer', () => {
  it('returns the default data folder when no pointer file exists yet', async () => {
    const result = await readBootstrapPointer('C:\\fake\\AppData\\BingWall', 'C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toEqual({ dataFolder: 'C:\\fake\\Pictures\\BingWallpapers' });
  });
});

describe('writeBootstrapPointer + readBootstrapPointer', () => {
  let tempFolder: string;

  afterEach(async () => {
    if (tempFolder) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
  });

  it('round-trips a written pointer', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-bootstrap-'));

    await writeBootstrapPointer(tempFolder, { dataFolder: 'D:\\Wallpapers' });
    const result = await readBootstrapPointer(tempFolder, 'C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toEqual({ dataFolder: 'D:\\Wallpapers' });
  });
});

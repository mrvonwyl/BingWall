import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readState, writeState } from './state.js';

describe('readState', () => {
  it('returns null when no state file exists yet', async () => {
    const result = await readState('C:\\fake\\Pictures\\BingWallpapers');

    expect(result).toBeNull();
  });
});

describe('writeState + readState', () => {
  let tempFolder: string;

  afterEach(async () => {
    if (tempFolder) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
  });

  it('round-trips a written state value', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-state-'));

    await writeState(tempFolder, { selectedDate: '2026-08-15' });
    const result = await readState(tempFolder);

    expect(result).toEqual({ selectedDate: '2026-08-15' });
  });
});

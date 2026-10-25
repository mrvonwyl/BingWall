import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteImage, listImageDates, relocateDataFolder, saveImage, upsertMetadata } from './storage.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

describe('upsertMetadata', () => {
  it('adds a new entry to the front', () => {
    const result = upsertMetadata([entry('2026-08-15')], entry('2026-08-16'));

    expect(result.map((e) => e.date)).toEqual(['2026-08-16', '2026-08-15']);
  });

  it('replaces an existing entry for the same date instead of duplicating it', () => {
    const updated = { ...entry('2026-08-16'), title: 'Updated title' };

    const result = upsertMetadata([entry('2026-08-16'), entry('2026-08-15')], updated);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(updated);
  });

  it('caps retained entries at 8, dropping the oldest', () => {
    const existing = Array.from({ length: 8 }, (_, i) => entry(`2026-08-${String(8 - i).padStart(2, '0')}`));

    const result = upsertMetadata(existing, entry('2026-08-09'));

    expect(result).toHaveLength(8);
    expect(result.map((e) => e.date)).not.toContain('2026-08-01');
    expect(result[0].date).toBe('2026-08-09');
  });

  it('exempts the kept date from the cap, leaving it in its place on top of the newest 8', () => {
    const existing = Array.from({ length: 8 }, (_, i) => entry(`2026-08-${String(8 - i).padStart(2, '0')}`));

    const result = upsertMetadata(existing, entry('2026-08-09'), '2026-08-01');

    expect(result.map((e) => e.date)).toEqual([
      '2026-08-09', '2026-08-08', '2026-08-07', '2026-08-06', '2026-08-05', '2026-08-04', '2026-08-03', '2026-08-02',
      '2026-08-01',
    ]);
  });

  it('still caps at 8 when the kept date is among the newest 8', () => {
    const existing = Array.from({ length: 8 }, (_, i) => entry(`2026-08-${String(8 - i).padStart(2, '0')}`));

    const result = upsertMetadata(existing, entry('2026-08-09'), '2026-08-05');

    expect(result).toHaveLength(8);
    expect(result.map((e) => e.date)).not.toContain('2026-08-01');
  });
});

describe('listImageDates + deleteImage', () => {
  let tempFolder: string;

  afterEach(async () => {
    if (tempFolder) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
  });

  it('lists dates for .jpg files and ignores everything else, then can delete one', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-storage-'));
    await fs.writeFile(path.join(tempFolder, '2026-08-16.jpg'), 'a');
    await fs.writeFile(path.join(tempFolder, '2026-08-15.jpg'), 'b');
    await fs.writeFile(path.join(tempFolder, 'metadata.json'), '[]');

    const dates = await listImageDates(tempFolder);
    expect(dates.sort()).toEqual(['2026-08-15', '2026-08-16']);

    await deleteImage(tempFolder, '2026-08-15');
    expect(await listImageDates(tempFolder)).toEqual(['2026-08-16']);
  });

  it('returns an empty list when the folder does not exist yet', async () => {
    const dates = await listImageDates('C:\\fake\\Pictures\\BingWallpapers');
    expect(dates).toEqual([]);
  });
});

describe('saveImage', () => {
  let tempFolder: string;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempFolder) {
      await fs.rm(tempFolder, { recursive: true, force: true });
    }
  });

  it('writes the image as <date>.jpg and leaves no temp file behind', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-save-'));

    const imagePath = await saveImage(tempFolder, '2026-08-16', new Uint8Array([1, 2, 3]).buffer);

    expect(imagePath).toBe(path.join(tempFolder, '2026-08-16.jpg'));
    expect([...(await fs.readFile(imagePath))]).toEqual([1, 2, 3]);
    expect(await fs.readdir(tempFolder)).toEqual(['2026-08-16.jpg']);
  });

  it('never leaves a partial .jpg when the write fails part-way, and keeps the previous file', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-save-'));
    const imagePath = path.join(tempFolder, '2026-08-16.jpg');
    await fs.writeFile(imagePath, Buffer.from([9, 9, 9, 9]));
    const realWriteFile = fs.writeFile.bind(fs);
    vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data) => {
      // Simulate a write cut off half-way: some bytes reach the disk, then it fails.
      await realWriteFile(file, (data as Buffer).subarray(0, 1));
      throw new Error('disk full');
    });

    await expect(saveImage(tempFolder, '2026-08-16', new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow('disk full');

    vi.restoreAllMocks();
    expect(await fs.readdir(tempFolder)).toEqual(['2026-08-16.jpg']);
    expect([...(await fs.readFile(imagePath))]).toEqual([9, 9, 9, 9]);
  });

  function lockedError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
  }

  it('retries the rename while the existing file is briefly held open', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-save-'));
    const imagePath = path.join(tempFolder, '2026-08-16.jpg');
    await fs.writeFile(imagePath, Buffer.from([9, 9, 9, 9]));
    const realRename = fs.rename.bind(fs);
    const codes = ['EPERM', 'EBUSY', 'EACCES'];
    const rename = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      const code = codes.shift();
      if (code) {
        throw lockedError(code);
      }
      return realRename(from, to);
    });

    await saveImage(tempFolder, '2026-08-16', new Uint8Array([1, 2, 3]).buffer);

    expect(rename).toHaveBeenCalledTimes(4);
    vi.restoreAllMocks();
    expect([...(await fs.readFile(imagePath))]).toEqual([1, 2, 3]);
    expect(await fs.readdir(tempFolder)).toEqual(['2026-08-16.jpg']);
  });

  it('gives up after a few attempts, removes the temp file and keeps the previous file', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-save-'));
    const imagePath = path.join(tempFolder, '2026-08-16.jpg');
    await fs.writeFile(imagePath, Buffer.from([9, 9, 9, 9]));
    const rename = vi.spyOn(fs, 'rename').mockRejectedValue(lockedError('EBUSY'));

    await expect(saveImage(tempFolder, '2026-08-16', new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow('EBUSY');

    expect(rename.mock.calls.length).toBeGreaterThan(1);
    expect(rename.mock.calls.length).toBeLessThanOrEqual(5);
    vi.restoreAllMocks();
    expect(await fs.readdir(tempFolder)).toEqual(['2026-08-16.jpg']);
    expect([...(await fs.readFile(imagePath))]).toEqual([9, 9, 9, 9]);
  });

  it('does not retry a rename that fails for another reason', async () => {
    tempFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-save-'));
    const rename = vi.spyOn(fs, 'rename').mockRejectedValue(lockedError('ENOSPC'));

    await expect(saveImage(tempFolder, '2026-08-16', new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow('ENOSPC');

    expect(rename).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    expect(await fs.readdir(tempFolder)).toEqual([]);
  });
});

describe('relocateDataFolder', () => {  let oldFolder: string;
  let newFolder: string;

  afterEach(async () => {
    await fs.rm(oldFolder, { recursive: true, force: true });
    await fs.rm(newFolder, { recursive: true, force: true });
  });

  it('moves all files from the old folder into the new one', async () => {
    oldFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-relocate-old-'));
    newFolder = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-relocate-parent-')), 'moved');
    await fs.writeFile(path.join(oldFolder, '2026-08-16.jpg'), 'a');
    await fs.writeFile(path.join(oldFolder, 'metadata.json'), '[]');

    await relocateDataFolder(oldFolder, newFolder);

    expect((await fs.readdir(newFolder)).sort()).toEqual(['2026-08-16.jpg', 'metadata.json']);
    await expect(fs.access(oldFolder)).rejects.toThrow();
  });
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteImage, listImageDates, relocateDataFolder, upsertMetadata } from './storage.js';
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

describe('relocateDataFolder', () => {
  let oldFolder: string;
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

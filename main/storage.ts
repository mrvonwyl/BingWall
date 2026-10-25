import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MAX_RETAINED_ENTRIES, type StoredImageMetadata } from './storage.models.js';

export function getDefaultDataFolder(): string {
  return path.join(os.homedir(), 'Pictures', 'BingWallpapers');
}

export async function relocateDataFolder(oldFolder: string, newFolder: string): Promise<void> {
  await fs.mkdir(newFolder, { recursive: true });

  let entries: string[];
  try {
    entries = await fs.readdir(oldFolder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const from = path.join(oldFolder, entry);
    const to = path.join(newFolder, entry);
    try {
      await fs.rename(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw error;
      }
      await fs.cp(from, to, { recursive: true });
      await fs.rm(from, { recursive: true });
    }
  }

  await fs.rmdir(oldFolder);
}

export function upsertMetadata(existing: StoredImageMetadata[], entry: StoredImageMetadata): StoredImageMetadata[] {
  const withoutDuplicate = existing.filter((e) => e.date !== entry.date);
  return [entry, ...withoutDuplicate].slice(0, MAX_RETAINED_ENTRIES);
}

export async function readMetadata(folder: string): Promise<StoredImageMetadata[]> {
  try {
    const raw = await fs.readFile(path.join(folder, 'metadata.json'), 'utf-8');
    return JSON.parse(raw) as StoredImageMetadata[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

export async function writeMetadata(folder: string, entries: StoredImageMetadata[]): Promise<void> {
  await fs.mkdir(folder, { recursive: true });
  const target = path.join(folder, 'metadata.json');
  const tempFile = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(entries, null, 2), 'utf-8');
  await fs.rename(tempFile, target);
}

export async function saveImage(folder: string, date: string, data: ArrayBuffer): Promise<string> {
  await fs.mkdir(folder, { recursive: true });
  const imagePath = path.join(folder, `${date}.jpg`);
  // Written beside the target and renamed into place, so a half-written image never shows up in history.
  // The name is unique per call because downloads of the same date can overlap across refreshes.
  const tempFile = `${imagePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempFile, Buffer.from(data));
    await fs.rename(tempFile, imagePath);
  } catch (error) {
    await fs.rm(tempFile, { force: true });
    throw error;
  }
  return imagePath;
}

export async function listImageDates(folder: string): Promise<string[]> {
  try {
    const files = await fs.readdir(folder);
    return files.filter((file) => file.endsWith('.jpg')).map((file) => file.slice(0, -'.jpg'.length));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function deleteImage(folder: string, date: string): Promise<void> {
  await fs.unlink(path.join(folder, `${date}.jpg`));
}

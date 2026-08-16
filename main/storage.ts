import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MAX_RETAINED_ENTRIES, type StoredImageMetadata } from './storage.models.js';

export function getDataFolder(): string {
  return path.join(os.homedir(), 'Pictures', 'BingWallpapers');
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function writeMetadata(folder: string, entries: StoredImageMetadata[]): Promise<void> {
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'metadata.json'), JSON.stringify(entries, null, 2), 'utf-8');
}

export async function saveImage(folder: string, date: string, data: ArrayBuffer): Promise<string> {
  await fs.mkdir(folder, { recursive: true });
  const imagePath = path.join(folder, `${date}.jpg`);
  await fs.writeFile(imagePath, Buffer.from(data));
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

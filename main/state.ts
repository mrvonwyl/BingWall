import fs from 'node:fs/promises';
import path from 'node:path';
import type { WallpaperState } from './state.models.js';

export async function readState(folder: string): Promise<WallpaperState | null> {
  try {
    const raw = await fs.readFile(path.join(folder, 'state.json'), 'utf-8');
    return JSON.parse(raw) as WallpaperState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeState(folder: string, state: WallpaperState): Promise<void> {
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

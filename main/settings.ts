import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from './settings.models.js';

export async function readSettings(folder: string): Promise<Settings> {
  try {
    const raw = await fs.readFile(path.join(folder, 'settings.json'), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_SETTINGS;
    }
    throw error;
  }
}

export async function writeSettings(folder: string, settings: Settings): Promise<void> {
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8');
}

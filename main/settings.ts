import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from './settings.models.js';

export async function readSettings(folder: string): Promise<Settings> {
  try {
    const raw = await fs.readFile(path.join(folder, 'settings.json'), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) {
      return DEFAULT_SETTINGS;
    }
    throw error;
  }
}

export async function writeSettings(folder: string, settings: Settings): Promise<void> {
  await fs.mkdir(folder, { recursive: true });
  const target = path.join(folder, 'settings.json');
  const tempFile = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(settings, null, 2), 'utf-8');
  await fs.rename(tempFile, target);
}

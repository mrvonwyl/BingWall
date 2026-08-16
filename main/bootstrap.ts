import fs from 'node:fs/promises';
import path from 'node:path';
import type { BootstrapPointer } from './bootstrap.models.js';

export async function readBootstrapPointer(appDataFolder: string, defaultDataFolder: string): Promise<BootstrapPointer> {
  try {
    const raw = await fs.readFile(path.join(appDataFolder, 'bootstrap.json'), 'utf-8');
    return JSON.parse(raw) as BootstrapPointer;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { dataFolder: defaultDataFolder };
    }
    throw error;
  }
}

export async function writeBootstrapPointer(appDataFolder: string, pointer: BootstrapPointer): Promise<void> {
  await fs.mkdir(appDataFolder, { recursive: true });
  await fs.writeFile(path.join(appDataFolder, 'bootstrap.json'), JSON.stringify(pointer, null, 2), 'utf-8');
}

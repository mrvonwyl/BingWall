import fs from 'node:fs/promises';
import path from 'node:path';
import type { BootstrapPointer, BootstrapRead } from './bootstrap.models.js';

export async function readBootstrapPointer(appDataFolder: string, defaultDataFolder: string): Promise<BootstrapRead> {
  try {
    const raw = await fs.readFile(path.join(appDataFolder, 'bootstrap.json'), 'utf-8');
    return { pointer: JSON.parse(raw) as BootstrapPointer, firstStart: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { pointer: { dataFolder: defaultDataFolder }, firstStart: true };
    }
    if (error instanceof SyntaxError) {
      return { pointer: { dataFolder: defaultDataFolder }, firstStart: false };
    }
    throw error;
  }
}

export async function writeBootstrapPointer(appDataFolder: string, pointer: BootstrapPointer): Promise<void> {
  await fs.mkdir(appDataFolder, { recursive: true });
  const target = path.join(appDataFolder, 'bootstrap.json');
  const tempFile = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(pointer, null, 2), 'utf-8');
  await fs.rename(tempFile, target);
}

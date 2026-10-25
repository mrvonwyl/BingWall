import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings, type SettingsUpdate, type SettingsUpdater } from './settings.models.js';

// Settings are changed from more than one place (the settings pane, an explicit selection turning daily
// auto-refresh off). Each read-modify-write runs only after the previous one finished, so none undoes another.
let settingsQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = settingsQueue.then(task);
  settingsQueue = run.catch(() => undefined);
  return run;
}

// Resolves with the settings before and after the update, or null when the updater left them as they are.
export function updateSettings(folder: string, update: SettingsUpdater): Promise<SettingsUpdate | null> {
  return enqueue(async () => {
    const previous = await readSettings(folder);
    const next = update(previous);
    if (!next) {
      return null;
    }
    await writeSettings(folder, next);
    return { previous, next };
  });
}

// The settings once every update queued before this read has been written.
export function readSettingsInOrder(folder: string): Promise<Settings> {
  return enqueue(() => readSettings(folder));
}

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

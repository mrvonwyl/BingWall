import type { UpdaterLike } from './autoUpdate.models.js';

export async function checkForUpdates(updater: UpdaterLike): Promise<void> {
  try {
    await updater.checkForUpdatesAndNotify();
  } catch (error) {
    console.error('BingWall: update check failed', error);
  }
}

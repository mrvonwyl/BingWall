import chokidar from 'chokidar';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

const AWAIT_WRITE_FINISH = { stabilityThreshold: 300, pollInterval: 100 };

// Renderer-only hot reload. Main/preload changes are handled by scripts/dev.ts,
// which restarts this process from the outside — never relaunch from in here.
export function watchForDevReload(projectRoot: string, getMainWindow: () => BrowserWindow | null): void {
  const rendererWatcher = chokidar.watch(
    [path.join(projectRoot, 'renderer'), path.join(projectRoot, 'dist', 'renderer')],
    { ignoreInitial: true, awaitWriteFinish: AWAIT_WRITE_FINISH, ignored: (file) => file.endsWith('.ts') },
  );

  let reloadTimer: NodeJS.Timeout | undefined;
  rendererWatcher.on('change', () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => getMainWindow()?.webContents.reloadIgnoringCache(), 100);
  });
}

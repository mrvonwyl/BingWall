import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor, screen, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setWallpaper } from 'wallpaper';
import { getCurrentWallpaper } from './currentWallpaper.js';
import type { CurrentWallpaperResult } from './currentWallpaper.models.js';
import { getHistory } from './history.js';
import { runDailyUpdate } from './pipeline.js';
import { describeRefreshError } from './refreshError.js';
import { readSettings, writeSettings } from './settings.js';
import { selectWallpaper } from './selectWallpaper.js';
import { readState, writeState } from './state.js';
import { deleteImage, getDataFolder, listImageDates, readMetadata, saveImage, writeMetadata } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

const BACKGROUND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow(show: boolean): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    show,
    webPreferences: {
      preload: path.join(projectRoot, 'dist', 'preload', 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(projectRoot, 'renderer', 'index.html'));
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Refresh now',
      click: () => void safeRefreshWallpaper(),
    },
    {
      label: 'Open wallpaper folder',
      click: () => void shell.openPath(getDataFolder()),
    },
    { type: 'separator' },
    {
      label: 'Launch on login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => app.setLoginItemSettings({ openAtLogin: menuItem.checked }),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(projectRoot, 'build', 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('BingWall');
  tray.setContextMenu(buildTrayMenu());

  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  tray.on('right-click', () => {
    tray?.setContextMenu(buildTrayMenu());
  });
}

function toWallpaperPayload(result: CurrentWallpaperResult) {
  if (!result) {
    return null;
  }

  return { metadata: result.metadata, imageUrl: pathToFileURL(result.imagePath).toString() };
}

type RefreshResult =
  | { ok: true; current: ReturnType<typeof toWallpaperPayload> }
  | { ok: false; error: string };

async function refreshWallpaper(): Promise<void> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const settings = await readSettings(getDataFolder());

  await runDailyUpdate({
    fetchImpl: fetch,
    display: { width: primaryDisplay.size.width, height: primaryDisplay.size.height },
    dataFolder: getDataFolder(),
    dailyAutoRefresh: settings.dailyAutoRefresh,
    readMetadata,
    writeMetadata,
    saveImage,
    setWallpaper: (imagePath) => setWallpaper(imagePath, { scale: 'fill' }),
    listImageDates,
    deleteImage,
    writeState,
  });
}

async function performRefresh(): Promise<RefreshResult> {
  let result: RefreshResult;

  try {
    await refreshWallpaper();
    const current = await getCurrentWallpaper({ dataFolder: getDataFolder(), readMetadata, readState });
    result = { ok: true, current: toWallpaperPayload(current) };
  } catch (error) {
    console.error('BingWall: refresh failed', error);
    result = { ok: false, error: describeRefreshError(error) };
  }

  mainWindow?.webContents.send('refresh-result', result);
  return result;
}

async function safeRefreshWallpaper(): Promise<void> {
  await performRefresh();
}

ipcMain.handle('get-current-wallpaper', async () => {
  const result = await getCurrentWallpaper({ dataFolder: getDataFolder(), readMetadata, readState });
  return toWallpaperPayload(result);
});

ipcMain.handle('get-history', async () => {
  const items = await getHistory({ dataFolder: getDataFolder(), readMetadata });

  return items.map((item) => ({ metadata: item.metadata, imageUrl: pathToFileURL(item.imagePath).toString() }));
});

ipcMain.handle('select-wallpaper', async (_event, date: string) => {
  const result = await selectWallpaper(date, {
    dataFolder: getDataFolder(),
    readMetadata,
    setWallpaper: (imagePath) => setWallpaper(imagePath, { scale: 'fill' }),
    writeState,
  });

  return toWallpaperPayload(result);
});

ipcMain.handle('get-settings', async () => {
  return readSettings(getDataFolder());
});

ipcMain.handle('update-settings', async (_event, settings: { dailyAutoRefresh: boolean }) => {
  await writeSettings(getDataFolder(), settings);
  return settings;
});

ipcMain.handle('refresh-wallpaper', async () => {
  return performRefresh();
});

app.whenReady().then(() => {
  createTray();
  createWindow(!app.getLoginItemSettings().wasOpenedAtLogin);
  void safeRefreshWallpaper();

  setInterval(() => void safeRefreshWallpaper(), BACKGROUND_REFRESH_INTERVAL_MS);
  powerMonitor.on('resume', () => void safeRefreshWallpaper());
  powerMonitor.on('unlock-screen', () => void safeRefreshWallpaper());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(true);
    } else {
      mainWindow?.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

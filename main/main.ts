import { app, BrowserWindow, Tray, Menu, dialog, ipcMain, nativeImage, powerMonitor, screen, shell } from 'electron';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkForUpdates } from './autoUpdate.js';
import { readBootstrapPointer, writeBootstrapPointer } from './bootstrap.js';
import { getCurrentWallpaper } from './currentWallpaper.js';
import type { CurrentWallpaperResult } from './currentWallpaper.models.js';
import { downloadWallpaper } from './download.js';
import { getHistory } from './history.js';
import { setNativeWallpaper } from './nativeWallpaper.js';
import { runDailyUpdate } from './pipeline.js';
import { describeRefreshError } from './refreshError.js';
import { readSettings, writeSettings } from './settings.js';
import type { Settings } from './settings.models.js';
import { selectWallpaper } from './selectWallpaper.js';
import { readState, writeState } from './state.js';
import { deleteImage, getDefaultDataFolder, listImageDates, readMetadata, relocateDataFolder, saveImage, writeMetadata } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

const BACKGROUND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let dataFolder = getDefaultDataFolder();

function getDataFolder(): string {
  return dataFolder;
}

function getAppDataFolder(): string {
  return path.join(app.getPath('appData'), 'BingWall');
}

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
  const displays = screen.getAllDisplays().map((display) => ({ width: display.size.width, height: display.size.height }));
  const settings = await readSettings(getDataFolder());

  await runDailyUpdate({
    fetchImpl: fetch,
    displays,
    resolutionOverride: settings.resolutionOverride,
    dataFolder: getDataFolder(),
    dailyAutoRefresh: settings.dailyAutoRefresh,
    readMetadata,
    writeMetadata,
    saveImage,
    setWallpaper: setNativeWallpaper,
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
    setWallpaper: setNativeWallpaper,
    writeState,
  });

  return toWallpaperPayload(result);
});

ipcMain.handle('download-wallpaper', async (_event, date: string) => {
  const entries = await readMetadata(getDataFolder());
  const metadata = entries.find((entry) => entry.date === date);

  if (!metadata) {
    return null;
  }

  const imagePath = path.join(getDataFolder(), `${date}.jpg`);
  const result = await downloadWallpaper(metadata, imagePath, {
    downloadsFolder: app.getPath('downloads'),
    copyFile: (source, destination) => fs.copyFile(source, destination),
  });

  return result.destinationPath;
});

ipcMain.handle('get-settings', async () => {
  return readSettings(getDataFolder());
});

ipcMain.handle('update-settings', async (_event, settings: Settings) => {
  await writeSettings(getDataFolder(), settings);
  return settings;
});

ipcMain.handle('refresh-wallpaper', async () => {
  return performRefresh();
});

ipcMain.handle('get-data-folder', () => {
  return getDataFolder();
});

ipcMain.handle('choose-data-folder', async () => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('relocate-data-folder', async (_event, newFolder: string) => {
  await relocateDataFolder(getDataFolder(), newFolder);
  dataFolder = newFolder;
  await writeBootstrapPointer(getAppDataFolder(), { dataFolder });
  return dataFolder;
});

app.whenReady().then(async () => {
  const pointer = await readBootstrapPointer(getAppDataFolder(), getDefaultDataFolder());
  dataFolder = pointer.dataFolder;
  await writeBootstrapPointer(getAppDataFolder(), { dataFolder });

  createTray();
  createWindow(!app.getLoginItemSettings().wasOpenedAtLogin);
  void safeRefreshWallpaper();

  setInterval(() => void safeRefreshWallpaper(), BACKGROUND_REFRESH_INTERVAL_MS);
  powerMonitor.on('resume', () => void safeRefreshWallpaper());
  powerMonitor.on('unlock-screen', () => void safeRefreshWallpaper());

  void checkForUpdates(autoUpdater);
  setInterval(() => void checkForUpdates(autoUpdater), UPDATE_CHECK_INTERVAL_MS);

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

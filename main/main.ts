import { app, BrowserWindow, Tray, Menu, dialog, ipcMain, nativeImage, powerMonitor, shell, utilityProcess } from 'electron';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApplyFailedError, createApplierHost } from './applier/applierHost.js';
import { checkForUpdates } from './autoUpdate.js';
import { readBootstrapPointer, writeBootstrapPointer } from './bootstrap.js';
import { getCurrentWallpaper } from './currentWallpaper.js';
import { watchForDevReload } from './devReload.js';
import type { CurrentWallpaperResult } from './currentWallpaper.models.js';
import { downloadWallpaper } from './download.js';
import { shouldOpenExternally } from './externalLinks.js';
import { getHistory } from './history.js';
import { runDailyUpdate } from './pipeline.js';
import type { RunDailyUpdateResult } from './pipeline.models.js';
import { describePartialDownloadFailure, describeRefreshError } from './refreshError.js';
import { createRefreshRunner } from './refreshRunner.js';
import type { RefreshRun } from './refreshRunner.models.js';
import { readSettings, writeSettings } from './settings.js';
import type { Settings } from './settings.models.js';
import { selectWallpaper } from './selectWallpaper.js';
import { readState, writeState } from './state.js';
import { deleteImage, getDefaultDataFolder, listImageDates, readMetadata, relocateDataFolder, saveImage, writeMetadata } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

// Wallpapers are applied by a long-lived utilityProcess, so main never makes a blocking OS call.
// Forked lazily on the first apply; Electron ends it with the app.
const applierHost = createApplierHost({
  forkApplier: () =>
    utilityProcess.fork(path.join(__dirname, 'applier', 'applierChild.js'), [], { serviceName: 'BingWall wallpaper applier' }),
  logError: (message, details) => console.error(message, details ?? ''),
});
// History selection and every refresh share this one host, ordered by arrival in main.
const setWallpaper = (imagePath: string) => applierHost.apply(imagePath);

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
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    show,
    webPreferences: {
      preload: path.join(projectRoot, 'dist', 'preload', 'preload.cjs'),
    },
  });

  mainWindow.setAspectRatio(16 / 9);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url)) {
      void shell.openExternal(url);
    } else {
      console.warn(`Refused to open external link: ${url}`);
    }
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

// Versioned by mtime so the renderer doesn't show a cached image after a date's file is replaced.
async function toImageUrl(imagePath: string): Promise<string> {
  const url = pathToFileURL(imagePath).toString();
  try {
    const { mtimeMs } = await fs.stat(imagePath);
    return `${url}?v=${Math.round(mtimeMs)}`;
  } catch {
    return url;
  }
}

async function toWallpaperPayload(result: CurrentWallpaperResult) {
  if (!result) {
    return null;
  }

  return { metadata: result.metadata, imageUrl: await toImageUrl(result.imagePath) };
}

// Mirrors RefreshResultPayload in preload.models.cts and renderer/index.models.ts.
type RefreshResult =
  | { ok: true; current: Awaited<ReturnType<typeof toWallpaperPayload>>; warning?: string }
  | { ok: false; error: string }
  | { superseded: true };

async function refreshWallpaper({ replaceExisting, signal }: RefreshRun): Promise<RunDailyUpdateResult> {
  const settings = await readSettings(getDataFolder());

  // A market switch re-applies the selected wallpaper from its new file inside the pipeline.
  return runDailyUpdate({
    fetchImpl: fetch,
    signal,
    market: settings.market,
    replaceExisting,
    resolutionOverride: settings.resolutionOverride,
    dataFolder: getDataFolder(),
    dailyAutoRefresh: settings.dailyAutoRefresh,
    readMetadata,
    writeMetadata,
    saveImage,
    setWallpaper,
    listImageDates,
    deleteImage,
    readState,
    writeState,
  });
}

// Every refresh (daily, manual, timer, resume/unlock, market switch) aborts the one in flight.
const refreshRunner = createRefreshRunner({ run: refreshWallpaper });

async function performRefresh(replaceExisting = false): Promise<RefreshResult> {
  let result: RefreshResult;

  try {
    const outcome = await refreshRunner.refresh(replaceExisting);
    if (outcome.status === 'aborted') {
      // A newer refresh replaced this one and pushes its own result; this one reports nothing.
      return { superseded: true };
    }
    const { failedDates } = outcome.value;
    const current = await getCurrentWallpaper({ dataFolder: getDataFolder(), readMetadata, readState });
    result = { ok: true, current: await toWallpaperPayload(current) };
    if (failedDates.length > 0) {
      console.warn('BingWall: some images failed to download', failedDates);
      result.warning = describePartialDownloadFailure(failedDates);
    }
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

  return Promise.all(items.map(async (item) => ({ metadata: item.metadata, imageUrl: await toImageUrl(item.imagePath) })));
});

ipcMain.handle('select-wallpaper', async (_event, date: string) => {
  const result = await selectWallpaper(date, {
    dataFolder: getDataFolder(),
    readMetadata,
    setWallpaper,
    writeState,
    readSettings,
    writeSettings,
  });

  switch (result?.status) {
    case undefined:
      return null;
    case 'applied':
      return { status: 'applied', current: await toWallpaperPayload(result), updatedSettings: result.updatedSettings };
    case 'superseded':
      return { status: 'superseded' };
    case 'error':
      return { status: 'error', error: result.error.error, message: describeRefreshError(new ApplyFailedError(result.error)) };
  }
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
  const previous = await readSettings(getDataFolder());
  await writeSettings(getDataFolder(), settings);

  if (settings.market !== previous.market) {
    void performRefresh(true);
  }

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

  if (!app.isPackaged && process.env.BINGWALL_DEV_RELOAD === '1') {
    watchForDevReload(projectRoot, () => mainWindow);
  }

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

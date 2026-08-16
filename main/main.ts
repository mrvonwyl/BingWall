import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setWallpaper } from 'wallpaper';
import { getCurrentWallpaper } from './currentWallpaper.js';
import { getHistory } from './history.js';
import { runDailyUpdate } from './pipeline.js';
import { readSettings, writeSettings } from './settings.js';
import { selectWallpaper } from './selectWallpaper.js';
import { deleteImage, getDataFolder, listImageDates, readMetadata, saveImage, writeMetadata } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(projectRoot, 'dist', 'preload', 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(projectRoot, 'renderer', 'index.html'));
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(projectRoot, 'build', 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('BingWall');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => mainWindow?.show(),
    },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => mainWindow?.show());
}

async function refreshWallpaper(): Promise<void> {
  const primaryDisplay = screen.getPrimaryDisplay();

  await runDailyUpdate({
    fetchImpl: fetch,
    display: { width: primaryDisplay.size.width, height: primaryDisplay.size.height },
    dataFolder: getDataFolder(),
    readMetadata,
    writeMetadata,
    saveImage,
    setWallpaper: (imagePath) => setWallpaper(imagePath, { scale: 'fill' }),
    listImageDates,
    deleteImage,
  });
}

ipcMain.handle('get-current-wallpaper', async () => {
  const result = await getCurrentWallpaper({ dataFolder: getDataFolder(), readMetadata });

  if (!result) {
    return null;
  }

  return { metadata: result.metadata, imageUrl: pathToFileURL(result.imagePath).toString() };
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
  });

  if (!result) {
    return null;
  }

  return { metadata: result.metadata, imageUrl: pathToFileURL(result.imagePath).toString() };
});

ipcMain.handle('get-settings', async () => {
  return readSettings(getDataFolder());
});

ipcMain.handle('update-settings', async (_event, settings: { dailyAutoRefresh: boolean }) => {
  await writeSettings(getDataFolder(), settings);
  return settings;
});

app.whenReady().then(() => {
  createTray();
  createWindow();
  void refreshWallpaper();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

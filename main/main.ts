import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setWallpaper } from 'wallpaper';
import { getCurrentWallpaper } from './currentWallpaper.js';
import { runDailyUpdate } from './pipeline.js';
import { getDataFolder, readMetadata, saveImage, writeMetadata } from './storage.js';

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
  });
}

ipcMain.handle('get-current-wallpaper', async () => {
  const result = await getCurrentWallpaper({ dataFolder: getDataFolder(), readMetadata });

  if (!result) {
    return null;
  }

  return { metadata: result.metadata, imageUrl: pathToFileURL(result.imagePath).toString() };
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

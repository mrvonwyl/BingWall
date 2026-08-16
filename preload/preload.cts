import { contextBridge, ipcRenderer } from 'electron';
import type { BingWallAPI } from './preload.models.cjs';

const api: BingWallAPI = {
  getCurrentWallpaper: () => ipcRenderer.invoke('get-current-wallpaper'),
};

contextBridge.exposeInMainWorld('bingwall', api);

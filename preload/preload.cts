import { contextBridge, ipcRenderer } from 'electron';
import type { BingWallAPI } from './preload.models.cjs';

const api: BingWallAPI = {
  getCurrentWallpaper: () => ipcRenderer.invoke('get-current-wallpaper'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  selectWallpaper: (date) => ipcRenderer.invoke('select-wallpaper', date),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  refresh: () => ipcRenderer.invoke('refresh-wallpaper'),
  onRefreshResult: (callback) => {
    ipcRenderer.on('refresh-result', (_event, result) => callback(result));
  },
};

contextBridge.exposeInMainWorld('bingwall', api);

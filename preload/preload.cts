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
  getDataFolder: () => ipcRenderer.invoke('get-data-folder'),
  chooseDataFolder: () => ipcRenderer.invoke('choose-data-folder'),
  relocateDataFolder: (newFolder) => ipcRenderer.invoke('relocate-data-folder', newFolder),
  downloadWallpaper: (date) => ipcRenderer.invoke('download-wallpaper', date),
};

contextBridge.exposeInMainWorld('bingwall', api);

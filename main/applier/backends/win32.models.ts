// The Win32 calls the backend needs, injected so the backend logic is testable
// without touching the real desktop. The real implementation is win32Native.ts (koffi).
export interface Win32Native {
  // HKCU\Control Panel\Desktop string value, or null when missing.
  readDesktopString(name: string): string | null;
  writeDesktopString(name: string, value: string): void;
  // SystemParametersInfoW(SPI_SETDESKWALLPAPER, path, SPIF_UPDATEINIFILE); false on failure.
  setDeskWallpaper(imagePath: string): boolean;
  // GetLastError(), read right after a failed call.
  getLastError(): number;
  // SendNotifyMessageW(HWND_BROADCAST, WM_SETTINGCHANGE, SPI_SETDESKWALLPAPER, "Control Panel\Desktop");
  // false on failure, with the reason in getLastError().
  notifyWallpaperChanged(): boolean;
}

export type Win32BackendLog = {
  // Problems that don't fail the apply. Defaults to console.warn; the child inherits main's stdio.
  warn: (message: string) => void;
};

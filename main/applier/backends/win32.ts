import type { ApplierBackend, ApplierCapabilities, BackendApplyResult } from '../applier.models.js';
import type { Win32Native } from './win32.models.js';

// Windows ApplierBackend: Fill style in the registry, then SystemParametersInfoW, then an
// asynchronous WM_SETTINGCHANGE broadcast so the apply never waits on other windows.

// WallpaperStyle 10 + TileWallpaper 0 = Fill, applied to every monitor.
const FILL_STYLE: ReadonlyArray<[name: string, value: string]> = [
  ['WallpaperStyle', '10'],
  ['TileWallpaper', '0'],
];

const CAPABILITIES: ApplierCapabilities = {
  backend: 'win32-spi',
  perMonitor: false,
  coversAllWorkspaces: false,
  persistsWithoutApp: true,
};

export function createWin32Backend(native: Win32Native): ApplierBackend {
  return {
    async apply(imagePath): Promise<BackendApplyResult> {
      // Only write what differs, so a steady-state apply doesn't touch the registry.
      for (const [name, value] of FILL_STYLE) {
        if (native.readDesktopString(name) !== value) {
          native.writeDesktopString(name, value);
        }
      }

      if (!native.setDeskWallpaper(imagePath)) {
        const code = native.getLastError();
        return {
          kind: 'error',
          error: 'os-rejected',
          code,
          message: `Windows rejected the wallpaper (SystemParametersInfoW error ${code})`,
        };
      }

      native.notifyWallpaperChanged();
      return { kind: 'applied' };
    },
    capabilities: () => CAPABILITIES,
  };
}

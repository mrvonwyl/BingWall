import type { ApplierBackend, ApplierCapabilities, BackendApplyResult } from '../applier.models.js';
import type { Win32BackendLog, Win32Native } from './win32.models.js';

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

const CONSOLE_LOG: Win32BackendLog = { warn: (message) => console.warn(message) };

export function createWin32Backend(native: Win32Native, log: Win32BackendLog = CONSOLE_LOG): ApplierBackend {
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

      // The wallpaper is set either way, so a failed broadcast is only logged. It may fail because MSDN
      // forbids pointer parameters below WM_USER in async sends (ERROR_MESSAGE_SYNC_ONLY): see the spec's
      // broadcast caveat (#41) and the manual acceptance check in #52, which decides whether to switch
      // to SendMessageTimeoutW.
      if (!native.notifyWallpaperChanged()) {
        const code = native.getLastError();
        log.warn(`BingWall applier: WM_SETTINGCHANGE broadcast (SendNotifyMessageW) failed, error ${code}`);
      }
      return { kind: 'applied' };
    },
    capabilities: () => CAPABILITIES,
  };
}

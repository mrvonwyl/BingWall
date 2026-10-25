import koffi from 'koffi';
import type { Win32Native } from './win32.models.js';

// koffi bindings for the win32 backend. Loaded only inside the applier child (and the
// opt-in integration test), never on Electron's main thread.

// HKEY_CURRENT_USER is (HKEY)(LONG)0x80000001, i.e. sign-extended on x64.
const HKEY_CURRENT_USER = -2147483647;
const DESKTOP_SUBKEY = 'Control Panel\\Desktop';
const REG_SZ = 1;
const RRF_RT_REG_SZ = 0x2;
const ERROR_SUCCESS = 0;

const SPI_SETDESKWALLPAPER = 0x0014;
const SPIF_UPDATEINIFILE = 0x01;

const HWND_BROADCAST = 0xffff;
const WM_SETTINGCHANGE = 0x001a;

const user32 = koffi.load('user32.dll');
const advapi32 = koffi.load('advapi32.dll');
const kernel32 = koffi.load('kernel32.dll');

const SystemParametersInfoW = user32.func(
  'int __stdcall SystemParametersInfoW(uint32_t action, uint32_t uiParam, const char16_t *pvParam, uint32_t winIni)',
);
const SendNotifyMessageW = user32.func(
  'int __stdcall SendNotifyMessageW(intptr_t hWnd, uint32_t msg, uintptr_t wParam, const char16_t *lParam)',
);
const RegGetValueW = advapi32.func(
  'long __stdcall RegGetValueW(intptr_t hkey, const char16_t *subKey, const char16_t *value, uint32_t flags, void *type, _Out_ void *data, _Inout_ uint32_t *cbData)',
);
const RegSetKeyValueW = advapi32.func(
  'long __stdcall RegSetKeyValueW(intptr_t hkey, const char16_t *subKey, const char16_t *valueName, uint32_t type, const char16_t *data, uint32_t cbData)',
);
const GetLastError = kernel32.func('uint32_t __stdcall GetLastError()');

export const win32Native: Win32Native = {
  readDesktopString(name) {
    const buffer = Buffer.alloc(128);
    const size = [buffer.length];
    const status: number = RegGetValueW(HKEY_CURRENT_USER, DESKTOP_SUBKEY, name, RRF_RT_REG_SZ, null, buffer, size);
    if (status !== ERROR_SUCCESS) {
      return null;
    }
    const text = buffer.toString('utf16le', 0, size[0]);
    const terminator = text.indexOf('\0');
    return terminator === -1 ? text : text.slice(0, terminator);
  },

  writeDesktopString(name, value) {
    const status: number = RegSetKeyValueW(HKEY_CURRENT_USER, DESKTOP_SUBKEY, name, REG_SZ, value, (value.length + 1) * 2);
    if (status !== ERROR_SUCCESS) {
      throw new Error(`RegSetKeyValueW(${DESKTOP_SUBKEY}\\${name}) failed: ${status}`);
    }
  },

  setDeskWallpaper(imagePath) {
    return SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, imagePath, SPIF_UPDATEINIFILE) !== 0;
  },

  getLastError() {
    return GetLastError() as number;
  },

  // Not SPIF_SENDCHANGE / SendMessageTimeout: those wait on every top-level window
  // (1-5 s when the accent colour follows the wallpaper). SendNotifyMessageW returns at once.
  // Broadcast caveat (spec #41): MSDN says async sends can't carry a pointer for a message below
  // WM_USER and may fail with ERROR_MESSAGE_SYNC_ONLY. Whether receivers get the string is a manual
  // acceptance check (#52); if it fails, this switches to SendMessageTimeoutW + SMTO_ABORTIFHUNG.
  notifyWallpaperChanged() {
    return SendNotifyMessageW(HWND_BROADCAST, WM_SETTINGCHANGE, SPI_SETDESKWALLPAPER, DESKTOP_SUBKEY) !== 0;
  },
};

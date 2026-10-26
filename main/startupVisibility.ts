import { DEFAULT_SETTINGS, type Settings } from './settings.models.js';
import type { LoginItemSettings, StartupVisibilityInput } from './startupVisibility.models.js';

// Passed by the login item, so a login start can be told apart from a manual one. Electron's
// wasOpenedAtLogin is only set on macOS.
export const LOGIN_START_ARG = '--hidden';

export function wasOpenedAtLogin(argv: readonly string[]): boolean {
  return argv.includes(LOGIN_START_ARG);
}

// Used both to register the login item and to query it: on Windows, openAtLogin only reports true
// when queried with the same args the item was registered with.
export function loginItemSettings(openAtLogin: boolean): LoginItemSettings {
  return { openAtLogin, args: [LOGIN_START_ARG] };
}

// A settings file that can't be read must not keep the app from starting with its tray and window.
export async function readStartupSettings(
  read: () => Promise<Settings>,
  logError: (message: string, error: unknown) => void,
): Promise<Settings> {
  try {
    return await read();
  } catch (error) {
    logError('BingWall: could not read settings at startup, using defaults', error);
    return DEFAULT_SETTINGS;
  }
}

// A login start always stays hidden in the tray; a manual start shows the window only with "Start minimized" off.
export function shouldShowWindowAtStartup({ startMinimized, openedAtLogin }: StartupVisibilityInput): boolean {
  return !openedAtLogin && !startMinimized;
}

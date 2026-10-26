import type { StartupVisibilityInput } from './startupVisibility.models.js';

// A login start always stays hidden in the tray; a manual start shows the window only with "Start minimized" off.
export function shouldShowWindowAtStartup({ startMinimized, openedAtLogin }: StartupVisibilityInput): boolean {
  return !openedAtLogin && !startMinimized;
}

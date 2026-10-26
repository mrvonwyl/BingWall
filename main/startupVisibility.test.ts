import { describe, expect, it } from 'vitest';
import { shouldShowWindowAtStartup } from './startupVisibility.js';

describe('shouldShowWindowAtStartup', () => {
  it.each([
    { startMinimized: true, openedAtLogin: true, show: false },
    { startMinimized: true, openedAtLogin: false, show: false },
    { startMinimized: false, openedAtLogin: true, show: false },
    { startMinimized: false, openedAtLogin: false, show: true },
  ])('startMinimized $startMinimized, opened at login $openedAtLogin: shows the window $show', ({ startMinimized, openedAtLogin, show }) => {
    expect(shouldShowWindowAtStartup({ startMinimized, openedAtLogin })).toBe(show);
  });
});

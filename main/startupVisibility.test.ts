import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './settings.models.js';
import {
  LOGIN_START_ARG,
  loginItemSettings,
  readStartupSettings,
  shouldShowWindowAtStartup,
  wasOpenedAtLogin,
} from './startupVisibility.js';

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

describe('wasOpenedAtLogin', () => {
  it('is true when the login start argument was passed', () => {
    expect(wasOpenedAtLogin(['C:\\BingWall\\BingWall.exe', LOGIN_START_ARG])).toBe(true);
  });

  it('is false for a manual start without the argument', () => {
    expect(wasOpenedAtLogin(['C:\\BingWall\\BingWall.exe'])).toBe(false);
  });

  it('ignores arguments that only contain the login start argument', () => {
    expect(wasOpenedAtLogin(['C:\\BingWall\\BingWall.exe', `${LOGIN_START_ARG}=no`, `x${LOGIN_START_ARG}`])).toBe(false);
  });
});

describe('loginItemSettings', () => {
  it.each([true, false])('registers the login item (openAtLogin %s) with the login start argument', (openAtLogin) => {
    expect(loginItemSettings(openAtLogin)).toEqual({ openAtLogin, args: [LOGIN_START_ARG] });
  });
});

describe('readStartupSettings', () => {
  it('returns the stored settings', async () => {
    const stored = { ...DEFAULT_SETTINGS, startMinimized: false };
    const logError = vi.fn();

    await expect(readStartupSettings(async () => stored, logError)).resolves.toBe(stored);
    expect(logError).not.toHaveBeenCalled();
  });

  it('falls back to the defaults and logs when the settings cannot be read', async () => {
    const error = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const logError = vi.fn();

    await expect(
      readStartupSettings(async () => {
        throw error;
      }, logError),
    ).resolves.toEqual(DEFAULT_SETTINGS);
    expect(logError).toHaveBeenCalledWith(expect.any(String), error);
  });
});

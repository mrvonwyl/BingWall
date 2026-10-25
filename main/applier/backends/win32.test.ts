import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWin32Backend } from './win32.js';
import type { Win32Native } from './win32.models.js';

// Records the native calls in order; the registry is a plain map.
function fakeNative(registry: Record<string, string>, spiSucceeds = true, lastError = 0) {
  const calls: string[] = [];
  const native: Win32Native = {
    readDesktopString: (name) => registry[name] ?? null,
    writeDesktopString: (name, value) => {
      calls.push(`write ${name}=${value}`);
      registry[name] = value;
    },
    setDeskWallpaper: (imagePath) => {
      calls.push(`spi ${imagePath}`);
      return spiSucceeds;
    },
    getLastError: () => lastError,
    notifyWallpaperChanged: () => {
      calls.push('notify');
    },
  };
  return { native, calls };
}

describe('win32 backend', () => {
  it('writes Fill style before the SPI call, then notifies other windows', async () => {
    const { native, calls } = fakeNative({ WallpaperStyle: '2', TileWallpaper: '1' });

    const result = await createWin32Backend(native).apply('C:\\a.jpg');

    expect(result).toEqual({ kind: 'applied' });
    expect(calls).toEqual(['write WallpaperStyle=10', 'write TileWallpaper=0', 'spi C:\\a.jpg', 'notify']);
  });

  it('leaves the style values alone when they are already Fill', async () => {
    const { native, calls } = fakeNative({ WallpaperStyle: '10', TileWallpaper: '0' });

    await createWin32Backend(native).apply('C:\\a.jpg');

    expect(calls).toEqual(['spi C:\\a.jpg', 'notify']);
  });

  it('writes style values that are missing', async () => {
    const { native, calls } = fakeNative({});

    await createWin32Backend(native).apply('C:\\a.jpg');

    expect(calls.slice(0, 2)).toEqual(['write WallpaperStyle=10', 'write TileWallpaper=0']);
  });

  it('replies os-rejected with GetLastError() and does not notify when SPI fails', async () => {
    const { native, calls } = fakeNative({ WallpaperStyle: '10', TileWallpaper: '0' }, false, 1813);

    const result = await createWin32Backend(native).apply('C:\\a.jpg');

    expect(result).toMatchObject({ kind: 'error', error: 'os-rejected', code: 1813 });
    expect(calls).toEqual(['spi C:\\a.jpg']);
  });

  it('describes itself as a whole-desktop, persistent backend', () => {
    const { native } = fakeNative({});

    expect(createWin32Backend(native).capabilities()).toEqual({
      backend: 'win32-spi',
      perMonitor: false,
      coversAllWorkspaces: false,
      persistsWithoutApp: true,
    });
  });
});

// Opt-in: this changes the real desktop wallpaper (and restores it afterwards).
// Run by hand with `$env:BINGWALL_WIN32_IT = '1'; npx vitest run main/applier/backends`.
const enabled = process.platform === 'win32' && process.env.BINGWALL_WIN32_IT === '1';

const DESKTOP_KEY = 'HKCU\\Control Panel\\Desktop';

// A 16x9 solid-colour baseline JPEG.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAJABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDweiiiv3M/LD//2Q==';

function readDesktopValue(name: string): string | null {
  try {
    const output = execFileSync('reg', ['query', DESKTOP_KEY, '/v', name], { encoding: 'utf-8' });
    const match = new RegExp(`^\\s*${name}\\s+REG_\\w+\\s*(.*)$`, 'm').exec(output);
    return match ? match[1].trim() : '';
  } catch {
    return null;
  }
}

function writeDesktopString(name: string, value: string): void {
  execFileSync('reg', ['add', DESKTOP_KEY, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { stdio: 'ignore' });
}

describe.skipIf(!enabled)('win32 backend (BINGWALL_WIN32_IT)', () => {
  let tempDir: string;
  let previous: { wallpaper: string | null; style: string | null; tile: string | null };

  beforeAll(async () => {
    previous = {
      wallpaper: readDesktopValue('Wallpaper'),
      style: readDesktopValue('WallpaperStyle'),
      tile: readDesktopValue('TileWallpaper'),
    };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bingwall-win32-it-'));
  });

  afterAll(async () => {
    const { win32Native } = await import('./win32Native.js');
    if (previous.style !== null) {
      writeDesktopString('WallpaperStyle', previous.style);
    }
    if (previous.tile !== null) {
      writeDesktopString('TileWallpaper', previous.tile);
    }
    // Straight SPI, so the restored style is kept rather than forced back to Fill.
    win32Native.setDeskWallpaper(previous.wallpaper ?? '');
    win32Native.notifyWallpaperChanged();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('applies a JPG with Fill and records it in the registry', async () => {
    const { win32Native } = await import('./win32Native.js');
    const imagePath = path.join(tempDir, 'bingwall-it.jpg');
    await fs.writeFile(imagePath, Buffer.from(TINY_JPEG_BASE64, 'base64'));
    // Start from a different style so the backend has to write it.
    writeDesktopString('WallpaperStyle', '2');
    writeDesktopString('TileWallpaper', '1');

    const result = await createWin32Backend(win32Native).apply(imagePath);

    expect(result).toEqual({ kind: 'applied' });
    expect(readDesktopValue('Wallpaper')?.toLowerCase()).toBe(imagePath.toLowerCase());
    expect(readDesktopValue('WallpaperStyle')).toBe('10');
    expect(readDesktopValue('TileWallpaper')).toBe('0');
  });

});

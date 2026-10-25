import koffi from 'koffi';
import type { Guid, Monitor, Rect } from './desktopWallpaperCom.models.js';

// Thin, un-opinionated IDesktopWallpaper wrapper: one method per COM call, so the
// profiler can time each call individually. Mirrors the removed main/nativeWallpaper.ts (baseline).

koffi.struct('GUID', {
  data1: 'uint32_t',
  data2: 'uint16_t',
  data3: 'uint16_t',
  data4: koffi.array('uint8_t', 8),
});

koffi.struct('RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });

const CLSID_DESKTOP_WALLPAPER: Guid = {
  data1: 0xc2cf3110,
  data2: 0x460e,
  data3: 0x4fc1,
  data4: [0xb9, 0xd0, 0x8a, 0x1c, 0x0c, 0x9c, 0xc4, 0xbd],
};

const IID_IDESKTOP_WALLPAPER: Guid = {
  data1: 0xb92b56a9,
  data2: 0x8b55,
  data3: 0x4e14,
  data4: [0x9a, 0x89, 0x01, 0x99, 0xbb, 0xb6, 0xf9, 0x3b],
};

const CLSCTX_LOCAL_SERVER = 0x4;
const COINIT_APARTMENTTHREADED = 0x2;
const RPC_E_CHANGED_MODE = -2147417850;
const DWPOS_FILL = 4;

const POINTER_SIZE = koffi.sizeof('void *');

// IDesktopWallpaper vtable slot indices (after the 3 IUnknown methods)
const VTABLE_RELEASE = 2;
const VTABLE_SET_WALLPAPER = 3;
const VTABLE_GET_WALLPAPER = 4;
const VTABLE_GET_MONITOR_DEVICE_PATH_AT = 5;
const VTABLE_GET_MONITOR_DEVICE_PATH_COUNT = 6;
const VTABLE_GET_MONITOR_RECT = 7;
const VTABLE_SET_POSITION = 10;

const ole32 = koffi.load('ole32.dll');

const CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void *pvReserved, uint32_t dwCoInit)');
const CoCreateInstance = ole32.func(
  'long __stdcall CoCreateInstance(const GUID *rclsid, void *pUnkOuter, uint32_t dwClsContext, const GUID *riid, _Out_ void **ppv)',
);
const CoTaskMemFree = ole32.func('void __stdcall CoTaskMemFree(void *pv)');

const ReleaseProto = koffi.proto('unsigned long __stdcall ReleaseProto(void *self)');
const SetPositionProto = koffi.proto('long __stdcall SetPositionProto(void *self, int position)');
const SetWallpaperProto = koffi.proto(
  'long __stdcall SetWallpaperProto(void *self, const char16_t *monitorId, const char16_t *wallpaper)',
);
const GetWallpaperProto = koffi.proto(
  'long __stdcall GetWallpaperProto(void *self, const char16_t *monitorId, _Out_ void **wallpaper)',
);
const GetMonitorDevicePathAtProto = koffi.proto(
  'long __stdcall GetMonitorDevicePathAtProto(void *self, uint32_t monitorIndex, _Out_ void **monitorId)',
);
const GetMonitorDevicePathCountProto = koffi.proto(
  'long __stdcall GetMonitorDevicePathCountProto(void *self, _Out_ uint32_t *count)',
);
const GetMonitorRectProto = koffi.proto(
  'long __stdcall GetMonitorRectProto(void *self, const char16_t *monitorId, _Out_ RECT *displayRect)',
);

function throwIfFailed(hr: number, operation: string): void {
  if (hr < 0) {
    throw new Error(`${operation} failed: 0x${(hr >>> 0).toString(16)}`);
  }
}

export function initCom(): void {
  const hr: number = CoInitializeEx(null, COINIT_APARTMENTTHREADED);
  if (hr < 0 && hr !== RPC_E_CHANGED_MODE) {
    throw new Error(`CoInitializeEx failed: 0x${(hr >>> 0).toString(16)}`);
  }
}

function takeCoTaskString(ptr: unknown): string | null {
  if (!ptr) {
    return null;
  }
  try {
    return koffi.decode.wstring(ptr) as string;
  } finally {
    CoTaskMemFree(ptr);
  }
}

export class DesktopWallpaper {
  private constructor(private readonly self: unknown) {}

  static create(): DesktopWallpaper {
    const ppv: unknown[] = [null];
    const hr: number = CoCreateInstance(CLSID_DESKTOP_WALLPAPER, null, CLSCTX_LOCAL_SERVER, IID_IDESKTOP_WALLPAPER, ppv);
    throwIfFailed(hr, 'CoCreateInstance(IDesktopWallpaper)');
    if (!ppv[0]) {
      throw new Error('CoCreateInstance(IDesktopWallpaper) returned a null interface pointer');
    }
    return new DesktopWallpaper(ppv[0]);
  }

  private method(index: number): unknown {
    const vtablePtr = koffi.decode(this.self, 'void *');
    return koffi.decode(vtablePtr, index * POINTER_SIZE, 'void *');
  }

  setPositionFill(): void {
    const hr: number = koffi.call(this.method(VTABLE_SET_POSITION), SetPositionProto, this.self, DWPOS_FILL);
    throwIfFailed(hr, 'IDesktopWallpaper::SetPosition');
  }

  monitorCount(): number {
    const count: number[] = [0];
    const hr: number = koffi.call(this.method(VTABLE_GET_MONITOR_DEVICE_PATH_COUNT), GetMonitorDevicePathCountProto, this.self, count);
    throwIfFailed(hr, 'IDesktopWallpaper::GetMonitorDevicePathCount');
    return count[0];
  }

  monitorIdAt(index: number): string {
    const out: unknown[] = [null];
    const hr: number = koffi.call(this.method(VTABLE_GET_MONITOR_DEVICE_PATH_AT), GetMonitorDevicePathAtProto, this.self, index, out);
    throwIfFailed(hr, 'IDesktopWallpaper::GetMonitorDevicePathAt');
    const id = takeCoTaskString(out[0]);
    if (id === null) {
      throw new Error(`IDesktopWallpaper::GetMonitorDevicePathAt(${index}) returned null`);
    }
    return id;
  }

  // Null for monitors Windows remembers but that aren't attached right now.
  monitorRect(monitorId: string): Rect | null {
    const rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
    const hr: number = koffi.call(this.method(VTABLE_GET_MONITOR_RECT), GetMonitorRectProto, this.self, monitorId, rect);
    return hr < 0 ? null : rect;
  }

  // Every monitor path IDesktopWallpaper knows about, attached or not.
  monitors(): Monitor[] {
    const result: Monitor[] = [];
    const count = this.monitorCount();
    for (let index = 0; index < count; index++) {
      const id = this.monitorIdAt(index);
      const rect = this.monitorRect(id);
      result.push({
        index,
        id,
        rect,
        width: rect ? rect.right - rect.left : 0,
        height: rect ? rect.bottom - rect.top : 0,
      });
    }
    return result;
  }

  getWallpaper(monitorId: string): string | null {
    const out: unknown[] = [null];
    const hr: number = koffi.call(this.method(VTABLE_GET_WALLPAPER), GetWallpaperProto, this.self, monitorId, out);
    throwIfFailed(hr, 'IDesktopWallpaper::GetWallpaper');
    return takeCoTaskString(out[0]);
  }

  // monitorId null applies the image to every monitor in one call.
  setWallpaper(monitorId: string | null, imagePath: string): void {
    const hr: number = koffi.call(this.method(VTABLE_SET_WALLPAPER), SetWallpaperProto, this.self, monitorId, imagePath);
    throwIfFailed(hr, 'IDesktopWallpaper::SetWallpaper');
  }

  release(): void {
    koffi.call(this.method(VTABLE_RELEASE), ReleaseProto, this.self);
  }
}

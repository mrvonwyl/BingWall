import koffi from 'koffi';

type Guid = { data1: number; data2: number; data3: number; data4: number[] };

const GUID = koffi.struct('GUID', {
  data1: 'uint32_t',
  data2: 'uint16_t',
  data3: 'uint16_t',
  data4: koffi.array('uint8_t', 8),
});

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

// IDesktopWallpaper is hosted by an out-of-process surrogate (AppID RunAs "Interactive User"),
// not an in-proc DLL, so it must be created with CLSCTX_LOCAL_SERVER.
const CLSCTX_LOCAL_SERVER = 0x4;
const COINIT_APARTMENTTHREADED = 0x2;
const RPC_E_CHANGED_MODE = -2147417850;

// DESKTOP_WALLPAPER_POSITION: DWPOS_FILL
const DWPOS_FILL = 4;

const POINTER_SIZE = koffi.sizeof('void *');

// IDesktopWallpaper vtable slot indices (after the 3 IUnknown methods)
const VTABLE_RELEASE = 2;
const VTABLE_SET_WALLPAPER = 3;
const VTABLE_GET_MONITOR_DEVICE_PATH_AT = 5;
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
const GetMonitorDevicePathAtProto = koffi.proto(
  'long __stdcall GetMonitorDevicePathAtProto(void *self, uint32_t monitorIndex, _Out_ void **monitorId)',
);

let comInitialized = false;

function ensureComInitialized(): void {
  if (comInitialized) {
    return;
  }

  const hr = CoInitializeEx(null, COINIT_APARTMENTTHREADED);
  if (hr < 0 && hr !== RPC_E_CHANGED_MODE) {
    throw new Error(`CoInitializeEx failed: 0x${(hr >>> 0).toString(16)}`);
  }

  comInitialized = true;
}

function vtableMethod(interfacePtr: unknown, index: number): unknown {
  const vtablePtr = koffi.decode(interfacePtr, 'void *');
  return koffi.decode(vtablePtr, index * POINTER_SIZE, 'void *');
}

function throwIfFailed(hr: number, operation: string): void {
  if (hr < 0) {
    throw new Error(`${operation} failed: 0x${(hr >>> 0).toString(16)}`);
  }
}

export async function setNativeWallpaper(imagePath: string): Promise<void> {
  ensureComInitialized();

  const ppv: unknown[] = [null];
  const createHr: number = CoCreateInstance(CLSID_DESKTOP_WALLPAPER, null, CLSCTX_LOCAL_SERVER, IID_IDESKTOP_WALLPAPER, ppv);
  throwIfFailed(createHr, 'CoCreateInstance(IDesktopWallpaper)');

  const desktopWallpaper = ppv[0];
  if (!desktopWallpaper) {
    throw new Error('CoCreateInstance(IDesktopWallpaper) returned a null interface pointer');
  }

  try {
    const monitorIdPtr: unknown[] = [null];
    const getMonitorHr: number = koffi.call(
      vtableMethod(desktopWallpaper, VTABLE_GET_MONITOR_DEVICE_PATH_AT),
      GetMonitorDevicePathAtProto,
      desktopWallpaper,
      0,
      monitorIdPtr,
    );
    throwIfFailed(getMonitorHr, 'IDesktopWallpaper::GetMonitorDevicePathAt');

    const monitorId = monitorIdPtr[0];
    try {
      const monitorIdString = monitorId ? koffi.decode.wstring(monitorId) : null;

      const setPositionHr: number = koffi.call(
        vtableMethod(desktopWallpaper, VTABLE_SET_POSITION),
        SetPositionProto,
        desktopWallpaper,
        DWPOS_FILL,
      );
      throwIfFailed(setPositionHr, 'IDesktopWallpaper::SetPosition');

      const setWallpaperHr: number = koffi.call(
        vtableMethod(desktopWallpaper, VTABLE_SET_WALLPAPER),
        SetWallpaperProto,
        desktopWallpaper,
        monitorIdString,
        imagePath,
      );
      throwIfFailed(setWallpaperHr, 'IDesktopWallpaper::SetWallpaper');
    } finally {
      if (monitorId) {
        CoTaskMemFree(monitorId);
      }
    }
  } finally {
    koffi.call(vtableMethod(desktopWallpaper, VTABLE_RELEASE), ReleaseProto, desktopWallpaper);
  }
}

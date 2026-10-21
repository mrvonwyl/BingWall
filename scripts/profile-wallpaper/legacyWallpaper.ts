import koffi from 'koffi';
import type { Guid } from './desktopWallpaperCom.models.js';
// Registers the GUID struct used by CoCreateInstance below.
import './desktopWallpaperCom.js';

// The two older ways to set a wallpaper, for comparison with IDesktopWallpaper:
// SystemParametersInfo(SPI_SETDESKWALLPAPER) and the shell's IActiveDesktop.

// HKEY_CURRENT_USER is (HKEY)(LONG)0x80000001, i.e. sign-extended on x64.
const HKEY_CURRENT_USER = -2147483647;
const REG_SZ = 1;
const RRF_RT_REG_DWORD = 0x10;

const SPI_SETDESKWALLPAPER = 0x0014;
const SPIF_UPDATEINIFILE = 0x01;
const SPIF_SENDCHANGE = 0x02;

const CLSCTX_INPROC_SERVER = 0x1;
const WPSTYLE_CROPTOFIT = 4;
const AD_APPLY_ALL = 0x07;
const AD_APPLY_FORCE = 0x08;
const AD_APPLY_BUFFERED_REFRESH = 0x10;

const CLSID_ACTIVE_DESKTOP: Guid = {
  data1: 0x75048700,
  data2: 0xef1f,
  data3: 0x11d0,
  data4: [0x98, 0x88, 0x00, 0x60, 0x97, 0xde, 0xac, 0xf9],
};

const IID_IACTIVE_DESKTOP: Guid = {
  data1: 0xf490eb00,
  data2: 0x1240,
  data3: 0x11d1,
  data4: [0x98, 0x88, 0x00, 0x60, 0x97, 0xde, 0xac, 0xf9],
};

const POINTER_SIZE = koffi.sizeof('void *');

// IActiveDesktop vtable slot indices (after the 3 IUnknown methods)
const VTABLE_RELEASE = 2;
const VTABLE_APPLY_CHANGES = 3;
const VTABLE_SET_WALLPAPER = 5;
const VTABLE_SET_WALLPAPER_OPTIONS = 7;

koffi.struct('WALLPAPEROPT', { dwSize: 'uint32_t', dwStyle: 'uint32_t' });

const user32 = koffi.load('user32.dll');
const advapi32 = koffi.load('advapi32.dll');
const ole32 = koffi.load('ole32.dll');

const SystemParametersInfoW = user32.func(
  'int __stdcall SystemParametersInfoW(uint32_t action, uint32_t uiParam, const char16_t *pvParam, uint32_t winIni)',
);
const RegSetKeyValueW = advapi32.func(
  'long __stdcall RegSetKeyValueW(intptr_t hkey, const char16_t *subKey, const char16_t *valueName, uint32_t type, const char16_t *data, uint32_t cbData)',
);
const RegGetValueW = advapi32.func(
  'long __stdcall RegGetValueW(intptr_t hkey, const char16_t *subKey, const char16_t *value, uint32_t flags, void *type, _Out_ uint32_t *data, _Inout_ uint32_t *cbData)',
);
const CoCreateInstance = ole32.func(
  'long __stdcall CoCreateInstance(const GUID *rclsid, void *pUnkOuter, uint32_t dwClsContext, const GUID *riid, _Out_ void **ppv)',
);

const ReleaseProto = koffi.proto('unsigned long __stdcall IActiveDesktopRelease(void *self)');
const ApplyChangesProto = koffi.proto('long __stdcall IActiveDesktopApplyChanges(void *self, uint32_t flags)');
const SetWallpaperProto = koffi.proto(
  'long __stdcall IActiveDesktopSetWallpaper(void *self, const char16_t *wallpaper, uint32_t reserved)',
);
const SetWallpaperOptionsProto = koffi.proto(
  'long __stdcall IActiveDesktopSetWallpaperOptions(void *self, const WALLPAPEROPT *options, uint32_t reserved)',
);

function throwIfFailed(hr: number, operation: string): void {
  if (hr < 0) {
    throw new Error(`${operation} failed: 0x${(hr >>> 0).toString(16)}`);
  }
}

function setUserString(subKey: string, name: string, value: string): void {
  const status: number = RegSetKeyValueW(HKEY_CURRENT_USER, subKey, name, REG_SZ, value, (value.length + 1) * 2);
  if (status !== 0) {
    throw new Error(`RegSetKeyValueW(${subKey}\\${name}) failed: ${status}`);
  }
}

// Null when the value doesn't exist.
export function readUserDword(subKey: string, name: string): number | null {
  const data: number[] = [0];
  const size: number[] = [4];
  const status: number = RegGetValueW(HKEY_CURRENT_USER, subKey, name, RRF_RT_REG_DWORD, null, data, size);
  return status === 0 ? data[0] >>> 0 : null;
}

// What the classic Personalize page and SPI-based tools do: style in the registry,
// then one synchronous SPI call that also broadcasts WM_SETTINGCHANGE.
export function setFillStyleInRegistry(): void {
  setUserString('Control Panel\\Desktop', 'WallpaperStyle', '10');
  setUserString('Control Panel\\Desktop', 'TileWallpaper', '0');
}

export function systemParametersInfoSetWallpaper(imagePath: string): void {
  if (!SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, imagePath, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)) {
    throw new Error('SystemParametersInfoW(SPI_SETDESKWALLPAPER) failed');
  }
}

export class ActiveDesktop {
  private constructor(private readonly self: unknown) {}

  static create(): ActiveDesktop {
    const ppv: unknown[] = [null];
    const hr: number = CoCreateInstance(CLSID_ACTIVE_DESKTOP, null, CLSCTX_INPROC_SERVER, IID_IACTIVE_DESKTOP, ppv);
    throwIfFailed(hr, 'CoCreateInstance(IActiveDesktop)');
    if (!ppv[0]) {
      throw new Error('CoCreateInstance(IActiveDesktop) returned a null interface pointer');
    }
    return new ActiveDesktop(ppv[0]);
  }

  private method(index: number): unknown {
    const vtablePtr = koffi.decode(this.self, 'void *');
    return koffi.decode(vtablePtr, index * POINTER_SIZE, 'void *');
  }

  setWallpaper(imagePath: string): void {
    const hr: number = koffi.call(this.method(VTABLE_SET_WALLPAPER), SetWallpaperProto, this.self, imagePath, 0);
    throwIfFailed(hr, 'IActiveDesktop::SetWallpaper');
  }

  setStyleFill(): void {
    const options = { dwSize: koffi.sizeof('WALLPAPEROPT'), dwStyle: WPSTYLE_CROPTOFIT };
    const hr: number = koffi.call(this.method(VTABLE_SET_WALLPAPER_OPTIONS), SetWallpaperOptionsProto, this.self, options, 0);
    throwIfFailed(hr, 'IActiveDesktop::SetWallpaperOptions');
  }

  applyChanges(): void {
    const hr: number = koffi.call(
      this.method(VTABLE_APPLY_CHANGES),
      ApplyChangesProto,
      this.self,
      AD_APPLY_ALL | AD_APPLY_FORCE | AD_APPLY_BUFFERED_REFRESH,
    );
    throwIfFailed(hr, 'IActiveDesktop::ApplyChanges');
  }

  release(): void {
    koffi.call(this.method(VTABLE_RELEASE), ReleaseProto, this.self);
  }
}

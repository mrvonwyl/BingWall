# Wallpaper apply profile — 2026-10-21T21:27:59.617Z

- OS: Windows 11 Home (10.0.26200)
- Electron: 32.3.3
- Settle window: 1500 ms
- Environment "signalrgb-closed": AutoColorization=1, transparency=1, Dynamic Lighting=1 (uses accent: 1), running: lghub_agent.exe
- Monitor 0: 2560×1440 at (3440, 0)
- Monitor 1: 3440×1440 at (0, 0)
- Monitor 2: not attached (still gets a SetWallpaper call in per-monitor mode)
- Source 2026-10-19.jpg: 2026-10-19.jpg 3840×2160 3.8 MB; src0-full.bmp 3840×2160 24.9 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-3440x1440.jpg 3440×1440 1.1 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-2560x1440.bmp 2560×1440 11.1 MB; src0-3440x1440.bmp 3440×1440 14.9 MB; src0-2560x1440.bmp 2560×1440 11.1 MB
- Source 2026-10-20.jpg: 2026-10-20.jpg 3840×2160 3.7 MB; src1-full.bmp 3840×2160 24.9 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-3440x1440.jpg 3440×1440 1.1 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB; src1-3440x1440.bmp 3440×1440 14.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB

## Medians per variant (ms)

| Variant | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap | Accent changed |
|---|---|---|---|---|---|---|---|---|
| full-jpg / per-monitor | 4.3 | 1527 | 2743 | 1000 | – | 980 | 51 | 3/3 |
| full-jpg / spi | 3554 | 1428 | 1579 | 1797 | – | 767 | 56 | 3/3 |
| full-jpg / active-desktop | 4376 | 1765 | 1778 | 2719 | – | 1037 | 54 | 3/3 |

## All trials (ms)

| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | full-jpg / per-monitor | 0 | CoCreateInstance 0.8<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.2<br>SetWallpaper(monitor 0) 1.4<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.7 | 2665 | 2665 | 88 | 1750 | – | 4184 | 868 | 60 |
| 2 | full-jpg / per-monitor | 1 | CoCreateInstance 0.8<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.2 | 4.3 | 641 | 5278 | 136 | 1000 | – | 6808 | 555 | 50 |
| 3 | full-jpg / spi | 1 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 3806 | 3806 | 142 | 142 | 83 | 1766 | – | 3806 | 1287 | 62 |
| 4 | full-jpg / active-desktop | 1 | CoCreateInstance(ActiveDesktop) 0.9<br>SetWallpaper 0.1<br>SetWallpaperOptions 0.0<br>Release 0.1<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 3530 | 1765 | 1765 | 96 | 1672 | – | 3530 | 1004 | 54 |
| 5 | full-jpg / per-monitor | 2 | CoCreateInstance 0.7<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.1 | 1527 | 1527 | 85 | 922 | – | 3044 | 1341 | 51 |
| 6 | full-jpg / spi | 2 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 3554 | 3554 | 1579 | 1579 | 100 | 1797 | – | 3554 | 648 | 52 |
| 7 | full-jpg / active-desktop | 2 | CoCreateInstance(ActiveDesktop) 0.2<br>SetWallpaper 0.0<br>SetWallpaperOptions 0.0<br>Release 0.0<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 5082 | 1778 | 1778 | 93 | 2719 | – | 5082 | 1037 | 51 |
| 8 | full-jpg / per-monitor | 3 | CoCreateInstance 0.8<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.2 | 4.3 | 2743 | 2743 | 89 | 1875 | – | 4245 | 980 | 62 |
| 9 | full-jpg / spi | 3 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 3138 | 3139 | 1428 | 6896 | 247 | 1953 | – | 8404 | 767 | 56 |
| 10 | full-jpg / active-desktop | 3 | CoCreateInstance(ActiveDesktop) 0.4<br>SetWallpaper 0.0<br>SetWallpaperOptions 0.0<br>Release 0.0<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 4376 | 1132 | 14999+ | 286 | 3266 | – | 15029 | 1532 | 62 |

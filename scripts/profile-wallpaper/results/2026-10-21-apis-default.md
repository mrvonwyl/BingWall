# Wallpaper apply profile — 2026-10-21T21:25:12.738Z

- OS: Windows 11 Home (10.0.26200)
- Electron: 32.3.3
- Settle window: 1500 ms
- Environment "default": AutoColorization=1, transparency=1, Dynamic Lighting=1 (uses accent: 1), running: SignalRgb.exe, lghub_agent.exe
- Monitor 0: 2560×1440 at (3440, 0)
- Monitor 1: 3440×1440 at (0, 0)
- Monitor 2: not attached (still gets a SetWallpaper call in per-monitor mode)
- Source 2026-10-19.jpg: 2026-10-19.jpg 3840×2160 3.8 MB; src0-full.bmp 3840×2160 24.9 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-3440x1440.jpg 3440×1440 1.1 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-2560x1440.bmp 2560×1440 11.1 MB; src0-3440x1440.bmp 3440×1440 14.9 MB; src0-2560x1440.bmp 2560×1440 11.1 MB
- Source 2026-10-20.jpg: 2026-10-20.jpg 3840×2160 3.7 MB; src1-full.bmp 3840×2160 24.9 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-3440x1440.jpg 3440×1440 1.1 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB; src1-3440x1440.bmp 3440×1440 14.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB

## Medians per variant (ms)

| Variant | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap | Accent changed |
|---|---|---|---|---|---|---|---|---|
| full-jpg / per-monitor | 4.2 | 1574 | 6752 | 1594 | – | 675 | 69 | 3/3 |
| full-jpg / spi | 1343 | 435 | 4957 | 594 | – | 296 | 59 | 3/3 |
| full-jpg / active-desktop | 4955 | 2014 | 6841 | 2953 | – | 1367 | 57 | 3/3 |

## All trials (ms)

| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | full-jpg / per-monitor | 0 | CoCreateInstance 0.8<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 1.3<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.2 | 5.2 | 710 | 14975+ | 448 | 4219 | – | 15021 | 1482 | 54 |
| 2 | full-jpg / per-monitor | 1 | CoCreateInstance 0.8<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.4 | 1574 | 1574 | 93 | 1594 | – | 3076 | 675 | 73 |
| 3 | full-jpg / spi | 1 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 1302 | 1302 | 158 | 4957 | 220 | 594 | – | 6464 | 296 | 55 |
| 4 | full-jpg / active-desktop | 1 | CoCreateInstance(ActiveDesktop) 1.4<br>SetWallpaper 0.1<br>SetWallpaperOptions 0.1<br>Release 0.1<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 4955 | 2014 | 6841 | 217 | 2953 | – | 8363 | 1367 | 57 |
| 5 | full-jpg / per-monitor | 2 | CoCreateInstance 1.0<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.0<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.7<br>Release 0.2 | 4.2 | 1678 | 7059 | 264 | 3797 | – | 8576 | 1302 | 69 |
| 6 | full-jpg / spi | 2 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 5175 | 5175 | 2137 | 6968 | 248 | 3250 | – | 8510 | 1602 | 59 |
| 7 | full-jpg / active-desktop | 2 | CoCreateInstance(ActiveDesktop) 0.3<br>SetWallpaper 0.0<br>SetWallpaperOptions 0.0<br>Release 0.0<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 5630 | 2078 | 7026 | 228 | 3141 | – | 8534 | 1816 | 59 |
| 8 | full-jpg / per-monitor | 3 | CoCreateInstance 0.7<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.2 | 1026 | 6752 | 236 | 875 | – | 8280 | 619 | 57 |
| 9 | full-jpg / spi | 3 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 1343 | 1343 | 435 | 435 | 107 | 578 | – | 1961 | 244 | 65 |
| 10 | full-jpg / active-desktop | 3 | CoCreateInstance(ActiveDesktop) 0.2<br>SetWallpaper 0.0<br>SetWallpaperOptions 0.0<br>Release 0.0<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 3919 | 1500 | 1500 | 99 | 1672 | – | 3919 | 805 | 49 |

# Wallpaper apply profile — 2026-10-21T21:26:59.625Z

- OS: Windows 11 Home (10.0.26200)
- Electron: 32.3.3
- Settle window: 1500 ms
- Environment "autocolorization-off": AutoColorization=0, transparency=1, Dynamic Lighting=1 (uses accent: 1), running: SignalRgb.exe, lghub_agent.exe
- Monitor 0: 2560×1440 at (3440, 0)
- Monitor 1: 3440×1440 at (0, 0)
- Monitor 2: not attached (still gets a SetWallpaper call in per-monitor mode)
- Source 2026-10-19.jpg: 2026-10-19.jpg 3840×2160 3.8 MB; src0-full.bmp 3840×2160 24.9 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-3440x1440.jpg 3440×1440 1.1 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-2560x1440.bmp 2560×1440 11.1 MB; src0-3440x1440.bmp 3440×1440 14.9 MB; src0-2560x1440.bmp 2560×1440 11.1 MB
- Source 2026-10-20.jpg: 2026-10-20.jpg 3840×2160 3.7 MB; src1-full.bmp 3840×2160 24.9 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-3440x1440.jpg 3440×1440 1.1 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB; src1-3440x1440.bmp 3440×1440 14.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB

## Medians per variant (ms)

| Variant | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap | Accent changed |
|---|---|---|---|---|---|---|---|---|
| full-jpg / per-monitor | 4.4 | 465 | 497 | 234 | – | 64 | 50 | 0/3 |
| full-jpg / spi | 997 | 99 | 99 | 109 | – | 49 | 47 | 0/3 |
| full-jpg / active-desktop | 973 | 108 | 108 | 141 | – | 49 | 46 | 0/3 |

## All trials (ms)

| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | full-jpg / per-monitor | 0 | CoCreateInstance 0.8<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.3<br>GetMonitorDevicePathAt(1) 0.2<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.2 | 4.7 | 450 | 450 | 95 | 250 | – | 1963 | 64 | 45 |
| 2 | full-jpg / per-monitor | 1 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.4<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.9<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.9<br>Release 0.2 | 4.8 | 497 | 497 | 83 | 234 | – | 2003 | 64 | 50 |
| 3 | full-jpg / spi | 1 | Registry WallpaperStyle 0.2<br>SystemParametersInfo 1008 | 1008 | 111 | 111 | 91 | 141 | – | 1627 | 41 | 43 |
| 4 | full-jpg / active-desktop | 1 | CoCreateInstance(ActiveDesktop) 0.9<br>SetWallpaper 0.1<br>SetWallpaperOptions 0.0<br>Release 0.1<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 973 | 133 | 133 | 86 | 156 | – | 1652 | 51 | 44 |
| 5 | full-jpg / per-monitor | 2 | CoCreateInstance 0.8<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.2<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.9<br>Release 0.2 | 4.4 | 447 | 6802 | 250 | 313 | – | 8331 | 63 | 53 |
| 6 | full-jpg / spi | 2 | Registry WallpaperStyle 0.0<br>SystemParametersInfo 997 | 997 | 99 | 99 | 92 | 109 | – | 1617 | 49 | 55 |
| 7 | full-jpg / active-desktop | 2 | CoCreateInstance(ActiveDesktop) 0.1<br>SetWallpaper 0.0<br>SetWallpaperOptions 0.0<br>Release 0.0<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 948 | 108 | 108 | 87 | 141 | – | 1615 | 41 | 47 |
| 8 | full-jpg / per-monitor | 3 | CoCreateInstance 0.8<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.2<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.7<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.9<br>Release 0.2 | 4.3 | 465 | 465 | 84 | 234 | – | 1982 | 65 | 43 |
| 9 | full-jpg / spi | 3 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 964 | 964 | 81 | 81 | 83 | 109 | – | 1602 | 63 | 47 |
| 10 | full-jpg / active-desktop | 3 | CoCreateInstance(ActiveDesktop) 0.1<br>SetWallpaper 0.0<br>SetWallpaperOptions 0.0<br>Release 0.0<br>**IActiveDesktop::ApplyChanges failed: 0x800705b4** | 977 | 95 | 95 | 86 | 125 | – | 1606 | 49 | 46 |

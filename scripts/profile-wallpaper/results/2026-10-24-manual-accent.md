# Wallpaper apply profile — 2026-10-24T21:36:17.627Z

- OS: Windows 11 Home (10.0.26200)
- Electron: 32.3.3
- Settle window: 1500 ms
- Environment "manual-accent-dynamic-lighting-off": AutoColorization=0, transparency=1, Dynamic Lighting=0 (uses accent: 1), running: SignalRgb.exe, lghub_agent.exe
- Monitor 0: 2560×1440 at (3440, 0)
- Monitor 1: 3440×1440 at (0, 0)
- Source 2026-10-19.jpg: 2026-10-19.jpg 3840×2160 3.8 MB; src0-full.bmp 3840×2160 24.9 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-3440x1440.jpg 3440×1440 1.1 MB; src0-2560x1440.bmp 2560×1440 11.1 MB; src0-3440x1440.bmp 3440×1440 14.9 MB
- Source 2026-10-20.jpg: 2026-10-20.jpg 3840×2160 3.7 MB; src1-full.bmp 3840×2160 24.9 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-3440x1440.jpg 3440×1440 1.1 MB; src1-2560x1440.bmp 2560×1440 11.1 MB; src1-3440x1440.bmp 3440×1440 14.9 MB

## Medians per variant (ms)

| Variant | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap | Accent changed |
|---|---|---|---|---|---|---|---|---|
| full-jpg / per-monitor | 3.6 | 468 | 468 | 266 | – | 59 | 50 | 0/3 |
| full-jpg / spi | 1755 | 104 | 109 | 125 | – | 56 | 50 | 0/3 |

## All trials (ms)

| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | full-jpg / per-monitor | 0 | CoCreateInstance 0.9<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.9<br>Release 0.3 | 3.8 | 452 | 1030 | 356 | 266 | – | 2549 | 60 | 50 |
| 2 | full-jpg / per-monitor | 1 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>Release 0.2 | 3.3 | 468 | 468 | 247 | 234 | – | 2001 | 58 | 50 |
| 3 | full-jpg / spi | 1 | Registry WallpaperStyle 0.2<br>SystemParametersInfo 1755 | 1755 | 104 | 104 | 247 | 156 | – | 1755 | 56 | 50 |
| 4 | full-jpg / per-monitor | 2 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.3<br>GetMonitorDevicePathAt(1) 0.2<br>SetWallpaper(monitor 1) 0.8<br>Release 0.2 | 3.7 | 453 | 453 | 247 | 266 | – | 1958 | 59 | 55 |
| 5 | full-jpg / spi | 2 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 1809 | 1810 | 77 | 639 | 677 | 109 | – | 2160 | 57 | 51 |
| 6 | full-jpg / per-monitor | 3 | CoCreateInstance 0.8<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.2<br>SetWallpaper(monitor 1) 0.9<br>Release 0.2 | 3.6 | 496 | 496 | 355 | 297 | – | 2014 | 59 | 50 |
| 7 | full-jpg / spi | 3 | Registry WallpaperStyle 0.0<br>SystemParametersInfo 1612 | 1612 | 109 | 109 | 355 | 125 | – | 1614 | 56 | 50 |

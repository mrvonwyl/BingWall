# Wallpaper apply profile — 2026-10-24T21:25:16.059Z

- OS: Windows 11 Home (10.0.26200)
- Electron: 32.3.3
- Settle window: 1500 ms
- Environment "dynamic-lighting-off": AutoColorization=1, transparency=1, Dynamic Lighting=0 (uses accent: 1), running: SignalRgb.exe, lghub_agent.exe
- Monitor 0: 2560×1440 at (3440, 0)
- Monitor 1: 3440×1440 at (0, 0)
- Source 2026-10-19.jpg: 2026-10-19.jpg 3840×2160 3.8 MB; src0-full.bmp 3840×2160 24.9 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-3440x1440.jpg 3440×1440 1.1 MB; src0-2560x1440.bmp 2560×1440 11.1 MB; src0-3440x1440.bmp 3440×1440 14.9 MB
- Source 2026-10-20.jpg: 2026-10-20.jpg 3840×2160 3.7 MB; src1-full.bmp 3840×2160 24.9 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-3440x1440.jpg 3440×1440 1.1 MB; src1-2560x1440.bmp 2560×1440 11.1 MB; src1-3440x1440.bmp 3440×1440 14.9 MB

## Medians per variant (ms)

| Variant | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap | Accent changed |
|---|---|---|---|---|---|---|---|---|
| full-jpg / per-monitor | 3.8 | 2273 | 8406 | 3391 | – | 1080 | 65 | 3/3 |
| full-jpg / spi | 4188 | 1735 | 1735 | 2000 | – | 911 | 54 | 3/3 |

## All trials (ms)

| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | full-jpg / per-monitor | 0 | CoCreateInstance 1.1<br>SetPosition 0.4<br>GetMonitorDevicePathCount 0.2<br>GetMonitorDevicePathAt(0) 0.3<br>SetWallpaper(monitor 0) 1.6<br>GetMonitorDevicePathAt(1) 0.3<br>SetWallpaper(monitor 1) 1.1<br>Release 0.3 | 5.5 | 921 | 5713 | 469 | 2594 | – | 7231 | 699 | 51 |
| 2 | full-jpg / per-monitor | 1 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.2<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>Release 0.2 | 3.6 | 1111 | 9526 | 532 | 3328 | – | 11061 | 1067 | 67 |
| 3 | full-jpg / spi | 1 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 4188 | 4188 | 1735 | 1735 | 89 | 2000 | – | 4188 | 911 | 54 |
| 4 | full-jpg / per-monitor | 2 | CoCreateInstance 1.1<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.3<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 1.0<br>Release 0.2 | 4.2 | 2758 | 8406 | 233 | 3391 | – | 9911 | 1113 | 57 |
| 5 | full-jpg / spi | 2 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 5601 | 5601 | 2258 | 6959 | 227 | 2828 | – | 8480 | 1371 | 65 |
| 6 | full-jpg / per-monitor | 3 | CoCreateInstance 1.1<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>Release 0.2 | 3.8 | 2273 | 6790 | 221 | 3438 | – | 8324 | 1080 | 65 |
| 7 | full-jpg / spi | 3 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 2477 | 2477 | 728 | 728 | 112 | 969 | – | 2477 | 289 | 52 |

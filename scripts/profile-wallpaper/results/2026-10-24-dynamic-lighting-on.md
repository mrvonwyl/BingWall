# Wallpaper apply profile — 2026-10-24T21:23:35.000Z

- OS: Windows 11 Home (10.0.26200)
- Electron: 32.3.3
- Settle window: 1500 ms
- Environment "dynamic-lighting-on": AutoColorization=1, transparency=1, Dynamic Lighting=1 (uses accent: 1), running: SignalRgb.exe, lghub_agent.exe
- Monitor 0: 2560×1440 at (3440, 0)
- Monitor 1: 3440×1440 at (0, 0)
- Source 2026-10-19.jpg: 2026-10-19.jpg 3840×2160 3.8 MB; src0-full.bmp 3840×2160 24.9 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-3440x1440.jpg 3440×1440 1.1 MB; src0-2560x1440.bmp 2560×1440 11.1 MB; src0-3440x1440.bmp 3440×1440 14.9 MB
- Source 2026-10-20.jpg: 2026-10-20.jpg 3840×2160 3.7 MB; src1-full.bmp 3840×2160 24.9 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-3440x1440.jpg 3440×1440 1.1 MB; src1-2560x1440.bmp 2560×1440 11.1 MB; src1-3440x1440.bmp 3440×1440 14.9 MB

## Medians per variant (ms)

| Variant | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap | Accent changed |
|---|---|---|---|---|---|---|---|---|
| full-jpg / per-monitor | 4.0 | 2110 | 5962 | 1438 | – | 922 | 52 | 3/3 |
| full-jpg / spi | 4466 | 270 | 5171 | 2391 | – | 1132 | 55 | 3/3 |

## All trials (ms)

| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | full-jpg / per-monitor | 0 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.7<br>GetMonitorDevicePathAt(1) 0.3<br>SetWallpaper(monitor 1) 0.8<br>Release 0.2 | 4.3 | 1211 | 5877 | 226 | 2016 | – | 7382 | 691 | 52 |
| 2 | full-jpg / per-monitor | 1 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.6<br>GetMonitorDevicePathAt(1) 0.2<br>SetWallpaper(monitor 1) 1.4<br>Release 0.3 | 4.7 | 2110 | 6788 | 220 | 3031 | – | 8320 | 922 | 57 |
| 3 | full-jpg / spi | 1 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 4466 | 4466 | 270 | 270 | 51 | 2391 | – | 4466 | 1132 | 56 |
| 4 | full-jpg / per-monitor | 2 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>Release 0.1 | 3.4 | 2736 | 2736 | 89 | 1438 | – | 4267 | 1097 | 51 |
| 5 | full-jpg / spi | 2 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 7515 | 7515 | 432 | 5171 | 245 | 2859 | – | 7515 | 1140 | 55 |
| 6 | full-jpg / per-monitor | 3 | CoCreateInstance 1.3<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.3<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>Release 0.2 | 4.0 | 1167 | 5962 | 136 | 891 | – | 7474 | 631 | 52 |
| 7 | full-jpg / spi | 3 | Registry WallpaperStyle 0.1<br>SystemParametersInfo 2560 | 2560 | 140 | 6885 | 212 | 844 | – | 8403 | 279 | 54 |

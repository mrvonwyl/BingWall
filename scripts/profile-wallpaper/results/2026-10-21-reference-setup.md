# Wallpaper apply profile — 2026-10-21T20:54:55.835Z

- OS: Windows 11 Home (10.0.26200)
- Electron: 32.3.3
- Settle window: 1500 ms
- Monitor 0: 2560×1440 at (3440, 0)
- Monitor 1: 3440×1440 at (0, 0)
- Monitor 2: not attached (still gets a SetWallpaper call in per-monitor mode)
- Source 2026-10-19.jpg: 2026-10-19.jpg 3840×2160 3.8 MB; src0-full.bmp 3840×2160 24.9 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-3440x1440.jpg 3440×1440 1.1 MB; src0-2560x1440.jpg 2560×1440 0.8 MB; src0-2560x1440.bmp 2560×1440 11.1 MB; src0-3440x1440.bmp 3440×1440 14.9 MB; src0-2560x1440.bmp 2560×1440 11.1 MB
- Source 2026-10-20.jpg: 2026-10-20.jpg 3840×2160 3.7 MB; src1-full.bmp 3840×2160 24.9 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-3440x1440.jpg 3440×1440 1.1 MB; src1-2560x1440.jpg 2560×1440 0.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB; src1-3440x1440.bmp 3440×1440 14.9 MB; src1-2560x1440.bmp 2560×1440 11.1 MB

## Medians per variant (ms)

| Variant | CoCreateInstance | SetPosition | SetWallpaper total | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|
| full-jpg / per-monitor | 0.9 | 0.1 | 2.9 | 4.6 | 2143 | 6971 | 3516 | – | 1224 | 74 |
| full-jpg / all | 1.0 | 0.1 | 1.2 | 2.5 | 1969 | 6839 | 3531 | – | 872 | 71 |
| prescaled-jpg / per-monitor | 0.9 | 0.1 | 3.1 | 4.7 | 2126 | 6989 | 3656 | – | 1381 | 60 |
| full-bmp / per-monitor | 0.8 | 0.2 | 3.1 | 5.2 | 2100 | 6898 | 3203 | – | 1569 | 58 |
| full-bmp / all | 0.9 | 0.1 | 1.3 | 2.4 | 2099 | 6918 | 3375 | – | 1174 | 62 |
| prescaled-bmp / per-monitor | 0.9 | 0.2 | 2.8 | 4.5 | 2196 | 6902 | 3344 | – | 1203 | 64 |

## All trials (ms)

| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | full-jpg / per-monitor | 0 | CoCreateInstance 0.9<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.4<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.2 | 4.8 | 2399 | 8597 | 185 | 2328 | – | 10107 | 774 | 62 |
| 2 | full-jpg / per-monitor | 1 | CoCreateInstance 1.1<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.6 | 2171 | 6971 | 236 | 2422 | – | 8506 | 741 | 74 |
| 3 | full-jpg / all | 1 | CoCreateInstance 0.8<br>SetPosition 0.1<br>SetWallpaper(NULL) 1.1<br>Release 0.1 | 2.2 | 1307 | 6839 | 222 | 1047 | – | 8354 | 477 | 71 |
| 4 | prescaled-jpg / per-monitor | 1 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 1.0<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.7 | 2340 | 7137 | 225 | 3656 | – | 8641 | 1392 | 60 |
| 5 | full-bmp / per-monitor | 1 | CoCreateInstance 0.8<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.2<br>SetWallpaper(monitor 0) 1.7<br>GetMonitorDevicePathAt(1) 0.4<br>SetWallpaper(monitor 1) 0.9<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 5.3 | 2297 | 7091 | 221 | 3547 | – | 8603 | 1569 | 58 |
| 6 | full-bmp / all | 1 | CoCreateInstance 0.9<br>SetPosition 0.2<br>SetWallpaper(NULL) 1.3<br>Release 0.1 | 2.5 | 2134 | 6889 | 214 | 3641 | – | 8422 | 1326 | 52 |
| 7 | prescaled-bmp / per-monitor | 1 | CoCreateInstance 1.2<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.2<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.7 | 2064 | 6752 | 211 | 2859 | – | 8263 | 1010 | 66 |
| 8 | full-jpg / per-monitor | 2 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.2<br>SetWallpaper(monitor 2) 0.8<br>Release 0.3 | 4.7 | 2143 | 6974 | 218 | 3516 | – | 8515 | 1264 | 75 |
| 9 | full-jpg / all | 2 | CoCreateInstance 1.0<br>SetPosition 0.1<br>SetWallpaper(NULL) 1.2<br>Release 0.1 | 2.5 | 1969 | 6676 | 246 | 3625 | – | 8202 | 1478 | 52 |
| 10 | prescaled-jpg / per-monitor | 2 | CoCreateInstance 0.8<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.9<br>Release 0.2 | 4.3 | 2126 | 6989 | 264 | 3891 | – | 8511 | 1226 | 58 |
| 11 | full-bmp / per-monitor | 2 | CoCreateInstance 0.8<br>SetPosition 0.3<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.2<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.4 | 2100 | 6898 | 225 | 3203 | – | 8434 | 1755 | 58 |
| 12 | full-bmp / all | 2 | CoCreateInstance 0.9<br>SetPosition 0.1<br>SetWallpaper(NULL) 1.2<br>Release 0.1 | 2.4 | 2050 | 6918 | 218 | 2984 | – | 8443 | 1118 | 62 |
| 13 | prescaled-bmp / per-monitor | 2 | CoCreateInstance 0.9<br>SetPosition 0.3<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.1<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.3 | 2196 | 6902 | 217 | 3734 | – | 8424 | 1346 | 64 |
| 14 | full-jpg / per-monitor | 3 | CoCreateInstance 0.8<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.3<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.9<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.1 | 4.5 | 2101 | 6882 | 218 | 3547 | – | 8404 | 1224 | 72 |
| 15 | full-jpg / all | 3 | CoCreateInstance 1.0<br>SetPosition 0.1<br>SetWallpaper(NULL) 1.4<br>Release 0.1 | 2.7 | 2112 | 7043 | 347 | 3531 | – | 8555 | 872 | 92 |
| 16 | prescaled-jpg / per-monitor | 3 | CoCreateInstance 0.9<br>SetPosition 0.1<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.3<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.9<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.9<br>Release 0.2 | 4.8 | 1941 | 6832 | 280 | 3000 | – | 8335 | 1381 | 65 |
| 17 | full-bmp / per-monitor | 3 | CoCreateInstance 1.4<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.1<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.9<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 1.0<br>Release 0.2 | 5.2 | 1940 | 6779 | 218 | 1750 | – | 8305 | 884 | 69 |
| 18 | full-bmp / all | 3 | CoCreateInstance 0.8<br>SetPosition 0.1<br>SetWallpaper(NULL) 1.3<br>Release 0.1 | 2.4 | 2099 | 6967 | 241 | 3375 | – | 8502 | 1174 | 84 |
| 19 | prescaled-bmp / per-monitor | 3 | CoCreateInstance 0.9<br>SetPosition 0.2<br>GetMonitorDevicePathCount 0.2<br>GetMonitorDevicePathAt(0) 0.1<br>SetWallpaper(monitor 0) 1.2<br>GetMonitorDevicePathAt(1) 0.1<br>SetWallpaper(monitor 1) 0.8<br>GetMonitorDevicePathAt(2) 0.1<br>SetWallpaper(monitor 2) 0.8<br>Release 0.2 | 4.5 | 2255 | 7040 | 219 | 3344 | – | 8561 | 1203 | 60 |

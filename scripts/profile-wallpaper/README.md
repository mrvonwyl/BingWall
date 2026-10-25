# Wallpaper apply profiler

Measures where the time goes when BingWall applies a wallpaper through
`IDesktopWallpaper`, and whether the apply freezes the shell. Built for the
"Profile where the 2–5 s wallpaper apply time goes" wayfinder task; later work on
the applier can rerun it and compare against the recorded baseline.

```powershell
npm run build:profile                           # compile to dist-profile/ only
npm run profile:wallpaper:run                   # run the last build without recompiling
npm run profile:wallpaper                       # build, then run: 3 rounds, two newest JPGs from ~/Pictures/BingWallpapers
npm run profile:wallpaper -- --rounds 5 --sources C:\a.jpg,C:\b.jpg --settle 1500 --out C:\somewhere
npm run profile:wallpaper -- --variants full-jpg/per-monitor,full-jpg/spi --label autocolorization-off
```

`--variants` picks a subset by name (spaces removed). `--label` names the machine
state in the report. The report also records `AutoColorization`, transparency,
Dynamic Lighting and any known RGB or wallpaper tools that are running.

It changes the real wallpaper many times and puts the original back at the end.
Before running, quit BingWall (it would apply wallpapers too) and leave most of
the desktop visible: minimise everything except the terminal.
Results go to `%TEMP%\bingwall-profile\profile-<timestamp>.{json,md}`.

## Method

The harness runs as an Electron main process, the same thread type that runs
`main/nativeWallpaper.ts` in the app until #45 moved applies into a utility process, and makes the same COM calls in the same order.

- **Per-stage timings.** Each COM call (`CoCreateInstance`, `SetPosition`,
  `GetMonitorDevicePathCount`/`At`, each `SetWallpaper`, `Release`) is timed on its
  own with `process.hrtime`.
- **Main-thread block.** Wall time from the start of the apply until it returns.
  Every call is synchronous, so this is exactly how long the Electron main thread
  (IPC, tray, window events) is frozen.
- **Visible change.** A worker thread `StretchBlt`s the whole composited desktop
  into a 96×24 grid, about every 25 ms. A screen read waits on the compositor, so it
  takes one read per sample. Before each apply it samples for 600 ms and drops cells
  that change on their own (terminal, clock). After that:
  - *first visible change* is the first sample where at least 2% of cells differ
    from that baseline;
  - *settled* is the last sample where at least 2% differ from the sample before it,
    with no such change for `--settle` ms afterwards.

  Both are measured from the start of the apply.
- **Shell responsiveness.** A second worker round-trips `WM_NULL` to Explorer's
  `Progman` window every 10 ms and records the worst latency during each trial. A long
  round-trip means Explorer's desktop thread is hung, which shows up as a
  system-wide freeze. A long *worst screen-read gap* in the watcher means DWM
  composition itself stalled.
- **CPU.** `GetProcessTimes` (kernel + user) for every `explorer.exe` and `dwm.exe`,
  from when the trial is armed until the desktop has settled. `dwm.exe` can only be
  read from an elevated shell; otherwise it shows as `–`.

### Variants

Each round runs every variant once, interleaved, and alternates between two source
images so every apply visibly changes the desktop:

| Variant | Input | Calls |
|---|---|---|
| `full-jpg / per-monitor` | Bing UHD JPG as downloaded (today's behaviour) | one `SetWallpaper(monitorId, …)` per monitor path |
| `full-jpg / all` | same | a single `SetWallpaper(NULL, …)` |
| `prescaled-jpg / per-monitor` | JPG cover-scaled and centre-cropped to each monitor's resolution (q90) | one per monitor, each with its own image |
| `full-bmp / per-monitor` | uncompressed 24-bit BMP at source resolution | one per monitor |
| `full-bmp / all` | same | single `NULL` call |
| `prescaled-bmp / per-monitor` | 24-bit BMP at each monitor's resolution | one per monitor |
| `full-jpg / spi` | Bing JPG | `WallpaperStyle`/`TileWallpaper` in the registry, then `SystemParametersInfoW(SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE \| SPIF_SENDCHANGE)` |
| `full-jpg / active-desktop` | Bing JPG | `IActiveDesktop` `SetWallpaper` + `SetWallpaperOptions(CROPTOFIT)` + `ApplyChanges(ALL \| FORCE \| BUFFERED_REFRESH)` |

Each trial also records whether the accent colour (`Explorer\Accent\AccentColorMenu`)
changed. A trial whose apply call throws is kept, with the error and the stages that
finished before it.

`GetMonitorDevicePathCount` also counts monitors Windows remembers but that aren't
attached. Per-monitor mode still calls `SetWallpaper` for them, as the app does.
For the prescaled variants, a detached monitor gets the first attached monitor's image.

## Baseline (2026-10-21, reference setup)

Full report: [results/2026-10-21-reference-setup.md](results/2026-10-21-reference-setup.md).
The setup was 3440×1440 + 2560×1440 plus one remembered-but-detached monitor path,
Windows 11 Home 10.0.26200 and Electron 32.3.3. The run was a warm-up plus 3 rounds,
with a non-elevated shell, so there is no DWM CPU.

Medians in ms, over 3 trials per variant:

| Variant | COM calls total (main-thread block) | First visible change | Settled | Explorer CPU | Worst Explorer hang |
|---|---|---|---|---|---|
| full-jpg / per-monitor (today) | 4.6 | 2143 | 6971 | 3516 | 1224 |
| full-jpg / all | 2.5 | 1969 | 6839 | 3531 | 872 |
| prescaled-jpg / per-monitor | 4.7 | 2126 | 6989 | 3656 | 1381 |
| full-bmp / per-monitor | 5.2 | 2100 | 6898 | 3203 | 1569 |
| full-bmp / all | 2.4 | 2099 | 6918 | 3375 | 1174 |
| prescaled-bmp / per-monitor | 4.5 | 2196 | 6902 | 3344 | 1203 |

- **The COM calls cost almost nothing.** `CoCreateInstance` takes ~0.9 ms, even
  on the first (cold) apply. Each `SetWallpaper` takes ~1 ms. The Electron main
  thread is blocked for under 6 ms in total. `SetWallpaper` only hands the request to
  Explorer and returns.
- **The time is spent inside Explorer after the call returns.** About 2.0–2.2 s pass
  before any pixel changes. Then a crossfade runs for about 4.8 s, during which
  cells change on every ~30 ms sample, until the desktop is final at about 6.9 s.
- **Input format and call shape make no difference.** Full-size JPG, a JPG
  pre-scaled to monitor resolution and an uncompressed BMP (25 MB) all land within
  noise of each other. So does one `SetWallpaper(NULL)` against one call per
  monitor. Decoding and scaling the image are not the bottleneck.
- **The freeze is Explorer, not DWM and not BingWall.** Explorer uses about 3.2–3.7 s
  of CPU per apply, and its desktop window thread stops answering for 0.9–1.6 s at a
  time. Screen reads through the compositor never stall for more than ~90 ms, against
  ~30 ms normally, so DWM keeps composing throughout.
- **Caveats.** Only about 220 of the 2304 grid cells showed the change, because most
  of the desktop was covered by windows. DWM CPU wasn't captured; that needs an
  elevated shell. The Explorer hang was measured on `Progman`'s thread only.

## APIs and machine state (2026-10-21)

Reports: [default](results/2026-10-21-apis-default.md),
[AutoColorization off](results/2026-10-21-apis-autocolorization-off.md) and
[SignalRGB closed](results/2026-10-21-apis-signalrgb-closed.md). Each is 3 rounds of
the three APIs with a full-size JPG. Medians in ms:

| API | Machine state | Main-thread block | First visible change | Explorer CPU | Worst Explorer hang | Accent changed |
|---|---|---|---|---|---|---|
| IDesktopWallpaper per monitor (today) | default | 4.2 | 1574 | 1594 | 675 | 3/3 |
| SystemParametersInfo | default | 1343 | 435 | 594 | 296 | 3/3 |
| IActiveDesktop | default | 4955 | 2014 | 2953 | 1367 | 3/3 |
| IDesktopWallpaper per monitor | **AutoColorization off** | 4.4 | **465** | 234 | 64 | 0/3 |
| SystemParametersInfo | **AutoColorization off** | 997 | **99** | 109 | 49 | 0/3 |
| IActiveDesktop | **AutoColorization off** | 973 | **108** | 141 | 49 | 0/3 |
| IDesktopWallpaper per monitor | SignalRGB closed | 4.3 | 1527 | 1000 | 980 | 3/3 |
| SystemParametersInfo | SignalRGB closed | 3554 | 1428 | 1797 | 767 | 3/3 |
| IActiveDesktop | SignalRGB closed | 4376 | 1765 | 2719 | 1037 | 3/3 |

- **Most of the slowness and the freeze come from the accent colour, not the wallpaper.**
  With "pick an accent colour from my background" on (`AutoColorization = 1`), every
  wallpaper change makes Explorer derive and broadcast a new accent colour. Turning it
  off cuts Explorer CPU by roughly 7–25× and stops the Explorer hangs. The desktop also
  changes in about 100 ms with SPI or IActiveDesktop, and about 465 ms with
  IDesktopWallpaper.
- **The ~4.8 s "crossfade" in the first baseline is probably the accent change too.**
  The watched area includes the taskbar and the accent-coloured window borders.
- **Closing SignalRGB doesn't help.** Its service and Dynamic Lighting kept running;
  Dynamic Lighting follows the accent colour here, but it wasn't isolated.
- **SystemParametersInfo is the fastest path, but it blocks the calling thread.**
  `SPIF_SENDCHANGE` broadcasts `WM_SETTINGCHANGE` and waits for every top-level window:
  ~1 s even with no accent change, up to ~5 s with one. It must not run on the Electron
  main thread.
- **IActiveDesktop is fast, but `ApplyChanges` returns `ERROR_TIMEOUT`.** It applies
  anyway, but it also blocks for about 1–5 s.
- **IDesktopWallpaper returns immediately.** Without the accent change it reaches the
  screen in about 465 ms, about 4× slower than SPI.
- **The official Bing Wallpaper app (1.1.459, .NET 9 + WinUI) doesn't rely on
  IDesktopWallpaper alone.** Its `BingWallpaper.dll` references `SystemParametersInfoW`
  with `SPIF_UPDATEINIFILE | SPIF_SENDCHANGE`, `SetWallpaperAndStyleInRegistry`, the
  undocumented `IVirtualDesktopManagerInternal::UpdateWallpaperPathForAllDesktops` (via
  the `CLSID_ImmersiveShell` service provider), and `MonitorTranscodedFileChange`.
  That's from strings only; which path it takes at runtime wasn't traced.

### Calling SystemParametersInfo from BingWall

- **koffi can call it.** The `spi` variant above goes through koffi (`legacyWallpaper.ts`).
  The 1–5 s block is the call itself waiting on the `WM_SETTINGCHANGE` broadcast, not
  koffi overhead.
- **Keep it off the Electron main thread.** Use koffi's `fn.async(...args, callback)`,
  which runs the call on a libuv thread-pool thread, or a `worker_thread`.
- **The calling thread is still busy for the whole broadcast.** Rapid "latest wins"
  applies have to be coalesced around that, not issued concurrently.
- **`SPIF_SENDCHANGE` causes the wait, but it's also what tells other apps the wallpaper
  changed.** Dropping it trades the block for apps that don't hear about the change.
- **Not measured yet:** the async form. Expect a main-thread block of about 0 ms and an
  unchanged ~100 ms to the screen.

## Dynamic Lighting (2026-10-24)

Reports: [Dynamic Lighting on](results/2026-10-24-dynamic-lighting-on.md),
[Dynamic Lighting off](results/2026-10-24-dynamic-lighting-off.md) and
[manual accent, Dynamic Lighting off](results/2026-10-24-manual-accent.md). The first two
had AutoColorization on and Dynamic Lighting following the accent colour. Only the
Settings toggle "Use Dynamic Lighting on my devices" changed between them. The third
run switched the accent colour to manual (`AutoColorization = 0`) as a same-session
control. All three had SignalRGB and Logitech G HUB running and the official Bing
Wallpaper app closed. Each is 3 rounds with a full-size JPG. Medians in ms:

| API | Accent | Dynamic Lighting | Main-thread block | First visible change | Settled | Explorer CPU | Worst Explorer hang | Accent changed |
|---|---|---|---|---|---|---|---|---|
| IDesktopWallpaper per monitor | automatic | on | 4.0 | 2110 | 5962 | 1438 | 922 | 3/3 |
| IDesktopWallpaper per monitor | automatic | **off** | 3.8 | 2273 | 8406 | 3391 | 1080 | 3/3 |
| IDesktopWallpaper per monitor | **manual** | off | 3.6 | **468** | **468** | 266 | **59** | 0/3 |
| SystemParametersInfo | automatic | on | 4466 | 270 | 5171 | 2391 | 1132 | 3/3 |
| SystemParametersInfo | automatic | **off** | 4188 | 1735 | 1735 | 2000 | 911 | 3/3 |
| SystemParametersInfo | **manual** | off | 1755 | **104** | **109** | 125 | **56** | 0/3 |

- **Dynamic Lighting adds nothing measurable.** With it off, Explorer still hangs for
  0.9–1.1 s per apply, the SPI call still blocks for 2.5–5.6 s, and Explorer CPU is no
  lower. The accent-colour cost is Explorer's own work, not the lighting devices following it.
- **The runs are noisy.** Three trials per cell, with first-visible-change spreads of
  140–2258 ms for SPI. The off run being slower in places is noise, not an effect.
- **A manual accent colour removes the cost, and the 2026-10-21 result reproduces.**
  SPI reaches the screen in ~100 ms and IDesktopWallpaper in ~470 ms, both settled with
  no trailing fade. Explorer hangs for ~55 ms at most and the spread across trials is tight.
  The SPI call still blocks its thread for ~1.6–1.8 s on the `WM_SETTINGCHANGE` broadcast.

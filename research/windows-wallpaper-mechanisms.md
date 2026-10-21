# Which Windows mechanism applies a wallpaper fastest?

Research for issue #24, part of map #29 ("instant, non-blocking wallpaper apply").
Written 2026-10-21. No production code; this informs #27 (applier architecture).

Labels used below:

- **[Sourced]**: stated by a cited source.
- **[Observed]**: read off the reference machine (Windows 11, 3440x1440 + 2560x1440) with PowerShell, after a normal BingWall apply.
- **[Inference]**: my reasoning, not confirmed by a source. Needs measuring before anyone depends on it.

## TL;DR

1. **The current code does more work than it needs to.** It loops over every monitor that `GetMonitorDevicePathCount` returns, and that count includes displays that are registered but not connected. On the reference machine the registry shows **3 transcoded images for 2 physical monitors**, plus a fourth "TranscodedWallpaper" write one second later. Each one is a full decode and re-encode of the 3840x2160 JPG inside Explorer. [Observed]
2. **None of the sources give latency numbers** for any wallpaper mechanism. All the timings below are inferences or targets to measure (#23 / #27).
3. **Ranked recommendation:**
   1. Take the call off the Electron main thread. Use a dedicated worker thread or a helper process with its own COM apartment, keep one `IDesktopWallpaper` object alive for reuse, and coalesce requests so the latest one wins.
   2. Call **`SetWallpaper(NULL, path)` once** instead of once per monitor. If per-monitor calls are ever needed, skip monitors where `GetMonitorRECT` returns `S_FALSE`.
   3. Call `SetPosition(DWPOS_FILL)` only when `GetPosition` shows the position differs.
   4. Benchmark the source format and size (UHD JPG, a JPG pre-scaled to the largest monitor, BMP) against the transcode cost.
   5. Keep `SystemParametersInfo(SPI_SETDESKWALLPAPER)` only as a fallback, and **never call it with `SPIF_SENDCHANGE` on a UI thread**.
4. **Fade animation:** no documented API turns off the shell's wallpaper transition. Treat it as a fixed cost to measure and budget inside the 300 ms target.

## 1. IDesktopWallpaper

### What it is and where it runs

- `IDesktopWallpaper::SetWallpaper(monitorID, wallpaper)`: "Set this value to NULL to set the wallpaper image on all monitors." Requires Windows 8 or later. [Sourced: [MS Learn SetWallpaper](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-setwallpaper)]
- `GetMonitorRECT` returns `S_FALSE` when "the monitor specified by monitorID is not currently attached to the system." [Sourced: [MS Learn GetMonitorRECT](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-getmonitorrect)]
- `GetMonitorDevicePathCount` returns every display ever registered with Windows, not just the connected ones. Disconnected displays can be detected with `GetMonitorRECT` returning `S_FALSE`. [Sourced: [zenn.dev, satoshi_yoneda](https://zenn.dev/satoshi_yoneda/articles/python_wallpaper) (community, Japanese)]
- Raymond Chen's sample creates the object with `CoCreateInstance(CLSID_DesktopWallpaper, nullptr, CLSCTX_ALL, ...)`. The post does not discuss threading. [Sourced: [Old New Thing, 2014-06-02](https://devblogs.microsoft.com/oldnewthing/20140602-00/?p=833)]
- Registration on the reference machine: `CLSID\{C2CF3110-...}` has only an `AppId`. There is **no `InprocServer32` and no `LocalServer32`**. The AppID is named "Desktop Wallpaper Factory" with `RunAs = Interactive User`. [Observed]
  - [Inference] The class object is registered at runtime by an already-running process, almost certainly `explorer.exe`. So every `SetWallpaper` is a **synchronous cross-process COM call into Explorer**, and it most likely returns only after Explorer has done its transcode work. That would explain why each call costs hundreds of milliseconds to seconds, and why the process that also draws the taskbar and desktop gets busy.

### Per-monitor vs. NULL

- [Observed] After a BingWall apply on the reference machine, `HKCU\Control Panel\Desktop` contains:
  - `TranscodedImageCount = 3`
  - `TranscodedImageCache_000..002`, each pointing at the same source `...\BingWallpapers\2026-10-17.jpg` (header shows 3840x2160, 3,653,767 bytes), for three monitor paths:
    - `DISPLAY#DEL41D9#5&12251521&0&UID4353` (connected)
    - `DISPLAY#ACR054F#5&12251521&0&UID4355` (connected)
    - `DISPLAY#ACR054F#1&8713bca&0&UID0`: **a stale registration of the same Acer panel**. WMI lists only 2 active monitors.
  - `%APPDATA%\Microsoft\Windows\Themes\Transcoded_000/001/002`, each 2,146,227 bytes, all written in the same second. `TranscodedWallpaper` (467 KB) was written one second later, and `TranscodedWallpaperCache\TranscodedWallpaper_<hash>` (+`.meta`) is new in recent Windows 11 builds.
- [Inference] The current loop makes Explorer transcode **once per registered monitor (3x here)**, plus an extra composite or legacy image. `SetWallpaper(NULL, path)` hands Explorer the whole job in one RPC. Explorer may still write per-monitor files internally, but it can share one decode, and the work does not grow with stale monitor entries. **This is the single cheapest change to measure first.**
- The scope says the same image goes on every monitor, so NULL fits the product.

### COM apartment, threading, object reuse

- Facts about COM in general [Sourced: [CoInitializeEx](https://learn.microsoft.com/en-us/windows/win32/api/combaseapi/nf-combaseapi-coinitializeex)]: a thread's apartment model is fixed once set. Re-initializing with a different model returns `RPC_E_CHANGED_MODE`.
- Current code [Observed in `main/nativeWallpaper.ts`]: it calls `CoInitializeEx(STA)` on the **Electron main thread**, and swallows `RPC_E_CHANGED_MODE`, so it may in fact be running in whatever apartment Chromium/Electron already set up. It also calls `CoCreateInstance(CLSCTX_LOCAL_SERVER)` on every apply, and the koffi calls are synchronous.
- [Inference] Consequences:
  - The JS event loop is blocked for the whole cross-process call, which is 2 to 5 s today. That is the "app freezes" half of the problem.
  - An outgoing call from an STA runs a COM modal loop that dispatches some window messages. That re-entrancy is dangerous inside Electron's main thread.
  - `CoCreateInstance` of an out-of-process server costs an RPC round-trip plus activation. That is probably milliseconds, not seconds, but it is cheap to avoid.
- Recommendation [Inference]:
  - Run the applier on a **dedicated thread initialized as MTA**, or in its own small helper process. In an MTA, out-of-process calls do not need a message pump.
  - Create the `IDesktopWallpaper` object **once** and reuse it.
  - When Explorer restarts, calls fail with `RPC_E_DISCONNECTED` / `RPC_S_SERVER_UNAVAILABLE` / `CO_E_OBJNOTCONNECTED`. On those errors, re-create the object and retry once.
  - Calls into Explorer are serialized anyway, so latest-wins coalescing belongs in front of the single applier thread, not in parallel calls.

## 2. SystemParametersInfo(SPI_SETDESKWALLPAPER)

- `fWinIni` flags [Sourced: [MS Learn SystemParametersInfoW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow)]:
  - `SPIF_UPDATEINIFILE` "Writes the new system-wide parameter setting to the user profile."
  - `SPIF_SENDCHANGE` / `SPIF_SENDWININICHANGE` (same value) "Broadcasts the WM_SETTINGCHANGE message after updating the user profile."
  - `0` means neither.
  - For this action the function "returns TRUE unless there is an error (like when the specified file doesn't exist)".
- The broadcast goes to **all top-level windows**. Applications broadcasting it themselves should use `SendMessageTimeout(HWND_BROADCAST, ...)`. [Sourced: [MS Learn WM_SETTINGCHANGE](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-settingchange)]
- **The hang:** with `SPIF_SENDCHANGE`, if any top-level window is unresponsive, "this broadcast will hang until that unresponsive window finally resumes responding to messages or is killed." Chen's suggested fixes:
  - call it on a background thread;
  - or omit the flag and broadcast yourself with a timeout;
  - or both;
  - or, "perhaps the best technique", `SendNotifyMessage`, which does not wait.

  [Sourced: [Old New Thing, 2005-03-10](https://devblogs.microsoft.com/oldnewthing/20050310-00/?p=36233)]
- Even without a hung window, a broadcast sends a synchronous message to every top-level window on the desktop. Every app re-reads its settings, and Chromium and Electron windows re-query system metrics. [Inference] That is pure overhead for a wallpaper change and a plausible contributor to "the whole PC hitches."
- SPI has no per-monitor or position parameter. The fit mode comes from the `WallpaperStyle` / `TileWallpaper` values under `HKCU\Control Panel\Desktop`, written before the call. [Sourced, community: Qt / CodeProject threads in search results; matches the observed `WallpaperStyle = 10` (Fill)]
- A Microsoft engineer reproduced `SPI_SETDESKWALLPAPER` "not always working" on Windows 11 22H2. [Sourced: [MS Q&A 1857247](https://learn.microsoft.com/en-au/answers/questions/1857247/systemparametersinfoa-spi-setdeskwallpaper-does-no)]
- [Inference] Since Windows 8, SPI ends up in the same Explorer transcode path; the registry `Wallpaper` value points at `TranscodedWallpaper` [Observed]. So SPI is unlikely to be meaningfully faster than `SetWallpaper(NULL)`, and it adds the broadcast risk. It is a fallback, not the primary path. If it is used:
  - call it **off the UI thread**;
  - use `fWinIni = SPIF_UPDATEINIFILE` only;
  - if anything still needs to be told, follow it with `SendNotifyMessage(HWND_BROADCAST, WM_SETTINGCHANGE, SPI_SETDESKWALLPAPER, ...)`.

  Whether Explorer repaints without the broadcast must be verified.

## 3. Explorer transcoding (TranscodedWallpaper)

- Setting a JPEG makes Windows store a re-encoded copy as `TranscodedWallpaper` in `%AppData%\Microsoft\Windows\Themes`, at **85 % quality** by default. PNG is not re-compressed. `HKCU\Control Panel\Desktop\JPEGImportQuality` (DWORD, up to 100) changes the quality and takes effect after Explorer restarts and the wallpaper is set again. [Sourced, secondary only: [winaero](https://winaero.com/how-to-disable-wallpaper-jpeg-quality-reduction-in-windows-10), [Windows Central](https://windowscentral.com/how-disable-image-compression-desktop-wallpapers-windows-10), [ElevenForum](https://elevenforum.com/t/disable-desktop-wallpaper-jpeg-quality-reduction-in-windows-11.10782/). No Microsoft doc found.]
- [Observed] The 3.65 MB UHD source became 2.15 MB per-monitor files, which is consistent with a full-resolution JPEG re-encode at reduced quality. `JPEGImportQuality` is unset on this machine.
- [Inference] The cost per transcode is a JPEG decode of 8.3 MP, a possible colour/scale pass, a JPEG encode, and a file write. That costs tens to low hundreds of ms of CPU each, and multiplied by 3 or 4 it gets close to the observed seconds. Levers:
  - **Number of transcodes:** the NULL monitor id, and ignoring stale monitors. Probably the biggest win.
  - **Source pixel count:** with one image for all monitors, the largest useful size for Fill on 3440x1440 is about 3440x1935 for a 16:9 source. A UHD source is only 1.25x that, so pre-scaling saves little.
  - **Source format:** a BMP or PNG source skips the JPEG decode cost or the quality loss, but means bigger files or a slower PNG decode. This is a benchmark question, not something to decide on paper.
  - **`JPEGImportQuality`:** a global user setting. BingWall should **not** change it silently. It affects quality more than speed, and a higher value means a bigger encode.
- Explorer keeps a hash-keyed `TranscodedWallpaperCache` on recent Windows 11 [Observed]. [Inference] Re-applying a recent image (sliding back through history) may hit that cache and be faster. Measure it.

## 4. The fade animation

- No Microsoft documentation or API found that controls or disables the desktop wallpaper transition. `IDesktopWallpaper` has no flag for it. The slideshow cross-fade is a known built-in effect, and third-party tools say there is no API for it. Wallpaper Engine ships its own "kill Windows wallpaper fade" option, which implies it can only be suppressed by hacks. [Sourced, community only: Steam / Wallpaper Engine discussions in search results]
- [Inference] The fade is drawn by Explorer/DWM after the transcode, so the "desktop visibly changes" clock starts *during* the fade, which helps the 300 ms target. Whether the system-wide "Show animations in Windows" (`SPI_SETCLIENTAREAANIMATION`) setting removes the fade is unverified. BingWall must not toggle a global accessibility setting anyway.
- Conclusion: treat the fade as an uncontrollable constant. Measure the time to the first visible pixel change, not the time until the fade ends.

## 5. Known causes of shell or desktop stalls

| Cause | Status | Mitigation |
|---|---|---|
| Synchronous native call on the Electron main thread | Observed in code | Worker thread or helper process |
| One transcode per *registered* monitor (stale entries included) | Observed (3 for 2) | `SetWallpaper(NULL, ...)`; skip `S_FALSE` monitors |
| `SPIF_SENDCHANGE` broadcast blocking on hung windows | Sourced (Chen) | No broadcast, or `SendNotifyMessage`, off the UI thread |
| Explorer busy transcoding → taskbar/desktop unresponsive (same process) | Inference | Fewer transcodes, cheaper source |
| Redundant `SetPosition` on every apply (possible extra re-render) | Inference | Only call it when `GetPosition` differs |
| Third-party wallpaper apps fighting over the desktop. Microsoft Bing Wallpaper is installed on the reference machine (its `CurrentWallpaperPath` is in the registry), though it was not running at the time of checking | Sourced (24H2 compatibility hold for wallpaper apps, [The Register](https://www.theregister.com/2025/04/14/windows_11_24h2_hold/)); Observed | Detect and warn; out of scope to fix |
| Disk I/O for 3 to 4 x 2 MB writes plus cache | Inference (small on NVMe) | Fewer transcodes |

## 6. Ranked recommendation

Expected latencies are **inferences** because no source publishes numbers. #23 / #27 must replace them with measurements.

1. **Off the main thread, persistent COM object, latest-wins queue.** Removes the app freeze entirely. Wall-clock apply time is unchanged, but it no longer blocks anything in BingWall.
2. **`SetWallpaper(NULL, path)` once.** Expected roughly 1/3 to 1/4 of today's Explorer work on the reference machine, from 3 or 4 transcodes down to probably 1 or 2.
3. **Skip `SetPosition` when it is already Fill.** Saves one possible extra re-render.
4. **Benchmark the source variants** (UHD JPG, JPG pre-scaled to about 3440x1935, BMP) with the NULL call. Pick one only if the gain is significant. Prerendering stays a user toggle per #29.
5. **SPI fallback** (only if IDesktopWallpaper is unavailable): run it on a worker, use `SPIF_UPDATEINIFILE`, then `SendNotifyMessage`. Never use `SPIF_SENDCHANGE` synchronously.
6. **Do not** change `JPEGImportQuality` or the animation settings, and do not try to kill the fade.

Whether the 300 ms target is reachable at all depends on Explorer's transcode cost for one UHD image. That is the key number for #23 to measure. Instrument these points:

- `SetWallpaper(NULL)` return time;
- `Transcoded_*` file mtimes;
- the first visible change, via screen capture or polling a desktop pixel with DWM.

## Sources

- MS Learn: [IDesktopWallpaper::SetWallpaper](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-setwallpaper), [GetMonitorRECT](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-getmonitorrect), [SystemParametersInfoW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow), [WM_SETTINGCHANGE](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-settingchange), [CoInitializeEx](https://learn.microsoft.com/en-us/windows/win32/api/combaseapi/nf-combaseapi-coinitializeex)
- Raymond Chen: [Why does SystemParametersInfo hang when I pass the SPIF_SENDCHANGE flag?](https://devblogs.microsoft.com/oldnewthing/20050310-00/?p=36233), [Obtaining information about the user's wallpaper on multiple monitors](https://devblogs.microsoft.com/oldnewthing/20140602-00/?p=833)
- Microsoft Q&A: [SPI_SETDESKWALLPAPER does not always work](https://learn.microsoft.com/en-au/answers/questions/1857247/systemparametersinfoa-spi-setdeskwallpaper-does-no)
- Community: [zenn.dev, IDesktopWallpaper and disconnected monitors](https://zenn.dev/satoshi_yoneda/articles/python_wallpaper), [winaero JPEGImportQuality](https://winaero.com/how-to-disable-wallpaper-jpeg-quality-reduction-in-windows-10), [Windows Central](https://windowscentral.com/how-disable-image-compression-desktop-wallpapers-windows-10), [ElevenForum](https://elevenforum.com/t/disable-desktop-wallpaper-jpeg-quality-reduction-in-windows-11.10782/), [The Register, 24H2 wallpaper-app hold](https://www.theregister.com/2025/04/14/windows_11_24h2_hold/)

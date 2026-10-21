# Cross-platform wallpaper APIs and the applier interface

Research for issue #25 (child of map #29, "instant, non-blocking wallpaper apply").
Date: 2026-10-21. No production code here.

**Question.** How do macOS and the main Linux desktops set a wallpaper programmatically (per monitor where possible, with latency, permissions and sandboxing)? What must a cross-platform applier interface look like so that a Windows-first native applier leaves room for the other platforms?

Each section separates **Sourced** facts (with a link or the file that was read) from **Inference** (my reasoning, not verified on a machine). None of the latency numbers below were measured. No macOS or Linux machine was available.

---

## TL;DR

- **macOS:** `NSWorkspace.setDesktopImageURL(_:for:options:)` takes one call per `NSScreen` and **must run on the main thread**. Fill is set through the options. Known catch: it only changes the **active Space** on each screen, and it can switch off "Show on all Spaces". It needs no special entitlement. The process must be a proper AppKit client (a small Swift/ObjC helper, or Rust via `objc2`).
- **Linux has no single API.** The backend depends on the desktop:
  - **GNOME / Unity / Pantheon / Budgie:** set the gsettings keys `org.gnome.desktop.background picture-uri` **and** `picture-uri-dark` (GNOME 42+), plus `picture-options='zoom'`. These are global, not per monitor.
  - **KDE Plasma:** D-Bus `org.kde.PlasmaShell.setWallpaper(plugin, params, screen)` (per screen), or `evaluateScript`, or `plasma-apply-wallpaperimage`.
  - **XFCE:** `xfconf-query` per monitor/workspace property.
  - **Cinnamon / MATE / Deepin:** gsettings/dconf keys under their own schemas.
  - **wlroots (Sway, Hyprland, river):** there is **no persistent "OS wallpaper"**. A client process such as swaybg, hyprpaper or awww/swww has to keep drawing it.
  - **Bare X11 WMs:** `feh --bg-fill` or `xwallpaper`. This is not persistent unless the user's startup runs it again.
- **The `org.freedesktop.portal.Wallpaper` portal is implemented by xdg-desktop-portal-gnome and -kde only, not by wlr, hyprland or cosmic.** It is the cleanest route on GNOME/KDE (and the only one inside Flatpak), but it may show a confirmation dialog.
- **Existing libraries.**
  - Rust `wallpaper`: last release 3.2.0 in 2021, last commit 2022, Unlicense.
  - Go `reujab/wallpaper`: last commit 2021, Unlicense.
  - Rust `more-wallpapers`: 0.4.0 from 2024, MIT/Apache-2.0, very small user base.

  All of them are low maintenance. On Windows they all use **`SystemParametersInfoW(SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE|SPIF_SENDCHANGE)`**: synchronous, not per monitor, and the style goes into a registry value that is applied by **setting the wallpaper a second time**. On Linux they shell out to CLIs. None of them is worth depending on. They are useful as a reference table of keys and commands.
- **Interface shape.** Have one call, `apply(imagePath, Fill, allMonitors)`, that returns a structured result. Have a `capabilities()` probe (perMonitor, coversAllSpaces/workspaces, persistsWithoutApp, needsMainThread, darkVariant, mayPrompt). Use typed errors. Require a **fresh, unique, absolute file path per image**, because several desktops ignore a re-set of the same path. The host should stay platform-agnostic. Each OS backend can be a different binary or language if needed.

---

## 1. macOS

### Sourced

- **API.** `NSWorkspace.setDesktopImageURL(_ url: URL, for screen: NSScreen, options: [NSWorkspace.DesktopImageOptionKey: Any]) throws` (ObjC `setDesktopImageURL:forScreen:options:error:`). Apple's docs say:
  - The URL must be a file URL.
  - The options control how the image is scaled.
  - **"You must call this method from your app's main thread."**
  - It throws on failure.

  Source: [Apple docs](https://developer.apple.com/documentation/appkit/nsworkspace/setdesktopimageurl(_:for:options:)). I read the DocC JSON behind that page.
- **Option keys.** The option keys are `NSWorkspace.DesktopImageOptionKey`: `.imageScaling` (an `NSImageScaling`), `.allowClipping` (Bool) and `.fillColor`. A third party reports that `fillColor` and the `desktopImageOptions` read-back stopped working on Monterey, Ventura and Sonoma.
- **Spaces.** sindresorhus/wallpaper says: *"On macOS, it sets the wallpaper on the active space. There is no way to set it on all spaces."* ([repo](https://github.com/sindresorhus/wallpaper)). An unanswered Apple Developer Forums report says each call turns off the user's "Show on all Spaces" setting, and that the options dictionary has no key for it ([thread 834630](https://developer.apple.com/forums/thread/834630)).
- **macOS 26 change.** sindresorhus/macos-wallpaper (MIT, Swift) says the old trick of writing `desktoppicture.db` "no longer works on macOS 26 and later". It now relies on an undocumented `NSWorkspace` placement option key. Its CLI supports `--screen all|main|<index>` and `--scale auto|fill|fit|stretch|center` (no tile) ([repo](https://github.com/sindresorhus/macos-wallpaper)).
- **AppleScript route.** The Rust `wallpaper` crate on macOS runs `osascript -e 'tell application "System Events" to tell every desktop to set picture to …'` and does not support scaling modes (`src/macos.rs`, read at master). This route triggers the macOS Automation (Apple Events) consent prompt for System Events.

### Inference

- **Fill** should be `imageScaling = .scaleProportionallyUpOrDown` with `allowClipping = true`. This is the standard mapping, but check it on hardware.
- **Permissions.** NSWorkspace needs no TCC permission and no entitlement, and it works from a sandboxed app (it takes a file URL the app can read). The AppleScript route needs Automation consent, so avoid it.
- **Same URL ignored.** As on Linux, re-setting the *same* URL after the file content changed is commonly reported to be ignored or cached. Use a unique filename per image.
- **Latency.** The call itself should be well under 100 ms. The Dock/WallpaperAgent process does the decode and transition asynchronously. Not measured.
- **Process model.** The backend has to be an AppKit process that calls on its main thread. A tiny Swift CLI or a Rust binary using `objc2-app-kit` works. A long-lived helper avoids paying process start-up on every apply. Calling from Electron's main process through koffi would put us back on the Electron main thread, which we are trying to leave.
- **Spaces gap.** No public API covers all Spaces. Accept "active Space on every screen" and expose it as a capability (`coversAllWorkspaces = false`).

## 2. Linux

The desktop is identified through `XDG_CURRENT_DESKTOP` (and `XDG_SESSION_TYPE` for Wayland vs X11). Every library surveyed dispatches on that.

### 2.1 GNOME (also Unity, Pantheon, Budgie, Ubuntu)

**Sourced**
- Set `org.gnome.desktop.background picture-uri` to `file:///…`, **and** set `picture-uri-dark` on GNOME 42+. Otherwise the dark style keeps showing the old image. The Rust `wallpaper` crate sets both and ignores a failure on the dark key for GNOME < 42 (`src/linux/gnome.rs`).
- **Scaling:** `picture-options`. `zoom` corresponds to Fill (the crate maps `Crop` to `zoom`).
- **Portal behaviour.** xdg-desktop-portal-gnome's Wallpaper portal (`src/wallpaper.c`, read at main):
  - It **copies the file** first.
  - Then it sets `picture-uri`, `picture-uri-dark` and `picture-options = ZOOM`.
  - Its `show-preview` option defaults to FALSE.

**Inference**
- **Global, not per monitor.** GNOME's background is one image applied to every monitor, which is exactly what BingWall needs.
- **Bindings.** Write through GIO/GSettings or dconf over D-Bus. Shelling out to `gsettings` costs a fork and exec, roughly 10–30 ms.
- **Cost and latency.** gnome-shell watches the key and reloads asynchronously, with a short crossfade. The write itself is about 1 ms. Visible change is probably 100–500 ms including the decode of a 3440×1440 JPEG. Not measured.
- **Unique path.** Re-setting the same URI does not trigger a reload, so the path must be unique per image.

### 2.2 KDE Plasma

**Sourced**
- **`plasma-apply-wallpaperimage [-f fill-mode] <file>`** (plasma-workspace) generates a Plasma script: `for desktops(): d.writeConfig('Image','file://…'); d.writeConfig('FillMode', n)`. It sends the script to `org.kde.PlasmaShell.evaluateScript`.
- The Rust `wallpaper` crate does the same through `qdbus org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript`. It uses `FillMode 2` (Qt `PreserveAspectCrop`, which is Fill).
- **xdg-desktop-portal-kde** (`src/wallpaper.cpp`, 2025) instead calls **`org.kde.PlasmaShell.setWallpaper("org.kde.image", {Image: url}, screenNumber)`** asynchronously, once per screen. Through `kscreenlockerrc` it also handles `set-on=lockscreen` and `set-on=both`.

**Inference**
- **Preferred route:** call `setWallpaper` directly (per screen, async, no script engine), and fall back to `evaluateScript`.
- `evaluateScript` has historically failed while the desktop "widgets are locked" (community-reported). Map that to a typed error.
- Same-path caching applies here too.
- **Latency.** The D-Bus call is about 1–5 ms, and Plasma's QML reload is asynchronous. Not measured.

### 2.3 XFCE

**Sourced**
- **Properties.** `xfconf-query -c xfce4-desktop`. One `…/last-image` property and one `…/image-style` property exist per monitor and workspace, e.g. `/backdrop/screen0/monitorDP-1/workspace0/last-image`.
- **Fill.** `image-style 5` is Zoomed (Fill).
- **How the crate does it.** The `wallpaper` crate lists the properties and sets each one (`src/linux/xfce.rs`).

**Inference**
- This gives natural per-monitor and per-workspace support. Set every matching property so that all workspaces are covered.

### 2.4 Cinnamon, MATE, Deepin, LXDE

**Sourced (from the `wallpaper` crate, `src/linux/mod.rs`)**
- **Cinnamon:** `/org/cinnamon/desktop/background/picture-uri`
- **MATE:** `/org/mate/desktop/background/picture-filename` (a plain path, not a URI)
- **Deepin:** `/com/deepin/wrap/gnome/desktop/background/picture-uri`
- **Options keys:** each schema has a `picture-options` key with GNOME-style values.
- **LXDE:** goes through pcmanfm.
- **more-wallpapers notes:** it reports Cinnamon wallpapers "reset to a provided default after restart" when set through its X11 path ([README](https://github.com/LuckyTurtleDev/more-wallpapers)).

### 2.5 wlroots compositors (Sway, Hyprland, river, Wayfire) and COSMIC

**Sourced**
- **No portal.** xdg-desktop-portal-wlr and -hyprland implement only Screenshot, ScreenCast and similar, with **no Wallpaper portal**. xdg-desktop-portal-cosmic has no Wallpaper portal either. I checked each backend's `.portal` file.
- **swaybg** (MIT, active, last push 2026-09) is a client that draws through `wlr-layer-shell`. Its modes include `-m fill`, and `-o <output>` selects an output.
- **The Rust `wallpaper` crate** simply `spawn`s `swaybg -i <path>` for any unknown desktop (`src/linux/mod.rs`). It falls back to `feh --bg-fill`.
- **Daemons with IPC:** hyprpaper (BSD-3, active) and swww (GPL-3, archived on GitHub 2025-10, continued elsewhere as "awww").

**Inference**
- **No persistent wallpaper.** Nothing persists unless a process stays alive. Persistence across login needs the user's compositor config (for example `output * bg … fill` in Sway).
- **Requirement conflict.** The requirement "real OS wallpaper that persists without the app" **cannot be met** here. The backend can only:
  - talk to a running daemon (hyprpaper or awww IPC), or
  - spawn a detached swaybg and kill the previous one.

  Report this as `persistsWithoutApp = false`.
- **COSMIC** has its own settings (cosmic-bg config). It needs a dedicated backend later.

### 2.6 Bare X11 window managers

**Sourced**
- `feh --bg-fill` and `xwallpaper` set the root window pixmap. more-wallpapers notes that on X11 "wallpapers reset after restart". feh writes a `~/.fehbg` script that the user must run at startup.

**Inference**
- Per monitor through XRandR. Not persistent. This is the lowest tier.

### 2.7 The XDG Wallpaper portal

**Sourced**
- `org.freedesktop.portal.Wallpaper` v1 offers `SetWallpaperURI` (non-`file:` URIs only) and `SetWallpaperFile(parent_window, fd, options)`. Options are `show-preview` (b) and `set-on` (`background` | `lockscreen` | `both`). It returns a Request handle ([spec](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Wallpaper.html)).
- **Backend support:** -gnome and -kde implement it. -gtk can be built with it. -wlr, -hyprland and -cosmic do not implement it.

**Inference**
- **Prompt.** The frontend applies a per-app permission (a first-time prompt is likely). That is an extra round trip, but it is async and well-defined.
- **When to use it.** Use it as the **first choice on GNOME/KDE when sandboxed (Flatpak/Snap)**. Use direct gsettings or PlasmaShell calls otherwise, because they are faster and never prompt.

## 3. Existing libraries

| Library | Lang / licence | State (from GitHub API and crates.io, 2026-10-21) | Windows implementation | Per monitor | Linux / macOS approach |
|---|---|---|---|---|---|
| [`wallpaper`](https://github.com/reujab/wallpaper.rs) | Rust, Unlicense | crates.io **3.2.0 from 2021-07**; last commit 2022-11; 120★, 15 open issues/PRs; not archived but dormant | `SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE\|SPIF_SENDCHANGE)`. `set_mode` writes `HKCU\Control Panel\Desktop\WallpaperStyle` (Crop maps to `"10"`, Fill) and then **calls set again** to apply | No (Win/mac/GNOME); XFCE sets all monitors | Shells out to `gsettings`, `dconf`, `qdbus`, `xfconf-query`, `osascript`, `swaybg`, `feh` |
| [`reujab/wallpaper`](https://github.com/reujab/wallpaper) (Go) | Go, Unlicense | Last commit 2021-06; 216★ | Same SPI call through `user32.NewProc`; **ignores the return value** (always nil error); same registry + double-set for mode | No | Same shell-out approach |
| [`more-wallpapers`](https://github.com/LuckyTurtleDev/more-wallpapers) | Rust, MIT OR Apache-2.0 | 0.4.0 from 2024-03; last commit 2024-03; 3★, about 130 recent downloads | Delegates to a fork of `wallpaper` (`fallback` feature), so the same SPI call | Windows/macOS/GNOME: no. X11, Cinnamon, KDE, Sway, XFCE: yes | Mixed; per-screen on KDE, Sway and XFCE |
| [`sindresorhus/wallpaper`](https://github.com/sindresorhus/wallpaper) (npm) + `macos-wallpaper` / `windows-wallpaper` binaries | JS + Swift/C++, MIT | Active (macOS binary updated for macOS 26); "Maintainer needed for the Linux part" | Ships a prebuilt `windows-wallpaper` exe (screen hard-coded to main) | macOS only (`screen: all\|main\|index`) | macOS: NSWorkspace through a Swift CLI |
| swaybg / hyprpaper / awww (swww) | C / C++ / Rust | swaybg and hyprpaper active; swww archived on GitHub | – | Yes (per output) | wlroots draw clients, not libraries |

**Inference about the Windows side of these libraries.**
- **Blocking.** `SPIF_SENDCHANGE` broadcasts `WM_SETTINGCHANGE` synchronously, so a hung top-level window can stall the call. That conflicts with the "never freeze" requirement unless the call runs off the UI thread.
- **No per-monitor control.** None of them use `IDesktopWallpaper`, so there is no per-monitor control and no `DWPOS_FILL` without a registry write.
- **Double apply.** Setting the mode means a second full apply.

**Verdict.** None of these libraries fits BingWall's Windows path. Treat them as a reference catalogue of Linux keys and commands for a later Linux backend, not as a dependency.

## 4. What the applier interface needs

Everything in this section is inference.

### Inputs

Keep the inputs minimal and stable:
- `imagePath`: an absolute path to a local file that **already exists**, with a **unique name per image**. The cache already names files by date and market. Unique names avoid the same-path caching on GNOME, KDE and macOS, and the GNOME portal copies the file anyway.
- `fit`: an enum, `Fill` only for now. Keep it an enum anyway, because every backend has a native equivalent:

  | Backend | Fill value |
  |---|---|
  | Windows | `DWPOS_FILL` |
  | macOS | proportional scaling + allowClipping |
  | GNOME | `zoom` |
  | KDE | `FillMode 2` |
  | XFCE | `5` |
  | swaybg | `fill` |
- `target`: `AllMonitors` only for now. The type should still allow `Monitor(id)` later. Windows (`IDesktopWallpaper`), macOS (`NSScreen`), KDE (screen number), XFCE and wlroots (outputs) can do per-monitor; GNOME cannot.
- Optional `alsoLockScreen` / dark variant flags. Linux backends always set `picture-uri-dark` too.

### Capabilities

`capabilities()` should be probed once and cached by the host:
- `backend`: an id such as `win32-idesktopwallpaper`, `macos-nsworkspace`, `gnome-gsettings`, `kde-plasmashell`, `xdg-portal`, `xfce-xfconf`, `wlr-swaybg`, `x11-feh`
- `perMonitor`
- `coversAllWorkspaces`: false on macOS (active Space only)
- `persistsWithoutApp`: false on wlroots and bare X11
- `mayPromptUser`: true for the portal, and for AppleScript if that route were ever used
- `requiresMainThread`: macOS, so the helper has to own its main thread
- `supportsDarkVariant`
- `supportedFits`

### Result and errors

The result should be a structured outcome, never a thrown string:
- `ok` with timings (call duration, backend id).
- Typed errors:
  - `FileNotFound` / `UnreadableImage`
  - `UnsupportedDesktop` (unknown `XDG_CURRENT_DESKTOP`)
  - `BackendUnavailable` (D-Bus service missing, swaybg not installed, plasmashell not running)
  - `PermissionDenied` (the user declined the portal, or AppleScript was denied)
  - `ShellLocked` (KDE widgets locked)
  - `Timeout` (the host-side watchdog fired)
  - `PartialSuccess` (some monitors failed, with a per-monitor list)
  - `Superseded` (a newer request won; latest-wins)
- The **host** owns the latency budget and the "never freeze" requirement. Every backend call is async from the Electron side and has a timeout. The backend never touches Electron's main thread.

### Process and tech implications

- **Separate process.** Run a long-lived native helper process that talks over stdio or JSON, one binary per OS. A per-apply spawn would pay process start-up every time.
  - It suits macOS (it needs its own AppKit main thread).
  - It suits Windows (an STA COM thread, crash isolation from Electron).
  - It suits Linux (a D-Bus connection kept open; daemons like swaybg have to be supervised).
- **Language.** Rust covers all three platforms well: `windows` crate for COM; `objc2-app-kit` for NSWorkspace; `zbus` for D-Bus/portal/PlasmaShell; `gio` or `zbus` for dconf.
  - Go needs cgo plus an ObjC shim on macOS, and COM is clumsy.
  - C++ works everywhere but costs more effort on Linux D-Bus.
- **Linux shape.** Linux is a *dispatcher over several sub-backends*, not one backend:
  - Probe order: portal if sandboxed, then GNOME-family gsettings, then KDE PlasmaShell, then XFCE, then Cinnamon/MATE, then wlroots daemon IPC or swaybg, then X11 feh/xwallpaper.
  - Each sub-backend reports its own capabilities.

## 5. Open points for later tickets

- Measure real visible-change latency on GNOME, KDE and macOS (decode plus crossfade). Nothing here is measured.
- Decide whether wlroots/X11 "non-persistent" tiers are supported at all, or are out of scope given the "real OS wallpaper" requirement.
- macOS: see whether the undocumented placement key or a per-Space workaround is worth it, or accept active-Space-only.

## Sources

- Apple docs: [setDesktopImageURL(_:for:options:)](https://developer.apple.com/documentation/appkit/nsworkspace/setdesktopimageurl(_:for:options:)); [forum thread 834630](https://developer.apple.com/forums/thread/834630)
- [sindresorhus/wallpaper](https://github.com/sindresorhus/wallpaper); [sindresorhus/macos-wallpaper](https://github.com/sindresorhus/macos-wallpaper)
- [XDG Wallpaper portal spec](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Wallpaper.html)
- Portal backends, which portals each one implements:
  - xdg-desktop-portal-gnome: `data/meson.build`, `src/wallpaper.c`
  - xdg-desktop-portal-kde: `data/kde.portal`, `src/wallpaper.cpp`
  - xdg-desktop-portal-wlr: `wlr.portal`
  - xdg-desktop-portal-hyprland: `hyprland.portal`
  - xdg-desktop-portal-cosmic: `data/cosmic.portal`
  - xdg-desktop-portal-gtk: `data/gtk.portal.in`
- plasma-workspace: `wallpapers/image/plasma-apply-wallpaperimage.cpp`
- [reujab/wallpaper.rs](https://github.com/reujab/wallpaper.rs): `src/windows.rs`, `src/macos.rs`, `src/linux/{mod,gnome,kde,xfce}.rs`; crates.io API
- [reujab/wallpaper](https://github.com/reujab/wallpaper): `windows.go`
- [LuckyTurtleDev/more-wallpapers](https://github.com/LuckyTurtleDev/more-wallpapers)
- [swaywm/swaybg](https://github.com/swaywm/swaybg); [hyprwm/hyprpaper](https://github.com/hyprwm/hyprpaper); [LGFae/swww](https://github.com/LGFae/swww)

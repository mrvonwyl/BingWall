# PRD: BingWall

## Summary

BingWall is a small, installable Windows desktop app that replaces the official Bing Wallpaper app. It automatically downloads the daily Bing image and sets it as the desktop wallpaper, keeps a local history of the last 8 images with their metadata, and lets the user browse/select from that history — all without the bloat and annoyances of the official app.

## Motivation

The user likes Bing's daily wallpaper concept (image + description/copyright metadata + daily cycle) but finds the official Bing Wallpaper app poorly built and irritating to use. This is a from-scratch replacement, built and controlled by the user.

## Goals

- Automatically download and set the daily Bing wallpaper with zero manual interaction required
- Preserve and surface Bing's image metadata (title, description, copyright)
- Keep a local rolling history of the last 8 daily images, selectable as wallpaper
- Ship as a proper installable Windows app (not a script), with auto-update
- Be unobtrusive: runs quietly in the background, no unnecessary prompts/notifications

## Non-goals

- Cross-platform support (macOS/Linux) — Windows only for v1
- Per-monitor wallpaper fit-mode customization — global fit mode only for v1
- Code signing / distribution to other users beyond the author
- Historical archive beyond 8 images (older images are pruned, not kept forever)

## User stories

1. As a user, I want the app to automatically download and set today's Bing wallpaper without me doing anything, so I always have a fresh wallpaper.
2. As a user, I want the app to keep running quietly in the system tray and start on login, so I don't have to remember to launch it.
3. As a user, I want to see the current wallpaper's date, title, description, and copyright info in the app window, so I know what I'm looking at.
4. As a user, I want to browse the last 8 days of wallpapers and pick one to set as my current wallpaper, so I can revisit an image I liked.
5. As a user, I want to control whether a genuinely new daily image auto-overrides my manual pick (a toggle), so I can decide whether "today's image" always wins or my choice sticks.
6. As a user, I want a manual refresh button that shows me an error if the fetch fails, so I can troubleshoot without being nagged by background failures.
7. As a user, I want a one-click way to export/copy the currently displayed image into my Downloads folder (named with its title), so I can reuse it elsewhere.
8. As a user, I want the wallpaper applied to all my monitors (16:9 and 21:9 ultrawide) using Fill mode, understanding the ultrawide will crop some of the image.
9. As a user, I want to install this app like normal software and have it auto-update itself from new releases, so maintenance is low-friction.
10. As a developer, I want a manual, dropdown-driven release workflow on GitHub so I fully control when and how versions are cut and published.

## Functional requirements

### Image acquisition
- Fetch Bing's daily image metadata via the `HPImageArchive` endpoint, market `de-CH` primary, `de-DE` fallback, requesting the last 8 entries (`n=8`)
- Resolve the best-fit image resolution based on the primary display (auto-detected via Electron's `screen` API), defaulting toward UHD/4K, with a manual override available in settings
- Download the resolved image and store it locally

### Local storage
- Store images and metadata under `%USERPROFILE%\Pictures\BingWallpapers\`
- Images named `YYYY-MM-DD.jpg`; a single `metadata.json` index holds title/description/copyright/copyright-link for all retained entries
- Retain at most 8 images/entries (matching the Bing API window); prune older ones automatically
- Settings persist as a two-tier config: a small bootstrap pointer file in `%APPDATA%\BingWall\` holding the current data-folder path, and a full `settings.json` co-located inside the data folder itself (for easy single-folder backup)

### Wallpaper application
- Set the desktop wallpaper via the `wallpaper` npm package, applied to all monitors
- Use Fill fit mode globally (no per-monitor override in v1); note that ultrawide monitors will show a cropped image under Fill since Bing images are native 16:9

### History & manual selection
- Display the last 8 retained images as a picker strip in the main window
- Selecting a thumbnail immediately sets that image as the desktop wallpaper
- A "Daily auto-refresh" setting (default on) governs whether a genuine new daily image automatically overrides a manual selection; when off, manual selection persists until the user changes it

### App lifecycle
- Runs tray-resident; minimizing/closing the window keeps the app running in the tray
- Registers for launch-on-login via Electron's built-in `setLoginItemSettings`
- On auto-launch (login), the main window starts hidden; on manual launch (double-click), it opens visibly
- Background check runs every 60 minutes and on wake/unlock; failures are retried silently on the next interval with no notifications
- A manual "Refresh" action in the main window triggers an immediate check and displays an error banner (with reason) if it fails

### Export
- A "Download" action in the main window copies the currently displayed image into the user's Downloads folder, named `YYYY-MM-DD_Title.jpg`

### Tray interaction
- Left-click on the tray icon opens/focuses the main window
- Right-click opens a context menu: Refresh now, Open wallpaper folder, Launch on login (toggle), Quit

### Packaging & distribution
- Built with Electron, packaged via `electron-builder` into a Windows NSIS installer
- No code signing for v1 (SmartScreen click-through accepted)
- Published to a public GitHub repository named `BingWall`
- Auto-update via `electron-updater`, polling the public GitHub Releases feed
- Releases are cut via a manually-triggered GitHub Actions `workflow_dispatch` workflow with a major/minor/patch dropdown input, which bumps the version, tags, builds, and publishes the release with installer artifacts attached

## Open questions / risks

- `de-CH` is not a documented Bing market; needs verification that it returns valid data before relying on it as primary (fallback to `de-DE` mitigates this)
- Unsigned installer will trigger Windows SmartScreen warnings on install/update — accepted tradeoff for a personal tool

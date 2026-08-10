# Plan: BingWall

> Source PRD: ../PRD.md

## Architectural decisions

Durable decisions that apply across all phases:

- **Platform**: Windows only (v1). Electron app; Tauri migration considered later but out of scope now.
- **Renderer stack**: Plain HTML/CSS/vanilla JS — no frontend framework.
- **Packaging**: `electron-builder`, NSIS Windows installer, no code signing.
- **Data source**: Bing `HPImageArchive` endpoint (`format=js&idx=0&n=8&mkt=<market>`), market `de-CH` primary, `de-DE` fallback.
- **Storage layout**:
  - Data folder: `%USERPROFILE%\Pictures\BingWallpapers\` (relocatable via settings)
  - Images: `YYYY-MM-DD.jpg`
  - Metadata: single `metadata.json` index (array of up to 8 entries: date, title, description, copyright, copyrightlink, resolution)
  - Settings: two-tier — bootstrap pointer (`%APPDATA%\BingWall\bootstrap.json`, holds only the data-folder path) + full `settings.json` co-located inside the data folder
- **Wallpaper application**: `wallpaper` npm package, Fill mode, applied to all monitors, no per-monitor override.
- **Retention**: max 8 images/metadata entries, oldest pruned automatically.
- **Background cadence**: check every 60 minutes + on wake/unlock; silent retry on failure, no OS notifications.
- **Repo**: public GitHub repo `BingWall`.
- **Release process**: manual `workflow_dispatch` GitHub Actions workflow with major/minor/patch dropdown → version bump, tag, build, publish GitHub Release with installer artifact.
- **Auto-update**: `electron-updater` polling the public GitHub Releases feed.

---

## Phase 0: Project scaffolding

**User stories**: Foundation for all stories (10 — release control starts here too)

### What to build

Initialize the project end-to-end so it runs, even though it does nothing yet. Git repo initialized and pushed to a new public GitHub repo named `BingWall`. Electron project structure in place (main process, preload, renderer folders). `package.json` with Electron, `electron-builder` config skeleton (appId, product name, win target), and basic npm scripts (`start`, `build`). A minimal main process creates a tray icon and an empty (or placeholder) browser window. App launches locally via `npm start`.

### Acceptance criteria

- [ ] Git repo initialized, `.gitignore` covers `node_modules`, build output, and local data folders
- [ ] GitHub repo `BingWall` created (public) and initial commit pushed
- [ ] `npm start` launches an Electron app showing a tray icon and a blank/placeholder window
- [ ] `electron-builder` config present in `package.json` (or `electron-builder.yml`) targeting Windows NSIS, even if not yet run to produce a real installer
- [ ] Basic folder structure established: `main/`, `preload/`, `renderer/` (or equivalent)

---

## Phase 1: Core fetch & wallpaper set

**User stories**: 1, 8

### What to build

The end-to-end daily-image pipeline, triggered once on app launch (no scheduling yet). On startup, the app calls the Bing `HPImageArchive` endpoint (`de-CH` primary, `de-DE` fallback), resolves the best image resolution for the primary display (auto-detected, defaulting toward UHD), downloads the newest image and its metadata into `Pictures\BingWallpapers\` (as `YYYY-MM-DD.jpg` + `metadata.json`), and sets it as the desktop wallpaper across all monitors via the `wallpaper` package in Fill mode.

### Acceptance criteria

- [ ] Launching the app downloads today's Bing image and metadata into `Pictures\BingWallpapers\`
- [ ] `metadata.json` contains at least date, title, description, copyright, copyrightlink for the fetched entry
- [ ] Desktop wallpaper is set to the downloaded image on all connected monitors
- [ ] If `de-CH` returns no data, the app falls back to `de-DE` and still succeeds
- [ ] Image resolution requested matches (or is the closest available to) the primary display's resolution

---

## Phase 2: Main window UI

**User stories**: 3

### What to build

A real main window replacing the placeholder from Phase 0. It displays the currently-set wallpaper image, its date, title, description, and copyright (rendered as a link to `copyrightlink` when present). Reads directly from the local `metadata.json`/image files written by Phase 1 — no new fetch logic here.

### Acceptance criteria

- [ ] Main window shows the current wallpaper image, date, title, description, and copyright
- [ ] Copyright text links out to `copyrightlink` when available
- [ ] Window reflects on-disk state correctly after a fresh Phase 1 run

---

## Phase 3: History & manual selection

**User stories**: 4, 5

### What to build

A picker strip in the main window showing thumbnails for all retained entries (up to 8) from `metadata.json`. Clicking a thumbnail sets that image as the current desktop wallpaper (via the same wallpaper-setting logic from Phase 1) and updates the main view to reflect it. Retention pruning enforced: once more than 8 dated entries exist on disk, the oldest image + metadata entry are deleted. A "Daily auto-refresh" setting (default on) is introduced (value only — wiring to override behavior happens in Phase 4/5 once background checks exist) and stored via the settings mechanism from Phase 6, or as a simple placeholder until Phase 6 lands.

### Acceptance criteria

- [ ] Picker strip shows up to 8 thumbnails, most recent first
- [ ] Clicking a thumbnail sets it as the desktop wallpaper and updates the main view
- [ ] Disk retention never exceeds 8 image/metadata entries; oldest is pruned automatically
- [ ] "Daily auto-refresh" toggle exists in the UI (state persisted, even if not yet enforced until Phase 5)

---

## Phase 4: Tray & lifecycle

**User stories**: 2

### What to build

Full tray-resident behavior. Closing/minimizing the main window keeps the app running in the tray instead of quitting. Tray icon: left-click opens/focuses the main window; right-click opens a context menu (Refresh now, Open wallpaper folder, Launch on login toggle, Quit). App registers for launch-on-login via Electron's `setLoginItemSettings`. On auto-launch (login), the main window starts hidden; on manual launch, it opens visibly. Background check runs on a 60-minute timer and on wake/unlock, re-running the Phase 1 fetch pipeline; failures are caught and retried silently on the next interval with no OS notifications.

### Acceptance criteria

- [ ] Closing the main window leaves the app running in the tray (does not quit)
- [ ] Left-click on tray icon opens/focuses the window; right-click shows the context menu with all four actions working
- [ ] "Launch on login" toggle actually registers/unregisters the app with Windows
- [ ] On login-triggered launch, window starts hidden; on manual launch, window starts visible
- [ ] Background check fires every 60 minutes and immediately after system wake/unlock
- [ ] A simulated fetch failure does not crash the app, produce a notification, or block the next scheduled check

---

## Phase 5: Manual refresh & error handling

**User stories**: 5, 6

### What to build

A "Refresh" action in the main window (and tray menu) that triggers an immediate fetch/check outside the 60-minute cadence. On success, the UI updates as usual. On failure, an error banner appears in the main window with a human-readable reason (network error, API error, etc.) and dismisses on next successful refresh. The "Daily auto-refresh" toggle from Phase 3 is now enforced: when on, a genuinely new daily image (from either the timer or manual refresh) overrides any manually-selected wallpaper; when off, the manual selection is preserved even if a new image is fetched and stored.

### Acceptance criteria

- [ ] "Refresh" button/menu action triggers an immediate check, independent of the 60-minute timer
- [ ] A failed refresh shows an error banner with a specific reason; a subsequent successful refresh clears it
- [ ] With "Daily auto-refresh" on, a new daily image overrides a prior manual wallpaper selection
- [ ] With "Daily auto-refresh" off, a manually-selected wallpaper is not overridden when a new daily image is fetched

---

## Phase 6: Settings & folder/resolution config

**User stories**: (supports 1, 4, 8 via configurability)

### What to build

Introduce the full settings system: `electron-store`-backed `settings.json` co-located in the data folder, with a small bootstrap pointer file in `%APPDATA%\BingWall\` holding the current data-folder path. A settings UI (panel or separate window) exposes: data folder path (with the ability to relocate — moving `settings.json`/images and updating the bootstrap pointer), display-resolution override for image downloads, and the "Daily auto-refresh" toggle (migrated here from its Phase 3 placeholder if applicable).

### Acceptance criteria

- [ ] Settings persist across app restarts via `settings.json` inside the data folder
- [ ] Bootstrap pointer file correctly locates the data folder on startup, even after a relocation
- [ ] Changing the data folder path in settings moves existing data and updates the bootstrap pointer accordingly
- [ ] Resolution override in settings changes the resolution requested on the next fetch
- [ ] "Daily auto-refresh" toggle state is read from and written to `settings.json`

---

## Phase 7: Export to Downloads

**User stories**: 7

### What to build

A "Download" action in the main window that copies the currently displayed image file into the user's Downloads folder, renamed to include its title (`YYYY-MM-DD_Title.jpg`, with filesystem-unsafe characters sanitized out of the title).

### Acceptance criteria

- [ ] Clicking "Download" copies the currently displayed image into `Downloads\`
- [ ] Exported filename follows `YYYY-MM-DD_Title.jpg` with the title sanitized for filesystem safety
- [ ] Action works for both the auto-fetched current image and any manually-selected history image

---

## Phase 8: Packaging

**User stories**: 9

### What to build

Finalize `electron-builder` configuration for a real, distributable Windows installer: app icon, product metadata, NSIS installer options (install location, shortcuts). Produce a locally-built installer and verify a full install/uninstall cycle works, including that launch-on-login and the tray icon behave correctly post-install.

### Acceptance criteria

- [ ] `electron-builder` produces a working NSIS installer locally
- [ ] Installer includes an app icon and correct product name/version metadata
- [ ] Installed app launches, sets wallpaper, and behaves identically to the dev-run version
- [ ] Uninstalling cleanly removes the app (data folder in Pictures is left intact by design)

---

## Phase 9: Auto-update

**User stories**: 9

### What to build

Wire `electron-updater` into the app to check the public GitHub Releases feed for `BingWall` on startup (and optionally periodically), download and apply updates following the standard Electron auto-update flow (notify-and-restart or silent, per electron-updater defaults).

### Acceptance criteria

- [ ] App checks the GitHub Releases feed on startup without error
- [ ] Given a newer published release, the app downloads and installs the update, restarting into the new version
- [ ] No update check causes a crash or blocks normal app startup when offline or when no new release exists

---

## Phase 10: Release CI

**User stories**: 10

### What to build

A GitHub Actions workflow, manually triggered via `workflow_dispatch`, with a dropdown input selecting `major` / `minor` / `patch`. On trigger, it bumps the version in `package.json` accordingly, creates and pushes a matching git tag, builds the Windows installer via `electron-builder`, and publishes a GitHub Release with the installer attached as an artifact.

### Acceptance criteria

- [ ] Workflow is manually triggerable from the GitHub Actions UI with a major/minor/patch dropdown
- [ ] Running it bumps `package.json` version correctly per the selected bump type
- [ ] A git tag matching the new version is created and pushed
- [ ] A GitHub Release is published with the built installer attached as a downloadable asset
- [ ] `electron-updater` in a previously-installed build detects and can install the newly published release

# Does Fill-per-monitor survive monitor hot-plug and resolution changes without BingWall?

Ticket: [#33](https://github.com/mrvonwyl/BingWall/issues/33). Map: [#29](https://github.com/mrvonwyl/BingWall/issues/29). Architecture: [#27](https://github.com/mrvonwyl/BingWall/issues/27).

## Answer

**Yes. BingWall needs to do nothing.** It doesn't need to listen for `WM_DISPLAYCHANGE`, `WM_DPICHANGED` or device-arrival events, and it doesn't need to re-apply.

With one image set through `SystemParametersInfoW(SPI_SETDESKWALLPAPER)` and `WallpaperStyle=10` / `TileWallpaper=0`, the wallpaper is stored as user-wide settings, not as per-monitor assignments:

- the `Wallpaper` path, `WallpaperStyle` and `TileWallpaper` values in `HKCU\Control Panel\Desktop`;
- a cached copy at `%APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper`.

Explorer owns the desktop window and redraws it whenever the display layout changes. It fills each monitor from that one image, using that monitor's current pixel size. A monitor that is plugged in, unplugged or set to a new resolution therefore just gets the same Fill crop computed for its new size.

There is one known Microsoft-documented glitch, listed below. It is cosmetic and caused by the OS, and the user fixes it the same way with or without BingWall.

## Evidence

### Why nothing per monitor can get lost

- SPI has no idea of individual monitors. `SPI_SETDESKWALLPAPER` takes one path, and the position comes from the user-wide `WallpaperStyle`/`TileWallpaper` values ([SystemParametersInfoW, Microsoft Learn](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-systemparametersinfow)).
- Per-monitor state exists only with `IDesktopWallpaper::SetWallpaper(monitorID, …)`. There the monitor ID is a device path ([IDesktopWallpaper, Microsoft Learn](https://learn.microsoft.com/windows/win32/api/shobjidl_core/nn-shobjidl_core-idesktopwallpaper); [Raymond Chen, *Obtaining information about the user's wallpaper on multiple monitors*](https://devblogs.microsoft.com/oldnewthing/?p=833)).
  - That per-monitor mapping is what can go stale or swap when monitors come and go. #27 dropped `IDesktopWallpaper`, so BingWall no longer creates that state.
- A monitor that appears later has no per-monitor entry to be missing, so it gets the single image like every other monitor.

### Explorer redraws on display changes by itself

- Windows sends `WM_DISPLAYCHANGE` to all top-level windows when the display mode changes ([ChangeDisplaySettingsEx, Microsoft Learn](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-changedisplaysettingsexw)).
- Explorer's desktop window (Progman/WorkerW) handles this and redraws the wallpaper from its cached `TranscodedWallpaper`. That is why the wallpaper survives reboots and logons while BingWall isn't running at all, which is the same situation as a hot-plug with BingWall closed.
- Microsoft's own workaround for the glitch below is to change the resolution and revert it. This shows that Explorer recomputes the fit on every mode change without any app involved.

### DPI and scaling changes

- Fill works on physical pixels. Changing the scale factor (100 % to 125 %) doesn't change the monitor's pixel resolution, so the crop doesn't change either.
- The desktop is redrawn anyway when the layout changes. No action is needed.

### The source file may be pruned

- `main/storage.ts` deletes images that leave history.
- After an SPI apply, `Wallpaper` holds BingWall's path, but Explorer redraws from the `TranscodedWallpaper` copy it made at apply time. Forum and Microsoft Q&A reports agree that this cache, not the original file, is what Windows renders at boot. Deleting the cache is the standard way to clear a stale wallpaper ([Microsoft Q&A, corrupt TranscodedWallpaper after GPO](https://learn.microsoft.com/en-us/answers/questions/405776/corrupt-transcodedwallpaper-file-after-deployed-wa)).
- So a hot-plug after pruning still has an image to fill from.
- **Not verified locally:** whether Explorer ever goes back to the original path on a display change. The manual check below covers this. If it ever fails, the fix is in pruning (never delete the image currently applied), not in reacting to display events.

### Local state (read only)

On the reference machine:

- `HKCU\Control Panel\Desktop` holds `WallpaperStyle=10`, `TileWallpaper=0`.
- `Wallpaper` currently points at `...\Themes\TranscodedWallpaper`, which is left over from the old `IDesktopWallpaper` path.
- `Themes\` holds `Transcoded_000` and `Transcoded_001` (per-monitor copies made by the per-monitor `IDesktopWallpaper` loop) and a `TranscodedWallpaperCache\` folder.
- Once the SPI sidecar ships, this per-monitor state is replaced by the single `TranscodedWallpaper`.

I changed no display settings and no wallpaper, as instructed.

## Known OS glitch (not BingWall's problem)

[*The wallpaper might not correctly fit the screen after connecting an external display in Windows*](https://support.microsoft.com/topic/the-wallpaper-might-not-correctly-fit-the-screen-after-connecting-an-external-display-in-windows-6fdc245b-28f5-4333-a205-7e51a2eec593) (Microsoft Support, Windows 10/11):

- **When:** right after an external display is connected to a device whose built-in display has a different resolution.
- **Symptom:** the wallpaper on the external screen can come out too small, or too large and cut off at the right and bottom edges.
- **Workaround:** change the resolution of the external display, then choose Revert.
- [Huawei](https://consumer.huawei.com/en/support/content/en-us15943804) describes the same bug after a dock is reconnected and calls it a known Windows issue.

Why this doesn't need handling:

- It's a laptop (built-in display) scenario. The reference setup is a desktop with two external monitors.
- Every wallpaper app has it, including Settings > Personalization itself.
- Re-applying from BingWall on `WM_DISPLAYCHANGE` would only paper over it. It would also add an SPI apply plus an accent-colour recompute (#23) on every display change, which is the freeze we are trying to avoid.

## Manual check that would settle it (about 5 minutes)

This can't be done safely by an agent because it changes the display configuration. Run it after the SPI sidecar has applied an image, with **BingWall closed**:

1. Note `(Get-ItemProperty 'HKCU:\Control Panel\Desktop').Wallpaper` and take a screenshot of both monitors.
2. **Resolution:** Settings > System > Display > the 2560×1440 monitor, choose 1920×1080, look at the desktop, then press Revert. Expected: Fill crop correct at both sizes, with no black bars.
3. **DPI:** set the 3440×1440 monitor's scale to 125 %, look, then set it back to 100 %. Expected: unchanged crop.
4. **Hot-plug:** unplug the 2560×1440 cable, wait for the layout to settle, then plug it back in. Expected: both monitors filled with the same image, each cropped for its own aspect ratio.
5. **Pruned source:** rename the applied JPG in BingWall's image folder, then repeat step 4. Expected: still correct, because the image is drawn from `TranscodedWallpaper`. Rename the JPG back.

If steps 2–4 fail, that would be the OS glitch above (try the Revert workaround). If step 5 fails, the fix is "never prune the currently applied image", not a display-change listener.

## Sources

- [SystemParametersInfoW, Microsoft Learn](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-systemparametersinfow)
- [IDesktopWallpaper, Microsoft Learn](https://learn.microsoft.com/windows/win32/api/shobjidl_core/nn-shobjidl_core-idesktopwallpaper)
- [ChangeDisplaySettingsExW, Microsoft Learn](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-changedisplaysettingsexw)
- [Microsoft Support: wallpaper might not correctly fit the screen after connecting an external display](https://support.microsoft.com/topic/the-wallpaper-might-not-correctly-fit-the-screen-after-connecting-an-external-display-in-windows-6fdc245b-28f5-4333-a205-7e51a2eec593)
- [Huawei: wallpaper display abnormal on external display](https://consumer.huawei.com/en/support/content/en-us15943804)
- [Raymond Chen, Obtaining information about the user's wallpaper on multiple monitors](https://devblogs.microsoft.com/oldnewthing/?p=833)
- [Microsoft Q&A: corrupt TranscodedWallpaper file after GPO wallpaper](https://learn.microsoft.com/en-us/answers/questions/405776/corrupt-transcodedwallpaper-file-after-deployed-wa)
- [Elevenforum: multi-monitor setup (per-monitor settings remembered across reconnects)](https://www.elevenforum.com/t/multi-monitor-setup.46284/page-2)

# Does SystemParametersInfoW set the wallpaper on every Windows 11 virtual desktop?

Research for [#34](https://github.com/mrvonwyl/BingWall/issues/34) (map: [#29](https://github.com/mrvonwyl/BingWall/issues/29)). Decision context: [#27](https://github.com/mrvonwyl/BingWall/issues/27) commits BingWall to `SystemParametersInfoW(SPI_SETDESKWALLPAPER)` from a Rust sidecar.

Method: desk research plus read-only inspection of this machine (Windows 11 build 26200.9711, Bing Wallpaper app 1.1.469.0 installed). No wallpaper was changed and no virtual desktop was created, so nothing below is a measurement of BingWall itself.

## Short answer

**No, not reliably.** On Windows 11, each virtual desktop keeps its own wallpaper. `SPI_SETDESKWALLPAPER` (and `IDesktopWallpaper::SetWallpaper`) change the **current** desktop. Other desktops that already have their own picture keep it. No public API sets the wallpaper of another desktop, or of all desktops. The only programmatic route is the undocumented `IVirtualDesktopManagerInternal` (`SetDesktopWallpaper` / `UpdateWallpaperPathForAllDesktops`). Its GUID and vtable changed four times between Windows 11 21H2 and 24H2. The official Bing Wallpaper app does use it, with two build-specific interface definitions and a registry fallback.

## 1. What SPI and IDesktopWallpaper do with virtual desktops

### Documentation

- The Microsoft Learn pages for `SystemParametersInfoW` and `IDesktopWallpaper::SetWallpaper` don't mention virtual desktops. `SetWallpaper(NULL, path)` is documented as "all monitors", not all desktops.
- The documented `IVirtualDesktopManager` has only three methods: `IsWindowOnCurrentVirtualDesktop`, `GetWindowDesktopId` and `MoveWindowToDesktop`. It has nothing for wallpaper.
- Microsoft Support confirms the per-desktop picture feature (Task View → right-click a desktop → *Choose background*). Per desktop, it supports **Picture** only. Solid colour and Slideshow apply to all desktops.

### Observed behaviour, as reported by other wallpaper apps

| Source | Report |
|---|---|
| [Bing Wallpaper on Microsoft Tech Community](https://techcommunity.microsoft.com/discussions/bing/bing-wallpaper-app-issue-on-win-11-with-multiple-desktops/2969683), Nov 2021 – Jul 2023 | "The wallpaper app only seems to update one of the desktops"; several users confirm daily. |
| [WinDynamicDesktop #475](https://github.com/t1m0thyj/WinDynamicDesktop/issues/475) / [#398](https://github.com/t1m0thyj/WinDynamicDesktop/issues/398) | WDD sets wallpaper through `IActiveDesktop` / `IDesktopWallpaper`. On Windows 11, "the wallpaper only changes on the active one until you click 'Refresh wallpaper' on each one". This happens even for users who never wanted per-desktop images. Syncing was moved out to an opt-in script because the API "breaks frequently in new Insider releases". |
| [WDD-scripts SyncVirtualDesktops.ps1](https://github.com/t1m0thyj/WDD-scripts/tree/master/experimental) | The workaround: after each apply, it calls `Set-DesktopWallpaper` (PSVirtualDesktop, which wraps `IVirtualDesktopManagerInternal`) on every non-current desktop. It also re-runs `Update-Module` whenever the OS version changes. |
| [DisplayFusion forum](https://www.displayfusion.com/Discussions/View/windows-11-background-image-and-virtual-desktops/?ID=9a2ab77a-0353-4e14-86ab-bd7a2599b39d), 2021 – 2026 | "When switching desktops, Windows forces the wallpaper." The app re-applies its own after each switch. |
| [VirtualDesktopAccessor #85](https://github.com/Ciantic/VirtualDesktopAccessor/issues/85) | The author uses plain `SystemParametersInfo` "to change desktop wallpaper for all desktops". **This contradicts the other reports.** The likely explanation is that it holds only while no desktop has its own stored picture yet (see below). This is not verified. |

### What the registry on this machine shows (read-only)

- `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops\Desktops\{desktop-GUID}` holds 114 per-desktop subkeys, and nearly every one has a `Wallpaper` value. Most point at Bing Wallpaper app images. Several point at `C:\Users\mrvonwyl\Pictures\bing.jpg`, the path used by older BingWall builds.
- So the shell records the applied image into the *current* desktop's subkey on ordinary applies. It doesn't only do this when the user picks a per-desktop image in Task View. Once a desktop has such a value, it keeps that picture until something writes to it again. This is consistent with the "only the active desktop changes" reports.
- This is an inference from stored state. It is not a controlled test. A controlled test needs a second virtual desktop, which this task was not allowed to create. To reproduce it: create desktop 2, apply via SPI on desktop 1, switch to desktop 2, and compare `Desktops\{id}\Wallpaper` before and after.

### Answer to the sub-questions

- **Every desktop or only the current one?** Only the current one is guaranteed. Other desktops change only if they have no wallpaper of their own stored. On a Windows 11 system that has been used for a while, they usually do have one.
- **Does it change once a user has set a per-desktop wallpaper?** Yes. That desktop then keeps its own picture, and SPI calls from another desktop never touch it.

## 2. What the official Bing Wallpaper app does

These findings come from a read-only string scan of `BingWallpaper.dll` from `Microsoft.BingWallpaper_1.1.469.0` (.NET 9, WinUI). The type and member names it contains include:

- `IVirtualDesktopWallpaperService`, `IAllDesktopsWallpaperSetter` with `SupportedSetter` / `UnsupportedSetter`, `TrySetAllDesktopsWallpaper`, `ApplyToVirtualDesktops`, `ApplyWallpaperToCurrentDesktop`
- `VirtualDesktopManagerInternal`, `UpdateWallpaperPathForAllDesktops`, and the error strings "ImmersiveShell CLSID not registered." and "Failed to create ImmersiveShell."
- **Two interface definitions: `IVdManagerInternalBuild22000To26099` and `IVdManagerInternalBuild26100OrLater`**, plus the GUID string `53F5CA0B-158F-4124-900C-057158060B27`
- `TryWriteAllVirtualDesktopRegistry`, `VirtualDesktopRegistryChangeListener`, `ApplyWallpaperAfterVirtualDesktopChange`, and the key paths `...\Explorer\VirtualDesktops\Desktops`, `CurrentVirtualDesktop` and `VirtualDesktopIDs`
- It also calls `SystemParametersInfo` and `IDesktopWallpaper` for the normal apply.

Read together, these names suggest the following. The method bodies weren't decompiled, so this is inferred from the names.

1. The app applies to the current desktop with the documented APIs.
2. It then calls the undocumented `IVirtualDesktopManagerInternal::UpdateWallpaperPathForAllDesktops`, reached through the ImmersiveShell service provider. It picks the vtable layout by build number, at the 26100 boundary, and falls back to an "unsupported" setter otherwise.
3. As a further fallback, it writes `Wallpaper` into every `Desktops\{id}` registry subkey.
4. It listens for desktop switches and reapplies the wallpaper after a switch.

So Microsoft's own app does the same reverse-engineered work as third parties, and it maintains a build switch for it. This matches the 2021–2023 complaints that older versions updated only one desktop.

## 3. How stable `IVirtualDesktopManagerInternal` is

The data below comes from the git history of [MScholtes/VirtualDesktop](https://github.com/MScholtes/VirtualDesktop) (`VirtualDesktop11*.cs` and `Changes.txt`) and its issue tracker.

| Windows 11 build | IVirtualDesktopManagerInternal IID | IVirtualDesktop IID | Wallpaper methods (0-based after IUnknown) |
|---|---|---|---|
| 21H2 / 22H2 up to 22621.2214 | `B2F925B9-5A0F-4D2E-9F4D-2B1507593C10` | `536D3495-B208-4CC9-AE26-DE8111275BF8` | `SetDesktopWallpaper` #13, `UpdateWallpaperPathForAllDesktops` #14 |
| 22621.2215 – 22631.3084 (and Canary 25314+) | `A3175F2D-239C-4BD2-8AA0-EEBA8B0B138E` | `3F07F4BE-B107-441A-AF0F-39D82529072C` | #14, #15 (`SwitchDesktopAndMoveForegroundView` inserted at #7) |
| 22631.3085 – 26099 (23H2) | `53F5CA0B-158F-4124-900C-057158060B27` | `3F07F4BE-B107-441A-AF0F-39D82529072C` | #13, #14 (no `SwitchDesktopAndMoveForegroundView`) |
| 24H2 26100+ / 25H2 26200 | `53F5CA0B-...` (**same IID**) | `3F07F4BE-...` | #14, #15 (`SwitchDesktopAndMoveForegroundView` back at #7) |

Key points:

- **The vtable changed at least four times in three years**, twice in *cumulative updates* within a released version (22621.2215 in Aug 2023, 22631.3085 in Jan 2024), not just at feature-update boundaries. Issue threads in the MScholtes repo ("Not working since last Windows update (22621.2428)", "23H2 build 22631.2861 not working", "Broken in 22621?", repeated Insider breakages) show that consumers broke each time until someone re-reverse-engineered the layout.
- **The 23H2 → 24H2 change kept the same IID while shifting slots by one.** A `QueryInterface` success therefore doesn't prove the layout. You have to switch on the build number, as both MScholtes (separate `-24H2` file) and the Bing Wallpaper app (`...Build26100OrLater`) do. Calling the wrong slot means calling an unrelated method inside `explorer.exe`; the [v1.21 changelog](https://github.com/MScholtes/VirtualDesktop) mentions an Explorer crash caused by misuse of this interface.
- 24H2 → 25H2 (26200) kept the layout ([MScholtes/VirtualDesktop #112](https://github.com/MScholtes/VirtualDesktop/issues/112)). [Ciantic/VirtualDesktopAccessor](https://github.com/Ciantic/VirtualDesktopAccessor) now simply requires 26100.2605+ and was tested on 26200.8117.
- The access path is `CoCreateInstance(CLSID_ImmersiveShell C2F03A33-21F5-47FA-B4BB-156362A2F239)` → `IServiceProvider::QueryService(SID C5E0CDCA-7B6E-41B2-9FC4-D93975CC467B, IID_IVirtualDesktopManagerInternal)`. Both GUIDs also appear in `BingWallpaper.dll`. Calls go cross-process into Explorer, so they can block if Explorer hangs. That matters for the "never freeze" requirement in #29 and the watchdog in #31.
- Signatures: `SetDesktopWallpaper(IVirtualDesktop*, HSTRING path)` and `UpdateWallpaperPathForAllDesktops(HSTRING path)`. Both take an `HSTRING`, so `WindowsCreateString` is needed. Both are usable from Rust via the `windows` crate with a hand-declared `#[interface]`.

## 4. Options this leaves (for #35, no recommendation here)

| Route | Covers other desktops | Public / stable | Notes |
|---|---|---|---|
| SPI only (the current decision in #27) | Current desktop. Others only if they have no stored picture | Yes | No extra risk. |
| SPI + `UpdateWallpaperPathForAllDesktops` | All desktops | No. Build-gated vtable, broke 4× since 2021 | What Bing Wallpaper and WDD's opt-in script do. Needs a build table and a safe "unsupported" path. |
| SPI + write `Desktops\{id}\Wallpaper` registry values | Probably applied on next switch (unverified) | Undocumented but layout-free | Bing Wallpaper keeps this as a fallback. Needs a controlled test. |
| Reapply on desktop switch (watch `CurrentVirtualDesktop`) | Effectively all, lazily | Registry key undocumented | DisplayFusion and Bing Wallpaper do variants of this. Costs one extra apply and a visible flash per switch. |

Whether BingWall must cover other desktops, and how much fragility is acceptable, is the question for [#35](https://github.com/mrvonwyl/BingWall/issues/35).

## Sources

- Microsoft Learn: [SystemParametersInfoW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow), [IDesktopWallpaper::SetWallpaper](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-setwallpaper), [IVirtualDesktopManager](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-ivirtualdesktopmanager)
- Microsoft Support: [Change the desktop background in Windows](https://support.microsoft.com/topic/4a33c533-b71e-447e-b021-a27df2678938)
- [MScholtes/VirtualDesktop](https://github.com/MScholtes/VirtualDesktop): `VirtualDesktop11.cs`, `VirtualDesktop11-24H2.cs`, historic `VirtualDesktop11-23H2.cs` / `VirtualDesktop11InsiderCanary.cs`, `Changes.txt`, issues #67, #75, #92, #112
- [MScholtes/PSVirtualDesktop #27](https://github.com/MScholtes/PSVirtualDesktop/issues/27)
- [Ciantic/VirtualDesktopAccessor](https://github.com/Ciantic/VirtualDesktopAccessor), issue [#85](https://github.com/Ciantic/VirtualDesktopAccessor/issues/85)
- [t1m0thyj/WinDynamicDesktop](https://github.com/t1m0thyj/WinDynamicDesktop) issues #398 and #475, `src/WallpaperApi.cs`; [WDD-scripts SyncVirtualDesktops.ps1](https://github.com/t1m0thyj/WDD-scripts/blob/master/experimental/SyncVirtualDesktops.ps1)
- [Bing Wallpaper multi-desktop thread](https://techcommunity.microsoft.com/discussions/bing/bing-wallpaper-app-issue-on-win-11-with-multiple-desktops/2969683)
- [DisplayFusion: Windows 11 background image and virtual desktops](https://www.displayfusion.com/Discussions/View/windows-11-background-image-and-virtual-desktops/?ID=9a2ab77a-0353-4e14-86ab-bd7a2599b39d)
- [EvilGeniusLabs: Windows 11 virtual desktop wallpaper mix bug](https://evilgeniuslabs.ca/blog/windows-11-virtual-desktop-wallpaper-mix-bug)
- Local, read-only: `BingWallpaper.dll` 1.1.469.0 string scan; `HKCU\...\Explorer\VirtualDesktops\Desktops` on build 26200.9711

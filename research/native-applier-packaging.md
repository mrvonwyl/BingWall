# How should a native applier be packaged with Electron?

Research for issue #26, a child of map issue #29 (Wayfinder: instant, non-blocking wallpaper apply). Researched on 2026-10-21.

## Answer

**Ship a long-lived Rust sidecar `.exe`.** Spawn it once and talk to it with newline-delimited JSON over stdio. Inside it, one dedicated COM thread holds a cached `IDesktopWallpaper` and coalesces requests so the latest one wins. Package it with electron-builder `extraResources` and find it at runtime through `process.resourcesPath`.

A napi-rs addon with its own dedicated thread is a close second. The deciding factors are that the sidecar can crash without taking the app down, it has no coupling to Node or Electron, and it gives the cleanest path to macOS and Linux (same protocol, a different binary per OS). A koffi `worker_thread` costs nothing to try. Use it as the baseline to measure against and as a fallback, not as the destination.

Legend used throughout: **[F]** = a sourced fact (sources at the end). **[I]** = my inference or engineering judgement, not verified by measurement.

## Starting point

- `main/nativeWallpaper.ts` loads `ole32.dll` with koffi. On every apply it calls `CoInitializeEx(STA)` once, then `CoCreateInstance(CLSID_DesktopWallpaper, CLSCTX_LOCAL_SERVER)`, `SetPosition(FILL)` and `SetWallpaper` for each monitor, all **synchronously on the Electron main thread**.
- `IDesktopWallpaper` lives in an out-of-process COM server (the comment in the code says so, and the code uses `CLSCTX_LOCAL_SERVER`). Every method call is therefore a cross-process RPC into the shell. The 2–5 s stall is most likely the shell's own work (decoding, scaling and transitioning a 3440×1440 JPG on each monitor), while our thread waits on the RPC. **[I]**
- **Important caveat [I]:** every option below moves the *wait* off the app's main thread, which fixes the app freezing. None of them makes the shell do its work faster. If the whole PC freezes, that comes from explorer/DWM, and fixing it needs a separate decision (image size, prerendering, `SetWallpaper` call pattern). The measurement tickets in #29 cover that. Packaging only decides where the waiting happens and how cleanly requests can be coalesced.
- Packaging today: electron-builder 25, `asar: false`, NSIS, **no code signing configured**, CI and release both run on `windows-latest` with Node 22. koffi is a prebuilt Node-API addon, and it works without `electron-rebuild` today.

## Options compared

| Criterion | (a) Long-lived sidecar | (b) One-shot process per apply | (c) napi-rs / N-API addon, own thread | (d) koffi in a `worker_thread` |
|---|---|---|---|---|
| Main-thread blocking | None. Node `spawn` and pipe I/O are async **[F]** | None (async `spawn` **[F]**) | None if the work runs on a native thread **[F: AsyncTask runs on libuv pool]** | None. The worker is a separate OS thread **[I]** |
| Per-call overhead | Sub-ms pipe round trip + a cached COM object **[I]** | Process creation (~tens of ms on Windows, rough figure **[F, indirect]**) + COM activation on every call + an AV scan on every launch **[I]** | Microseconds (a function call plus a thread handoff) **[I]** | `postMessage` cost, sub-ms **[I]** |
| Startup cost | Once, at app ready or on first apply. Can be hidden by spawning early **[I]** | Paid on every apply | DLL load at `require` time, ~ms **[I]** | Worker boot (a new V8 isolate, ~tens of ms) once **[I]** |
| Binary size | Rust + `windows` crate, size profile: a few hundred KB to ~1 MB **[F: ~0.55 MB for a non-trivial program with LTO/strip/abort]** | Same binary | Similar `.node` DLL size **[I]** | No new binary (koffi already shipped) |
| Crash isolation | Yes. A crash only kills the sidecar, and we restart it | Yes | **No.** A fault in the addon kills the main process **[I]** | **No** (same process). `utilityProcess` + koffi would add isolation **[F: utilityProcess runs a Node child]** |
| Coalescing (latest wins) | Natural: a reader thread overwrites a single "pending" slot that the COM thread drains **[I]** | Must be done in Node: never more than one in flight, plus one pending slot **[I]** | Natural, same as (a), using a Rust channel / slot **[I]** | Must be done in JS in the worker **[I]** |
| COM apartment | Fully under our control. One thread, `CoInitializeEx` once, interface reused | Fresh process each time, simple | Must **not** use AsyncTask/libuv pool threads (arbitrary threads, no COM init). Spawn a dedicated `std::thread` and use a ThreadsafeFunction for replies **[I, from F: CoInitializeEx is per-thread]** | One dedicated thread. Works if koffi loads in workers (**unverified**) |
| Electron ABI / rebuild | None (not a Node module) | None | None if pure Node-API: ABI-stable across versions, no `electron-rebuild` **[F]**. A fresh build is only needed per OS/arch | None. koffi is Node-API (already true today) |
| electron-builder bundling | `extraResources: [{from: "native/bin/${arch}/", to: "applier"}]`, then `process.resourcesPath` **[F]**. Works the same if asar is ever enabled | Same as (a) | Ship the `.node` inside `files` (with `asar: false` it is just a file). Load it with `createRequire`, because ESM can't `import` a `.node` **[F, Node ESM docs]** | Nothing new |
| Code signing / AV | App is unsigned today. SmartScreen checks the entry point that carries Mark-of-the-Web, i.e. the installer, not files the installer drops **[F/I]**. A small unsigned exe that changes the wallpaper could trigger AV heuristics (ransomware-like) **[I]**. If signing is added, electron-builder signs `.exe` by default **[F]** | Worst: a new process launch on every apply gives AV the most chances to scan or interfere **[I]** | A DLL loaded into a trusted process draws less heuristic attention **[I]**. Signing needs `signExts: [".node"]` **[F]** | Nothing new |
| Smart App Control (Win 11) | Blocks unsigned files without reputation **[F]**. This already applies to the unsigned BingWall.exe, so one more exe changes little **[I]** | Same | Same | Same |
| CI complexity | Rust is preinstalled on GitHub Windows runners **[F]**. Add `Swatinem/rust-cache` and `cargo build --release` before `electron-builder`. Later, macOS and Linux build on native runners in a matrix (no cross-compiling needed) **[I]** | Same | Same as (a) plus `@napi-rs/cli`. Its cross-build tools (zig, xwin) exist but aren't needed with native runners **[F]** | None |
| Cross-platform story | Best. One JSON protocol and a separate small binary per OS (Win: COM; mac: `NSWorkspace.setDesktopImageURL`; Linux: per-DE / `gsettings`). The JS side stays identical **[I]** | Same as (a) | Good. Same Rust crate, three `.node` files | Weak. Calling Objective-C via FFI on mac, and many DE-specific paths on Linux **[I]** |
| Dev loop (`npm run dev`) | Rebuild the exe independently. `dev.ts` can respawn only the sidecar. While running, Windows locks the exe, so the sidecar must be killed before `cargo build` replaces it **[I]** | Easiest. Nothing stays running, so no lock **[I]** | The `.node` stays locked while Electron runs, so a native change means kill Electron, build, restart (`dev.ts` already restarts on `dist/main` changes) **[I]** | Unchanged (TS only) |

### Notes on each option

**(a) Long-lived sidecar (recommended).**
- *Protocol* **[I]**: NDJSON over stdin/stdout. Requests look like `{"id":7,"op":"apply","path":"C:\\...\\img.jpg"}`, replies like `{"id":7,"ok":true,"ms":143}`, `{"id":6,"superseded":true}` or `{"id":7,"ok":false,"hr":"0x80070005"}`. Use stderr for logs. A named pipe adds nothing over stdio for a single parent with a single child.
- *Inside* **[I]**: a stdin reader thread puts the newest request into a `Mutex<Option<Req>>` + `Condvar`, and earlier unstarted requests are answered `superseded`. The COM thread initialises COM once, keeps the `IDesktopWallpaper` instance (and re-creates it if a call returns `RPC_E_DISCONNECTED` or `RPC_S_SERVER_UNAVAILABLE`, e.g. after explorer restarts), and applies.
- *Lifecycle* **[I]**: spawn with `windowsHide: true` right after `app.whenReady()`. EOF on stdin means the sidecar should exit. That covers the Electron main process crashing, because the pipe closes when the parent dies. On an unexpected exit, restart with backoff (e.g. 3 attempts in 30 s) and fail any in-flight request. If restarts are exhausted, fall back to the in-process koffi path, or show an error. (That choice belongs to the "Failure/fallback" item in #29.)
- *Prior art*: VS Code ships ripgrep as a separate per-platform binary, selected by `process.platform`/`arch` and run with `child_process.spawn` **[F]**. Tauri formalises the same sidecar pattern **[F]**.

**(b) One-shot process.** This is the simplest code: `execFile(applier, [path])`. But each apply pays for process creation, `CoCreateInstance` activation of the local server, and possibly an AV on-access scan. That works against the "< 300 ms, faster is better" goal for no real benefit over (a). The only real advantage is that there is no lifecycle code. **[I]**

**(c) napi-rs addon.** Lowest overhead, and no extra process. Node-API ABI stability means no Electron-specific rebuilds **[F]**. Caveats:
- napi-rs `AsyncTask` runs `compute` on the libuv thread pool **[F]**. Those are shared, arbitrary threads, and COM must be initialised on each thread that uses it **[F]**. So a correct design spawns its own COM thread and uses a ThreadsafeFunction to resolve promises. That is the same design as the sidecar, minus the process boundary.
- If the native code faults, or explorer hangs a call indefinitely, the fault or the stuck thread lives inside the main process. A sidecar can simply be killed. **[I]**
- napi-rs generates a CommonJS loader. The ESM app would use `createRequire` or a direct `process.dlopen`. This is manageable. **[F/I]**

**(d) koffi in a `worker_thread`.** A worker has its own OS thread, so the current synchronous code (plus a cached interface and a JS latest-wins slot) would run there without blocking the main thread. **[I]** It keeps koffi, which #29 expects to drop. Whether koffi's addon loads cleanly in a worker inside Electron's main process is **unverified**: no koffi docs or changelog entry mention workers. koffi's own `.async` calls run on a pool of arbitrary threads **[F]**, which is wrong for COM apartment affinity, so `.async` isn't a fix by itself. **[I]** A variant, `utilityProcess.fork` + koffi **[F]**, adds crash isolation without a new toolchain. It is a reasonable no-Rust fallback.

## Ranked recommendation

1. **(a) Long-lived Rust sidecar**, protocol and coalescing as described above. The best balance of zero main-thread blocking, crash/hang isolation (it can be killed if the shell hangs), cached COM, and a clean macOS/Linux story. Cost: about 100 lines of lifecycle and protocol TS plus the Rust binary, and one more step in the release workflow.
2. **(c) napi-rs addon with a dedicated COM thread.** Pick this if measurements show IPC overhead matters (unlikely at sub-ms) or if one more `.exe` causes real AV trouble in the field.
3. **(d) koffi in a worker / utilityProcess.** Best as **step zero**: almost free, and it gives an immediate baseline for how much of the 2–5 s is the main thread versus the shell. It is also the fallback if the sidecar can't run.
4. **(b) One-shot process.** Only as a debugging tool or a last-resort fallback.

Per #29 ("pick technology from measured data"), the follow-up spike (#27) should time `SetWallpaper` end-to-end from (a) and (d) on the reference 2-monitor setup before this choice is committed.

## Open questions / unverified

- Does koffi load and run in an Electron main-process `worker_thread`? (Needs a 10-line spike.)
- Actual sidecar spawn time and the size of a release `.exe` with the `windows` crate (measure; expected < 50 ms and < 1 MB).
- Whether Defender (or common third-party AV) flags an unsigned wallpaper-setting sidecar. Watch the first releases, and consider Azure Trusted Signing (electron-builder supports `win.azureSignOptions` **[F]**) if it does.
- Whether a given STA/MTA choice changes `SetWallpaper` latency for the out-of-proc server (measure both in the spike).

## Sources

- Node-API ABI stability: https://nodejs.org/api/n-api.html
- Electron native modules (ABI, rebuild): https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
- Electron `utilityProcess`: https://www.electronjs.org/docs/latest/api/utility-process
- napi-rs AsyncTask (libuv thread pool, abort semantics): https://napi.rs/docs/concepts/async-task
- napi-rs getting started / cross build: https://napi.rs/docs/introduction/getting-started , https://napi.rs/docs/cross-build
- electron-builder application contents (`extraResources`, `process.resourcesPath`): https://www.electron.build/docs/contents
- electron-builder Windows options (`signExts`: only `.exe` signed by default): https://www.electron.build/docs/win
- electron-builder Windows code signing (Azure Trusted Signing): https://www.electron.build/docs/features/code-signing/code-signing-win
- koffi async calls run on worker threads: https://koffi.dev/load , https://koffi.dev/misc , https://koffi.dev/changelog
- CoInitializeEx (per-thread, apartment rules): https://learn.microsoft.com/en-us/windows/win32/api/combaseapi/nf-combaseapi-coinitializeex
- SmartScreen AppRep (entry point, MotW, Smart App Control): https://textslashplain.com/2024/11/15/best-practices-for-smartscreen-apprep/ , https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Rust binary size flags: https://github.com/johnthagen/min-sized-rust , https://git.berlin.ccc.de/vinzenz/zerforschen.plus/raw/branch/main/content/posts/tiny-binaries-rust.md
- Process launch cost (indirect, Firefox content process ~60 ms on Windows): https://bugzilla.mozilla.org/show_bug.cgi?id=1690855
- VS Code ripgrep sidecar: https://github.com/microsoft/vscode-ripgrep
- Tauri sidecar pattern: https://v2.tauri.app/develop/sidecar/
- GitHub Windows runner image (Rust preinstalled): https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md

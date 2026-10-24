# What can make a market switch reach the desktop faster?

Research for issue #32, a child of map issue #29 (Wayfinder: instant, non-blocking wallpaper apply). It feeds the decision ticket #36 ("How do we cut end-to-end time after a market switch?"). Researched and measured on 2026-10-24, around 16:40 UTC.

## Answer

On this machine's connection, **the download is not the slow part. The way the app downloads is.** One UHD JPG (about 3.6 MB) takes 60 to 100 ms. A market switch today downloads **all 8** images one after another, **oldest first**, so the image that actually gets applied lands last. Measured: the newest image is on disk **580 to 1400 ms** after the switch, against **144 ms** when the newest image is fetched first. On a slower link the gap grows in proportion to size: 8 × 3.65 MB is about 4.7 s at 50 Mbit/s, against 0.6 s for the one image that is needed.

The options, with numbers (no pick, because #36 decides):

| # | Option | Time until the new market's newest image is on disk | Extra cost |
|---|---|---|---|
| A | Download the newest image first, apply it, then fill in the other 7 | **144 ms** measured (UHD), against 580 to 1400 ms today | none (the same bytes, in a different order) |
| B | Download all 8 in parallel | 365 ms newest, 446 ms all 8 (measured) | on a slow link the newest image shares bandwidth with the other 7, so it lands about as late as all 8 together |
| C | Prefetch the other markets in the background | **0 ms** at switch time (already on disk) | about 11 MB/day for the newest UHD of the 3 other markets; 50 to 70 ms per archive call; no rate limit seen |
| D | Reuse a byte-identical picture another market already downloaded | 0 ms when it matches | 6 to 8 of the target market's 8 pictures are already on disk under the old market, but the **newest** one matched in only 2 of 12 market pairs. Needs storage keyed by picture, not by date |
| E | Show the same-date image from the old market as a placeholder | 0 ms | usually a *different picture*, and when the user was on the newest image it is the wallpaper already showing, so nothing changes |
| F | Apply a small image first, then the UHD one | 384×216 is 27 KB, 960×540 is 140 KB, 1920×1080 is 341 KB, each about 10 to 17 ms warm | a second apply: SPI takes about 100 ms to reach the screen, plus the accent-colour work from #23, and two fades |
| G | Use a smaller final image (Bing server-side resize) | 3440×1440 is 0.42 to 1.07 MB (3.4 to 8× smaller than UHD), but **400 to 850 ms on a cold request** vs about 15 ms warm, so it is slower than UHD here | fill on the 2560×1440 monitor changes; conflicts with #28 ("UHD applied as is") |
| H | Accept the download time and only fix the order (= A) | the same as A | none |

Side finding (not part of this ticket, but it breaks things): with `resolutionOverride: null`, the reference setup (largest monitor 3440×1440) resolves to `1920x1200`. **That size returned 404 for 2 of the 8 current en-US images, including today's.** `downloadImage` throws on a non-OK response, so the whole refresh fails.

Legend: **[M]** = measured here (scripts described under "Method"). **[C]** = read from the code on `origin/main`. **[I]** = inference.

## Starting point: what a market switch does today [C]

1. `update-settings` in `main/main.ts` notices that `market` changed and calls `performRefresh(true)` (`replaceExisting = true`).
2. `runDailyUpdate` (`main/pipeline.ts`) calls `HPImageArchive.aspx?format=js&idx=0&n=8&mkt=<market>` once (with a de-CH → de-DE fallback when the result is empty).
3. It loops over the 8 entries **in reverse (oldest first)** and, because `replaceExisting` is true, downloads **every** one with a sequential `await`, writing each to `<dataFolder>/<YYYY-MM-DD>.jpg`. Files are keyed **only by date**, so each download overwrites the old market's image for that date.
4. Only after all 8 are downloaded does it write `metadata.json`, prune orphans, call `setWallpaper(newest)` (if `dailyAutoRefresh`), and send `refresh-result` to the renderer.

So time to the desktop = archive call + **8 sequential downloads** + disk writes + apply, and the applied image is downloaded last.

The resolution comes from `resolveImageResolution`. It picks `UHD` only when the largest display is at least 3840×2160. Otherwise it picks the largest of `1024x768 … 1920x1200` that fits. For 3440×1440 that is `1920x1200` (see the side finding). The map assumes UHD, which implies the reference setup has `resolutionOverride = 'UHD'`.

## What the endpoints offer

### Archive endpoint (`HPImageArchive.aspx`) [M]

- It is undocumented, with no published API contract or rate limits. Everything below is observed behaviour.
- Response: about 1.6 KB of JSON, **50 to 70 ms** (one outlier at 97 ms) across 12 markets.
- Headers: `cache-control: private`, **no `ETag`, no `Last-Modified`, no `Expires`**, so there are no conditional requests and no shared caching. It sets cookies.
- `n` is capped at 8 (`n=16` still returns 8). `idx` is capped at 7: `idx=7..16` all return the same window, 2026-10-10 to 2026-10-17. At most about 15 distinct days can be reached.
- **One market per request.** `mkt=en-US,de-DE` and repeating `mkt=` both returned only en-US. `cc=de` and `setmkt=de-DE` work as alternative market selectors, but still give one market each.
- Rate limiting: a burst of 30 in parallel (166 ms) and then 200 requests at 20 concurrent (1.2 s) all returned 200. No `Retry-After` or rate-limit headers.
- Entry fields: `startdate, fullstartdate, enddate, url, urlbase, copyright, copyrightlink, title, quiz, wp, hsh, drk, top, bot, hs`. **`hsh` differs per market for byte-identical images**, so it is not a content hash.
- `de-CH` returns `_ROW` (rest-of-world) images, on the same dates as en-US.

### Image sizes (`https://www.bing.com{urlbase}_{res}.jpg`) [M]

Measured on today's en-US image (`PortugueseLibrary_EN-US7519268149`), 5 GETs each, median. This connection pulls about 300 to 500 Mbit/s effective from the edge (`x-mapi-region: northeurope`).

| Variant | HTTP | Bytes | Pixels | Median total (first) |
|---|---|---|---|---|
| `_320x240` | 200 | 21,124 | 320×240 | 10 ms (135) |
| `_640x360` | 200 | 61,291 | 640×360 | 12 ms (24) |
| `_800x600` | 200 | 108,896 | 800×600 | 15 ms (26) |
| `_1024x768` | 200 | 73,509 | 1024×768 | 11 ms (126) |
| `_1280x720` | 200 | 216,702 | 1280×720 | 11 ms (161) |
| `_1366x768` | 200 | 172,637 | 1366×768 | 10 ms (45) |
| `_1920x1080` | 200 | 340,818 | 1920×1080 | 17 ms (14) |
| `_1080x1920` (portrait) | 200 | 337,042 | 1080×1920 | 14 ms (13) |
| `_1920x1200` | **404** | 1,192 placeholder | 80×80 | — |
| `_2560x1440`, `_3840x2160`, `_UHD.webp` | **404** | 1,192 placeholder | 80×80 | — |
| **`_UHD`** | 200 | **3,645,371** | 3840×2160 | **98 ms** (98) |
| `_UHD.jpg&w=3440&h=1440&c=7&rs=1` | 200 | 857,406 | 3440×1440 | 25 ms (**559**) |
| …same `&qlt=70` | 200 | 857,406 (identical) | 3440×1440 | `qlt` is ignored |
| `_UHD.jpg&w=960&h=540&c=7&rs=1` | 200 | 139,652 | 960×540 | 10 ms (415) |
| `_UHD.jpg&w=384&h=216&c=7&rs=1` | 200 | 26,771 | 384×216 | 14 ms (260) |

- `_1920x1200` availability varies by image: for the 8 current en-US images, it was **404 for 2026-10-24 and 2026-10-17**, and 200 (about 1.0 MB) for the other 6.
- The 8 current en-US UHD images are 3.54 to 3.75 MB each, **29.2 MB together**.
- All image responses have `cache-control: public, max-age=691200` (8 days) and **no `ETag`/`Last-Modified`**, so they cannot be revalidated: an image is either kept on disk or downloaded again. The `Accept: image/webp` header is ignored (it still returns JPEG). CORS is `*`.
- **Server-side resize (`&w=&h=&c=7&rs=1`) is slow on a cold cache.** Over 3 de-DE images × 4 sizes, the first request took **397 to 843 ms** and the second **10 to 66 ms**. Plain UHD on the same images took 62 to 76 ms. A resized variant is cold for practically every user on every new image [I], so here it is *slower* than UHD.

| Resize, de-DE images 10-21 to 10-23 | Bytes | First request | Second request |
|---|---|---|---|
| `w=3440` (aspect kept, 3440×1935) | 0.52 to 1.45 MB | 786 to 843 ms | 17 to 30 ms |
| `w=3440&h=1440&c=7` | 0.42 to 1.07 MB | 674 to 789 ms | 14 to 66 ms |
| `w=2560&h=1440&c=7` | 0.31 to 0.91 MB | 588 to 733 ms | 12 to 29 ms |
| `w=1920&h=1080&c=7` | 0.19 to 0.55 MB | 397 to 583 ms | 10 to 16 ms |
| plain `_UHD` | 3.30 to 3.69 MB | 62 to 76 ms | — |

### End to end: simulating today's switch [M]

Archive call, then 8 UHD downloads, each written to disk, using markets not touched before in the session:

| Market | Order | Archive | Newest on disk | All 8 | Per image |
|---|---|---|---|---|---|
| ja-JP | oldest first (today) | 73 ms | 814 ms | 814 ms | 62 to 128 ms |
| zh-CN | oldest first | 62 ms | 811 ms | 811 ms | 78 to 116 ms |
| it-IT | oldest first | 71 ms | 840 ms | 840 ms | 81 to 115 ms |
| es-ES | oldest first | 65 ms | 722 ms | 722 ms | 54 to 110 ms |
| en-IN | oldest first | 70 ms | 703 ms | 703 ms | 55 to 128 ms |
| fr-CA | oldest first | 60 ms | **1401 ms** | 1401 ms | 98 to **508** ms |
| ko-KR | oldest first | 60 ms | 578 ms | 578 ms | 58 to 82 ms |
| nl-NL | oldest first | 50 ms | 606 ms | 606 ms | 46 to 92 ms |
| ja-JP / zh-CN / it-IT again (warm) | oldest first | 52 to 63 ms | 574 to 600 ms | same | 48 to 106 ms |
| sv-SE | **newest first** | 68 ms | **144 ms** | 637 ms | 55 to 93 ms |
| pl-PL | **8 in parallel** | 68 ms | 365 ms | 446 ms | 295 to 378 ms each |
| tr-TR | oldest first, `1920x1080` | 72 ms | 202 ms | 202 ms | 13 to 21 ms |

Add to this the apply itself (from #23/#27: SPI reaches the screen in about 100 ms without the accent-colour effect) and `metadata.json`/prune I/O, which the simulation leaves out.

**Extrapolated to slower links** [I, size ÷ bandwidth, ignoring RTT]:

| Download | 25 Mbit/s | 50 Mbit/s | 100 Mbit/s |
|---|---|---|---|
| 8 × UHD (29.2 MB), today's switch | 9.3 s | 4.7 s | 2.3 s |
| 1 × UHD (3.65 MB), option A | 1.17 s | 0.58 s | 0.29 s |
| 3440×1440 resize (0.86 MB) + 0.4 to 0.85 s cold resize | 0.7 to 1.1 s | 0.5 to 1.0 s | 0.5 to 0.9 s |
| 1920×1080 (341 KB) | 0.11 s | 0.05 s | 0.03 s |
| 960×540 (140 KB) | 0.045 s | 0.02 s | 0.01 s |
| 384×216 (27 KB) | 0.01 s | <0.01 s | <0.01 s |

## Prefetching other markets

- **Requests:** one archive call per market (50 to 70 ms, about 1.6 KB). The app supports 4 markets (`en-US, en-GB, de-DE, de-CH`), so 3 extra calls. They can't be combined into one request. [M]
- **Rate limits:** none observed up to 200 requests in 1.2 s; none documented. [M]
- **Caching:** archive `private` with no validators, images `public, max-age=8d` with no validators. There is no cheap "has it changed?" check: the app has to re-fetch the archive JSON (cheap) and compare `urlbase` itself. [M]
- **Volume** [M sizes, I totals]:
  - Newest image only, for the 3 other markets: about 3 × 3.6 MB ≈ **11 MB/day**.
  - The full 8-image history for each of the 3: about 88 MB the first time. After that, only new pictures: **11 distinct pictures** made up the 32 entries across the 4 markets today, and the 4 newest were **3 distinct pictures** (PortugueseLibrary, BerlinLibrary, Tanager). With dedupe by picture, the steady state is about 1 to 3 new UHD images/day across all markets (≈ 4 to 11 MB/day).
- **Disk:** today `<date>.jpg` holds one market. Prefetch needs storage per market, or per picture (see D).
- **When:** archive JSON at each daily refresh, or when the settings pane opens. Images in the background at low priority, so they never compete with an apply. [I]

## Is an image already on disk a usable placeholder?

**Same date from the old market (what the question literally asks):** mostly no.

- With today's storage, `<date>.jpg` *is* the old market's image for that date. On a switch, the newest date's file is either the wallpaper **already showing** (the user was on the newest image), so applying it does nothing visible, or a **different picture** from the one the new market will show. [C/M]
- Same date and same picture across the 4 markets: **0 of 8** for 8 of the 12 market pairs, 6/8 for en-US ↔ de-CH, 7/8 for en-GB ↔ de-DE. The **newest** picture never matched on the same date. [M]
- en-GB/de-DE often show the en-US/ROW picture **one day later**. That is why the same pictures appear under different dates. [M]

**The same picture under any date (dedupe):** often yes, and it is the *real* image, not a placeholder.

- The same picture is **byte-identical across markets** (identical SHA-256 and size for PortugueseLibrary in en-US/en-GB/en-CA/fr-FR/pt-BR, and for YellowstoneWolves in en-US/en-GB/en-CA/pt-BR/de-CH (`_ROW`)), even though the `urlbase` suffix and `hsh` differ. [M]
- The picture key is the `urlbase` without the `_XX-YY1234567890` suffix (e.g. `OHR.PortugueseLibrary`). [M]
- The target market's 8 pictures already present in the old market's 8: 6 to 8 of 8 for every pair. The **newest** picture was present in **2 of 12** pairs (en-US ↔ en-GB, where en-GB lags a day). [M]
- Today's code can't use this: it doesn't store `urlbase`, and it overwrites by date. It would need metadata to keep the picture key and files to be stored by picture key. [C/I]

## The small-image-first option and latest-wins [I, from the #30/#31 decisions]

- Bing pre-renders small sizes that are warm on the CDN: 27 KB (384×216 via resize, though that one was cold at 260 ms), 61 KB (640×360), 341 KB (1920×1080). Each arrives in about 10 to 17 ms here, and in under 0.11 s even at 25 Mbit/s.
- Cost: two applies per switch. Each one pays the SPI path (about 100 ms to the screen, #23) and, with AutoColorization on, the accent-colour work that #23 identified as the main cause of freezes, plus the fade. That happens twice.
- With latest-wins (#30): the placeholder apply goes into the sidecar's slot. If the UHD arrives while the placeholder is **pending**, the placeholder is evicted (`superseded`) and never shows. If the placeholder is **in flight**, it completes and the UHD applies right after. The placeholder only shows when the UHD download takes longer than one apply (≈100 ms), which on this link it barely does (60 to 100 ms). `selectedDate` is written on `applied`, so the placeholder and the full image carry the same date.

## Method

Scratch TypeScript (ESM) scripts were run with Node 26 (native type stripping) from the session scratchpad. They are not committed:

- `probeArchive.ts`: archive headers, 12 markets, `idx`/`n` limits, a 30-request burst.
- `probeImages.ts`: every size suffix and resize parameter, 5 GETs each, JPEG SOF parsing for real pixel sizes, conditional/Accept checks, 8 × UHD sequential vs parallel, SHA-256 of the same picture across markets.
- `probeSwitch.ts`: `1920x1200` availability, multi-market parameters, a market-switch simulation (archive + 8 downloads + `writeFile`) in three orders, 200 archive requests at 20 concurrent.
- `probeOverlap.ts`: picture overlap between the app's 4 markets.
- `probeResize.ts`: cold vs warm server-side resize.

Limits: one machine, one fast connection, one afternoon. CDN warmth depends on region and time. Today's newest image for every market had already been requested by many users before these runs, so cold-cache tails like fr-CA's 508 ms may be more common on a less popular day/market. The slow-link numbers are calculated, not measured.

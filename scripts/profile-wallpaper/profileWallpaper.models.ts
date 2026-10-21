import type { Monitor } from './desktopWallpaperCom.models.js';

export type InputKind = 'full-jpg' | 'full-bmp' | 'prescaled-jpg' | 'prescaled-bmp';

// 'per-monitor': one SetWallpaper(monitorId, …) per monitor, as the app does today.
// 'all': a single SetWallpaper(NULL, …) for every monitor.
export type CallMode = 'per-monitor' | 'all';

export type Variant = { input: InputKind; mode: CallMode };

export type ImageFile = { path: string; bytes: number; width: number; height: number };

// One source wallpaper rendered into every input kind. Prescaled lists are indexed by monitor.
export type ImageSet = {
  source: string;
  fullJpg: ImageFile;
  fullBmp: ImageFile;
  prescaledJpg: ImageFile[];
  prescaledBmp: ImageFile[];
};

export type Stage = { name: string; ms: number };

export type Trial = {
  variant: string;
  round: number;
  source: string;
  stages: Stage[];
  // Wall time the calling (Electron main) thread was blocked inside the apply.
  blockMs: number;
  // From apply start; null when no sampled pixel changed.
  firstVisibleMs: number | null;
  settledMs: number | null;
  // False when the desktop was still changing at the timeout; settledMs is then a lower bound.
  settled: boolean;
  changedPoints: number;
  explorerCpuMs: number | null;
  dwmCpuMs: number | null;
  // Length of the CPU measurement window (arm → desktop settled).
  cpuWindowMs: number;
  maxExplorerPingMs: number;
  explorerPings: number;
  maxScreenSampleMs: number;
  maxScreenSampleGapMs: number;
  screenSamples: number;
  // Per screen sample: [ms from apply start, cells differing from baseline, cells differing from previous sample].
  timeline: [number, number, number][];
};

export type ProfileReport = {
  startedAt: string;
  os: string;
  electron: string;
  monitors: Monitor[];
  images: ImageSet[];
  settleMs: number;
  trials: Trial[];
};

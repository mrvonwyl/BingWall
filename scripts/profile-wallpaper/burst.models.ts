import type { ApplyOutcome } from '../../main/applier/applier.models.js';

// One request of a burst as the profiler saw it.
export type BurstRequest = {
  path: string;
  // From the start of the burst.
  sentAtMs: number;
  // Null when the child never answered before the profiler gave up waiting.
  outcome: ApplyOutcome | null;
  repliedAtMs: number | null;
};

export type BurstVerdict = {
  requests: number;
  applied: number;
  superseded: number;
  errors: number;
  unanswered: number;
  lastRequestedPath: string | null;
  // The wallpaper Windows reports after the burst (HKCU\Control Panel\Desktop\Wallpaper).
  landedPath: string | null;
  // The last request was applied and is the wallpaper that ended up set.
  lastImageWins: boolean;
};

// One simulated key-hold through the real applier child.
export type BurstTrial = {
  round: number;
  requests: BurstRequest[];
  verdict: BurstVerdict;
  // Worst time the profiler's main thread spent posting one request.
  maxPostMs: number;
  // From the start of the burst; null when no sampled pixel changed.
  firstVisibleMs: number | null;
  // When the desktop stopped changing, from the last request sent; null when nothing changed.
  settledAfterLastMs: number | null;
  settled: boolean;
  maxExplorerPingMs: number;
  explorerPings: number;
  maxScreenSampleGapMs: number;
  explorerCpuMs: number | null;
  accentChanged: boolean;
};

export type BurstSummary = {
  bursts: number;
  passed: number;
  worstExplorerHangMs: number | null;
  // Every burst ended on its last requested image.
  lastImageWins: boolean;
};

// Shared-memory protocol between the profiler (Electron main thread) and the probe
// workers. The main thread is blocked while it applies a wallpaper, so the probes
// can't rely on it answering messages; they poll an Int32Array instead.
export const CONTROL_SLOTS = 4;
// Main increments this to start a new measurement window; probes reset on change.
export const SLOT_ARM_SEQ = 0;
// Non-zero tells probes to exit.
export const SLOT_STOP = 1;
// Written by the Explorer pinger: worst SendMessageTimeout(WM_NULL) round-trip, in µs.
export const SLOT_MAX_PING_US = 2;
// Written by the Explorer pinger: number of pings in the current window.
export const SLOT_PING_COUNT = 3;

export type ScreenRegion = { x: number; y: number; width: number; height: number };

export type DesktopWatcherInit = {
  control: SharedArrayBuffer;
  // Virtual-screen area to watch, sampled into a gridWidth × gridHeight grid.
  region: ScreenRegion;
  gridWidth: number;
  gridHeight: number;
  settleMs: number;
  timeoutMs: number;
};

export type DesktopWatcherMessage =
  | { type: 'armed'; seq: number }
  | {
      type: 'result';
      seq: number;
      // Absolute process.hrtime clock, in ms; null when nothing changed before timeout.
      // lastChangeAtMs is the last change seen when the window hit the timeout without settling.
      firstChangeAtMs: number | null;
      lastChangeAtMs: number | null;
      // False when the window hit the timeout before the desktop stopped changing.
      settled: boolean;
      changedPoints: number;
      samples: number;
      maxSampleMs: number;
      maxSampleGapMs: number;
      // Per sample: [hrtime ms, cells differing from baseline, cells differing from previous sample].
      timeline: [number, number, number][];
    };

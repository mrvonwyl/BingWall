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

export type RefreshRun = {
  replaceExisting: boolean;
  // Aborted when a newer refresh replaces this one.
  signal: AbortSignal;
};

export type RefreshRunnerDeps<T> = {
  run: (options: RefreshRun) => Promise<T>;
};

// `aborted`: a newer refresh replaced this one, which reports its own result.
export type RefreshRunOutcome<T> = { status: 'done'; value: T } | { status: 'aborted' };

export type RefreshRunner<T> = {
  refresh: (replaceExisting: boolean) => Promise<RefreshRunOutcome<T>>;
};

// The refresh currently running (or waiting for its predecessor to settle).
export type InFlight = {
  controller: AbortController;
  replaceExisting: boolean;
  // Resolves once the run has settled either way, so no file write is under way any more.
  settled: Promise<void>;
};

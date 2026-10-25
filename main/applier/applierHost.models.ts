import type { ApplierRequest, ApplyOutcome } from './applier.models.js';

// The slice of Electron's UtilityProcess the host uses, so tests can supply a fake child.
export interface ApplierChildProcess {
  postMessage(message: ApplierRequest): void;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  kill(): boolean;
}

export type ApplierHostDeps = {
  forkApplier: () => ApplierChildProcess;
  logError: (message: string, details?: unknown) => void;
};

// One request the child hasn't answered yet.
export type Pending = {
  path: string;
  resolve: (outcome: ApplyOutcome) => void;
  // Set while the request is posted to a live child.
  watchdog?: ReturnType<typeof setTimeout>;
  // Already re-sent once after a death; a second death gives up on it.
  retried: boolean;
};

export type ApplierHost = {
  apply: (path: string) => Promise<ApplyOutcome>;
};

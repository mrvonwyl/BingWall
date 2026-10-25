import type { ApplierCapabilities, ApplyOutcome } from '../../main/applier/applier.models.js';

// Talks to the real applier child directly, without the app's host, so the profiler can
// also ask for capabilities (used to wait until the child and koffi have loaded).
export type ApplierClient = {
  apply: (path: string) => Promise<ApplyOutcome>;
  capabilities: () => Promise<ApplierCapabilities>;
  close: () => void;
};

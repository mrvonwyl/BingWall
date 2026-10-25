import type { ApplierBackend, ApplierReply } from './applier.models.js';

export type ApplierCoreDeps = {
  backend: ApplierBackend;
  postMessage: (reply: ApplierReply) => void;
  // Reports a reply that could not be posted. Defaults to console.error.
  logError?: (message: string, error: unknown) => void;
};

export type ApplierCore = {
  handleMessage: (message: unknown) => void;
};

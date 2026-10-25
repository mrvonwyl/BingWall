import type { ApplierBackend, ApplierReply } from './applier.models.js';

export type ApplierCoreDeps = {
  backend: ApplierBackend;
  postMessage: (reply: ApplierReply) => void;
};

export type ApplierCore = {
  handleMessage: (message: unknown) => void;
};

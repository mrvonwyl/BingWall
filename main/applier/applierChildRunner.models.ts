import type { ApplierBackend, ApplierReply } from './applier.models.js';

// The slice of Electron's `process.parentPort` the child uses.
export interface ApplierParentPort {
  on(event: 'message', listener: (messageEvent: { data: unknown }) => void): unknown;
  postMessage(message: ApplierReply): void;
}

export type ApplierChildDeps = {
  parentPort: ApplierParentPort;
  platform: NodeJS.Platform;
  loadWin32Backend: () => Promise<ApplierBackend>;
};

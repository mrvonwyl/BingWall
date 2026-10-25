import { createApplierCore } from './applierCore.js';
import type { ApplierBackend } from './applier.models.js';
import type { ApplierChildDeps } from './applierChildRunner.models.js';

async function loadBackend(deps: ApplierChildDeps): Promise<ApplierBackend> {
  switch (deps.platform) {
    case 'win32':
      return deps.loadWin32Backend();
    default:
      throw new Error(`BingWall applier: no wallpaper backend for platform ${deps.platform}`);
  }
}

// Wires the child's parentPort to the core. The backend is loaded before listening, so a
// backend that can't load (e.g. koffi quarantined) fails the child before any reply.
export async function runApplierChild(deps: ApplierChildDeps): Promise<void> {
  const backend = await loadBackend(deps);
  const core = createApplierCore({ backend, postMessage: (reply) => deps.parentPort.postMessage(reply) });
  deps.parentPort.on('message', (messageEvent) => core.handleMessage(messageEvent.data));
}

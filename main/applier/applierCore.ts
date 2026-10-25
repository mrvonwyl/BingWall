import type { ApplierRequest, ApplyRequest, BackendApplyResult } from './applier.models.js';
import type { ApplierCore, ApplierCoreDeps } from './applierCore.models.js';

// Platform-agnostic latest-wins slot: at most one apply in flight and one pending.
// A newer request evicts the pending one (answered `superseded` right away); the
// in-flight apply is never cancelled.
export function createApplierCore(deps: ApplierCoreDeps): ApplierCore {
  let inFlight = false;
  let pending: ApplyRequest | null = null;

  async function applyWithBackend(path: string): Promise<BackendApplyResult> {
    try {
      return await deps.backend.apply(path);
    } catch (error) {
      return { kind: 'error', error: 'backend-failed', message: error instanceof Error ? error.message : String(error) };
    }
  }

  async function run(request: ApplyRequest): Promise<void> {
    inFlight = true;
    const result = await applyWithBackend(request.path);
    deps.postMessage({ id: request.id, ...result });
    inFlight = false;

    const next = pending;
    pending = null;
    if (next) {
      void run(next);
    }
  }

  function enqueue(request: ApplyRequest): void {
    if (!inFlight) {
      void run(request);
      return;
    }
    if (pending) {
      deps.postMessage({ id: pending.id, kind: 'superseded' });
    }
    pending = request;
  }

  return {
    handleMessage(message) {
      const request = parseRequest(message);
      if (request === null) {
        // No usable id, so there is nobody to reply to.
        return;
      }
      if (request === 'malformed') {
        deps.postMessage({ id: (message as { id: number }).id, kind: 'error', error: 'malformed-request' });
        return;
      }
      if (request.op === 'capabilities') {
        deps.postMessage({ id: request.id, kind: 'capabilities', capabilities: deps.backend.capabilities() });
        return;
      }
      enqueue(request);
    },
  };
}

function parseRequest(message: unknown): ApplierRequest | 'malformed' | null {
  if (typeof message !== 'object' || message === null) {
    return null;
  }
  const candidate = message as Record<string, unknown>;
  if (typeof candidate.id !== 'number') {
    return null;
  }
  if (candidate.op === 'capabilities') {
    return { id: candidate.id, op: 'capabilities' };
  }
  if (candidate.op === 'apply' && typeof candidate.path === 'string' && candidate.path !== '') {
    return { id: candidate.id, op: 'apply', path: candidate.path };
  }
  return 'malformed';
}

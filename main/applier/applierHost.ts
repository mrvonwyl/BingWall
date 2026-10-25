import type { ApplierError, ApplyOutcome } from './applier.models.js';
import type { ApplierChildProcess, ApplierHost, ApplierHostDeps } from './applierHost.models.js';

// Main-process side of the applier: a pure pass-through. Each apply is posted to the
// child at once with a fresh id; latest-wins coalescing lives only in the child's core.
export function createApplierHost(deps: ApplierHostDeps): ApplierHost {
  let child: ApplierChildProcess | null = null;
  let nextId = 1;
  const unanswered = new Map<number, (outcome: ApplyOutcome) => void>();

  function handleReply(message: unknown): void {
    const outcome = parseOutcome(message);
    if (!outcome) {
      deps.logError('BingWall: ignoring malformed applier reply', message);
      return;
    }
    const resolve = unanswered.get(outcome.id);
    if (!resolve) {
      return;
    }
    unanswered.delete(outcome.id);
    const { id: _id, ...result } = outcome;
    if (result.kind === 'error') {
      deps.logError(`BingWall: wallpaper apply failed (${result.error})`, result);
    }
    resolve(result);
  }

  // A dead child can't answer, so nothing it was asked will ever resolve on its own.
  // The next apply forks a fresh child.
  function handleExit(exited: ApplierChildProcess, code: number): void {
    if (child !== exited) {
      return;
    }
    child = null;
    deps.logError(`BingWall: applier child exited with code ${code}`);
    const message = `The wallpaper applier exited with code ${code}`;
    for (const resolve of unanswered.values()) {
      resolve({ kind: 'error', error: 'applier-unavailable', code, message });
    }
    unanswered.clear();
  }

  function ensureChild(): ApplierChildProcess {
    if (!child) {
      const forked = deps.forkApplier();
      forked.on('message', handleReply);
      forked.on('exit', (code) => handleExit(forked, code));
      child = forked;
    }
    return child;
  }

  return {
    apply(path) {
      const id = nextId++;
      const result = new Promise<ApplyOutcome>((resolve) => unanswered.set(id, resolve));
      ensureChild().postMessage({ id, op: 'apply', path });
      return result;
    },
  };
}

export class ApplyFailedError extends Error {
  constructor(readonly outcome: ApplierError) {
    super(outcome.message ?? (outcome.code === undefined ? outcome.error : `${outcome.error} (code ${outcome.code})`));
    this.name = 'ApplyFailedError';
  }
}

function parseOutcome(message: unknown): ({ id: number } & ApplyOutcome) | null {
  if (typeof message !== 'object' || message === null) {
    return null;
  }
  const reply = message as Record<string, unknown>;
  if (typeof reply.id !== 'number') {
    return null;
  }
  if (reply.kind === 'applied' || reply.kind === 'superseded' || reply.kind === 'error') {
    return reply as { id: number } & ApplyOutcome;
  }
  return null;
}

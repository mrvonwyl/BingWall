import type { ApplierError, ApplyOutcome } from './applier.models.js';
import type { ApplierChildProcess, ApplierHost, ApplierHostDeps, Pending } from './applierHost.models.js';

// How long one request may stay unanswered before the child counts as hung and is killed.
const WATCHDOG_MS = 10_000;
// At most MAX_DEATHS child deaths (crash, failed start, watchdog kill) per rolling window;
// beyond that the host stops forking and answers applier-unavailable until the window passes.
const MAX_DEATHS = 3;
const DEATH_WINDOW_MS = 60_000;

// Main-process side of the applier: a pure pass-through. Each apply is posted to the
// child at once with a fresh id; latest-wins coalescing lives only in the child's core.
// The host owns recovery: a watchdog per request, a lazy respawn after a death, one
// silent retry of the newest unanswered request, and a cap on deaths so it never thrashes.
export function createApplierHost(deps: ApplierHostDeps): ApplierHost {
  let child: ApplierChildProcess | null = null;
  let nextId = 1;
  const unanswered = new Map<number, Pending>();
  const deaths: number[] = [];

  function settle(id: number, outcome: ApplyOutcome): void {
    const pending = unanswered.get(id);
    if (!pending) {
      return;
    }
    unanswered.delete(id);
    clearTimeout(pending.watchdog);
    if (outcome.kind === 'error') {
      deps.logError(`BingWall: wallpaper apply failed (${outcome.error})`, outcome);
    }
    pending.resolve(outcome);
  }

  function handleReply(message: unknown): void {
    const outcome = parseOutcome(message);
    if (!outcome) {
      deps.logError('BingWall: ignoring malformed applier reply', message);
      return;
    }
    const { id, ...result } = outcome;
    settle(id, result);
  }

  function isCapped(): boolean {
    const windowStart = Date.now() - DEATH_WINDOW_MS;
    while (deaths.length > 0 && deaths[0] <= windowStart) {
      deaths.shift();
    }
    return deaths.length >= MAX_DEATHS;
  }

  // The current child is gone (crashed, failed to start, or killed by the watchdog). Nothing
  // it was asked will be answered, so the newest unanswered request is re-sent once to a
  // fresh child and every older one is superseded by it.
  function handleDeath(reason: string, code?: number): void {
    child = null;
    deaths.push(Date.now());
    deps.logError(`BingWall: applier child died (${reason})`);

    const ids = [...unanswered.keys()].sort((a, b) => a - b);
    const newest = ids.pop();
    for (const id of ids) {
      settle(id, { kind: 'superseded' });
    }
    if (newest === undefined) {
      return;
    }
    const pending = unanswered.get(newest)!;
    clearTimeout(pending.watchdog);
    if (pending.retried) {
      settle(newest, { kind: 'error', error: 'applier-unavailable', code, message: `The wallpaper applier died twice (${reason})` });
      return;
    }
    pending.retried = true;
    post(newest);
  }

  function handleTimeout(id: number): void {
    const hung = child;
    settle(id, { kind: 'error', error: 'timeout', message: `The wallpaper applier did not answer within ${WATCHDOG_MS / 1000} s` });
    hung?.kill();
    handleDeath('killed by the watchdog');
  }

  function handleExit(exited: ApplierChildProcess, code: number): void {
    if (child === exited) {
      handleDeath(`exited with code ${code}`, code);
    }
  }

  // Forks lazily: on the first request, and on the first request after a death.
  function ensureChild(): ApplierChildProcess {
    if (!child) {
      const forked = deps.forkApplier();
      forked.on('message', (message) => {
        if (child === forked) {
          handleReply(message);
        }
      });
      forked.on('exit', (code) => handleExit(forked, code));
      child = forked;
    }
    return child;
  }

  function post(id: number): void {
    const pending = unanswered.get(id)!;
    if (!child && isCapped()) {
      settle(id, { kind: 'error', error: 'applier-unavailable', message: 'The wallpaper applier keeps failing; not restarting it for now' });
      return;
    }
    let target: ApplierChildProcess;
    try {
      target = ensureChild();
    } catch (error) {
      handleDeath(`failed to start: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    pending.watchdog = setTimeout(() => handleTimeout(id), WATCHDOG_MS);
    target.postMessage({ id, op: 'apply', path: pending.path });
  }

  return {
    apply(path) {
      const id = nextId++;
      const result = new Promise<ApplyOutcome>((resolve) => unanswered.set(id, { path, resolve, retried: false }));
      post(id);
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

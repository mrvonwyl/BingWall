import type { ApplierReply, ApplierRequest, ApplyOutcome } from '../../main/applier/applier.models.js';
import type { ApplierChildProcess } from '../../main/applier/applierHost.models.js';
import type { ApplierClient } from './applierClient.models.js';

type Waiter = { resolve: (reply: ApplierReply) => void; reject: (error: Error) => void };

// Pairs requests to the real applier child with their replies by id. Unlike the app's
// host it never retries or respawns: a dead child just fails what was waiting.
export function createApplierClient(child: ApplierChildProcess): ApplierClient {
  let nextId = 1;
  const waiting = new Map<number, Waiter>();

  child.on('message', (message) => {
    const reply = message as ApplierReply;
    const waiter = waiting.get(reply.id);
    if (waiter) {
      waiting.delete(reply.id);
      waiter.resolve(reply);
    }
  });

  child.on('exit', (code) => {
    const error = new ApplierExitedError(code);
    for (const waiter of waiting.values()) {
      waiter.reject(error);
    }
    waiting.clear();
  });

  function request(message: ApplierRequest): Promise<ApplierReply> {
    const reply = new Promise<ApplierReply>((resolve, reject) => waiting.set(message.id, { resolve, reject }));
    child.postMessage(message);
    return reply;
  }

  return {
    async apply(path) {
      try {
        const { id: _id, ...outcome } = await request({ id: nextId++, op: 'apply', path });
        return outcome as ApplyOutcome;
      } catch (error) {
        if (!(error instanceof ApplierExitedError)) {
          throw error;
        }
        return { kind: 'error', error: 'applier-unavailable', code: error.code, message: error.message };
      }
    },
    async capabilities() {
      const reply = await request({ id: nextId++, op: 'capabilities' });
      if (reply.kind !== 'capabilities') {
        throw new Error(`The applier child answered capabilities with ${reply.kind}`);
      }
      return reply.capabilities;
    },
    close() {
      child.kill();
    },
  };
}

class ApplierExitedError extends Error {
  constructor(readonly code: number) {
    super(`The applier child exited with code ${code}`);
    this.name = 'ApplierExitedError';
  }
}

import { describe, expect, it } from 'vitest';
import { createApplierCore } from './applierCore.js';
import type { ApplierBackend, ApplierCapabilities, ApplierReply, BackendApplyResult } from './applier.models.js';

const CAPABILITIES: ApplierCapabilities = {
  backend: 'fake',
  perMonitor: false,
  coversAllWorkspaces: false,
  persistsWithoutApp: true,
};

type Deferred = { path: string; resolve: (result: BackendApplyResult) => void };

// Records each apply and keeps it blocked until the test settles it.
function fakeBackend() {
  const calls: Deferred[] = [];
  const backend: ApplierBackend = {
    apply: (path) => new Promise<BackendApplyResult>((resolve) => calls.push({ path, resolve })),
    capabilities: () => CAPABILITIES,
  };
  return { backend, calls };
}

function setup() {
  const { backend, calls } = fakeBackend();
  const replies: ApplierReply[] = [];
  const core = createApplierCore({ backend, postMessage: (reply) => replies.push(reply) });
  return { core, calls, replies };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('applierCore', () => {
  it('applies a requested path and replies applied with the request id', async () => {
    const { core, calls, replies } = setup();

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg']);

    calls[0].resolve({ kind: 'applied' });
    await flush();

    expect(replies).toEqual([{ id: 1, kind: 'applied' }]);
  });

  it('lets the in-flight apply complete before starting the pending one', async () => {
    const { core, calls, replies } = setup();

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    core.handleMessage({ id: 2, op: 'apply', path: 'C:\\b.jpg' });
    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg']);

    calls[0].resolve({ kind: 'applied' });
    await flush();
    expect(replies).toEqual([{ id: 1, kind: 'applied' }]);
    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg', 'C:\\b.jpg']);

    calls[1].resolve({ kind: 'applied' });
    await flush();
    expect(replies).toEqual([
      { id: 1, kind: 'applied' },
      { id: 2, kind: 'applied' },
    ]);
  });

  it('frees the slot and runs the pending request when posting a reply throws', async () => {
    const { backend, calls } = fakeBackend();
    const replies: ApplierReply[] = [];
    const errors: unknown[] = [];
    const core = createApplierCore({
      backend,
      postMessage: (reply) => {
        if (reply.id === 1) {
          throw new Error('channel closed');
        }
        replies.push(reply);
      },
      logError: (_message, error) => errors.push(error),
    });

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    core.handleMessage({ id: 2, op: 'apply', path: 'C:\\b.jpg' });
    calls[0].resolve({ kind: 'applied' });
    await flush();

    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg', 'C:\\b.jpg']);
    calls[1].resolve({ kind: 'applied' });
    await flush();
    expect(replies).toEqual([{ id: 2, kind: 'applied' }]);
    expect(errors).toEqual([new Error('channel closed')]);

    core.handleMessage({ id: 3, op: 'apply', path: 'C:\\c.jpg' });
    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg', 'C:\\b.jpg', 'C:\\c.jpg']);
  });

  it('evicts the pending request with superseded as soon as a newer one arrives', async () => {
    const { core, calls, replies } = setup();

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    core.handleMessage({ id: 2, op: 'apply', path: 'C:\\b.jpg' });
    core.handleMessage({ id: 3, op: 'apply', path: 'C:\\c.jpg' });

    // Eviction is answered immediately, while id 1 is still running.
    expect(replies).toEqual([{ id: 2, kind: 'superseded' }]);

    calls[0].resolve({ kind: 'applied' });
    await flush();
    calls[1].resolve({ kind: 'applied' });
    await flush();

    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg', 'C:\\c.jpg']);
    expect(replies).toEqual([
      { id: 2, kind: 'superseded' },
      { id: 1, kind: 'applied' },
      { id: 3, kind: 'applied' },
    ]);
  });

  it('does not dedupe requests for the same path', async () => {
    const { core, calls } = setup();

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    core.handleMessage({ id: 2, op: 'apply', path: 'C:\\a.jpg' });
    calls[0].resolve({ kind: 'applied' });
    await flush();

    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg', 'C:\\a.jpg']);
  });

  it('answers capabilities immediately, even while an apply is in flight', () => {
    const { core, replies } = setup();

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    core.handleMessage({ id: 2, op: 'capabilities' });

    expect(replies).toEqual([{ id: 2, kind: 'capabilities', capabilities: CAPABILITIES }]);
  });

  it('forwards a backend error and then starts the pending request', async () => {
    const { core, calls, replies } = setup();

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    core.handleMessage({ id: 2, op: 'apply', path: 'C:\\b.jpg' });
    calls[0].resolve({ kind: 'error', error: 'os-rejected', code: 5 });
    await flush();

    expect(replies).toEqual([{ id: 1, kind: 'error', error: 'os-rejected', code: 5 }]);
    expect(calls.map((call) => call.path)).toEqual(['C:\\a.jpg', 'C:\\b.jpg']);
  });

  it('replies backend-failed when the backend throws, and keeps serving', async () => {
    const replies: ApplierReply[] = [];
    let fail = true;
    const backend: ApplierBackend = {
      apply: async () => {
        if (fail) {
          fail = false;
          throw new Error('boom');
        }
        return { kind: 'applied' };
      },
      capabilities: () => CAPABILITIES,
    };
    const core = createApplierCore({ backend, postMessage: (reply) => replies.push(reply) });

    core.handleMessage({ id: 1, op: 'apply', path: 'C:\\a.jpg' });
    await flush();
    core.handleMessage({ id: 2, op: 'apply', path: 'C:\\b.jpg' });
    await flush();

    expect(replies).toEqual([
      { id: 1, kind: 'error', error: 'backend-failed', message: 'boom' },
      { id: 2, kind: 'applied' },
    ]);
  });

  it('replies malformed-request to a message with an id but an unknown or incomplete shape', () => {
    const { core, calls, replies } = setup();

    core.handleMessage({ id: 1, op: 'explode' });
    core.handleMessage({ id: 2, op: 'apply' });
    core.handleMessage({ id: 3, op: 'apply', path: '' });

    expect(calls).toEqual([]);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 3]);
    for (const reply of replies) {
      expect(reply).toMatchObject({ kind: 'error', error: 'malformed-request' });
    }
  });

  it('ignores messages it cannot even attribute to a request id', () => {
    const { core, calls, replies } = setup();

    for (const message of [null, undefined, 'apply', 42, {}, { op: 'apply', path: 'C:\\a.jpg' }, { id: '1', op: 'capabilities' }]) {
      core.handleMessage(message);
    }

    expect(calls).toEqual([]);
    expect(replies).toEqual([]);
  });
});

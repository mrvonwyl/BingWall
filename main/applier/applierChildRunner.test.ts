import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { runApplierChild } from './applierChildRunner.js';
import type { ApplierBackend, ApplierReply } from './applier.models.js';

class FakeParentPort extends EventEmitter {
  readonly posted: ApplierReply[] = [];

  postMessage(message: ApplierReply): void {
    this.posted.push(message);
  }

  send(data: unknown): void {
    this.emit('message', { data });
  }
}

const backend: ApplierBackend = {
  apply: async () => ({ kind: 'applied' }),
  capabilities: () => ({ backend: 'fake', perMonitor: false, coversAllWorkspaces: false, persistsWithoutApp: true }),
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('runApplierChild', () => {
  it('feeds parentPort message data to the core and posts its replies back', async () => {
    const port = new FakeParentPort();
    const loadWin32Backend = vi.fn(async () => backend);

    await runApplierChild({ parentPort: port, platform: 'win32', loadWin32Backend });
    port.send({ id: 7, op: 'apply', path: 'C:\\a.jpg' });
    await flush();

    expect(loadWin32Backend).toHaveBeenCalledTimes(1);
    expect(port.posted).toEqual([{ id: 7, kind: 'applied' }]);
  });

  it('refuses to start on a platform without a backend', async () => {
    const port = new FakeParentPort();

    await expect(
      runApplierChild({ parentPort: port, platform: 'linux', loadWin32Backend: async () => backend }),
    ).rejects.toThrow(/linux/);
  });
});

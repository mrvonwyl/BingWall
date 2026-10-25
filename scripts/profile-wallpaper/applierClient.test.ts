import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { ApplierReply, ApplierRequest } from '../../main/applier/applier.models.js';
import { createApplierClient } from './applierClient.js';

class FakeChild extends EventEmitter {
  readonly posted: ApplierRequest[] = [];
  killed = false;

  postMessage(message: ApplierRequest): void {
    this.posted.push(message);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }

  reply(reply: ApplierReply): void {
    this.emit('message', reply);
  }
}

describe('applierClient', () => {
  it('posts each apply with a fresh id and resolves it with the reply for that id', async () => {
    const child = new FakeChild();
    const client = createApplierClient(child);

    const first = client.apply('C:\\a.jpg');
    const second = client.apply('C:\\b.jpg');
    const [a, b] = child.posted;
    child.reply({ id: b.id, kind: 'applied' });
    child.reply({ id: a.id, kind: 'superseded' });

    expect(a).toEqual({ id: a.id, op: 'apply', path: 'C:\\a.jpg' });
    expect(b.id).not.toBe(a.id);
    await expect(first).resolves.toEqual({ kind: 'superseded' });
    await expect(second).resolves.toEqual({ kind: 'applied' });
  });

  it('asks the child for its capabilities', async () => {
    const child = new FakeChild();
    const client = createApplierClient(child);
    const capabilities = { backend: 'win32', perMonitor: false, coversAllWorkspaces: false, persistsWithoutApp: true };

    const result = client.capabilities();
    const [request] = child.posted;
    child.reply({ id: request.id, kind: 'capabilities', capabilities });

    expect(request).toEqual({ id: request.id, op: 'capabilities' });
    await expect(result).resolves.toEqual(capabilities);
  });

  it('fails every waiting request when the child exits', async () => {
    const child = new FakeChild();
    const client = createApplierClient(child);

    const apply = client.apply('C:\\a.jpg');
    const capabilities = client.capabilities();
    child.emit('exit', 3);

    await expect(apply).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable', code: 3 });
    await expect(capabilities).rejects.toThrow('exited with code 3');
  });
});

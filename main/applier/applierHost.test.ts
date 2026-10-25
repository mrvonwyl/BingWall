import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createApplierHost } from './applierHost.js';
import type { ApplierReply, ApplierRequest } from './applier.models.js';

// A scriptable stand-in for the utilityProcess child.
class FakeChild extends EventEmitter {
  readonly posted: ApplierRequest[] = [];
  readonly kill = vi.fn(() => true);

  postMessage(message: ApplierRequest): void {
    this.posted.push(message);
  }

  reply(reply: ApplierReply): void {
    this.emit('message', reply);
  }

  exit(code: number): void {
    this.emit('exit', code);
  }
}

function setup() {
  const children: FakeChild[] = [];
  const forkApplier = vi.fn(() => {
    const child = new FakeChild();
    children.push(child);
    return child;
  });
  const host = createApplierHost({ forkApplier, logError: () => undefined });
  return { host, forkApplier, children };
}

describe('applierHost', () => {
  it('does not fork the child until the first apply, then reuses it', () => {
    const { host, forkApplier } = setup();
    expect(forkApplier).not.toHaveBeenCalled();

    void host.apply('C:\\a.jpg');
    void host.apply('C:\\b.jpg');

    expect(forkApplier).toHaveBeenCalledTimes(1);
  });

  it('forwards every request immediately with a fresh id and resolves each on its own reply', async () => {
    const { host, children } = setup();

    const first = host.apply('C:\\a.jpg');
    const second = host.apply('C:\\a.jpg');
    const [child] = children;

    expect(child.posted).toHaveLength(2);
    const [firstRequest, secondRequest] = child.posted;
    expect(firstRequest).toMatchObject({ op: 'apply', path: 'C:\\a.jpg' });
    expect(secondRequest).toMatchObject({ op: 'apply', path: 'C:\\a.jpg' });
    expect(firstRequest.id).not.toBe(secondRequest.id);

    child.reply({ id: secondRequest.id, kind: 'applied' });
    child.reply({ id: firstRequest.id, kind: 'superseded' });

    await expect(first).resolves.toEqual({ kind: 'superseded' });
    await expect(second).resolves.toEqual({ kind: 'applied' });
  });

  it('passes an error reply through as the outcome', async () => {
    const { host, children } = setup();

    const result = host.apply('C:\\a.jpg');
    const [child] = children;
    child.reply({ id: child.posted[0].id, kind: 'error', error: 'os-rejected', code: 1813 });

    await expect(result).resolves.toEqual({ kind: 'error', error: 'os-rejected', code: 1813 });
  });

  it('ignores replies with unknown ids and malformed replies', async () => {
    const { host, children } = setup();

    const result = host.apply('C:\\a.jpg');
    const [child] = children;
    child.emit('message', { id: 9999, kind: 'applied' });
    child.emit('message', null);
    child.emit('message', 'applied');
    child.reply({ id: child.posted[0].id, kind: 'applied' });

    await expect(result).resolves.toEqual({ kind: 'applied' });
  });

  it('resolves unanswered requests with applier-unavailable when the child exits, and forks again on the next apply', async () => {
    const { host, forkApplier, children } = setup();

    const result = host.apply('C:\\a.jpg');
    children[0].exit(1);

    await expect(result).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });

    const next = host.apply('C:\\b.jpg');
    expect(forkApplier).toHaveBeenCalledTimes(2);
    const replacement = children[1];
    expect(replacement.posted).toEqual([expect.objectContaining({ op: 'apply', path: 'C:\\b.jpg' })]);
    replacement.reply({ id: replacement.posted[0].id, kind: 'applied' });

    await expect(next).resolves.toEqual({ kind: 'applied' });
  });
});

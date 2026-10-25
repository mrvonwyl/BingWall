import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const logError = vi.fn();
  const host = createApplierHost({ forkApplier, logError });
  return { host, forkApplier, children, logError };
}

describe('applierHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('kills a child that stays silent for 10 s and resolves the request with timeout', async () => {
    const { host, children, logError } = setup();

    const result = host.apply('C:\\a.jpg');
    const [child] = children;

    vi.advanceTimersByTime(9_999);
    expect(child.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toMatchObject({ kind: 'error', error: 'timeout' });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('timeout'), expect.anything());
  });

  it('treats a watchdog kill as a death: the newest other unanswered request is retried, older ones superseded', async () => {
    const { host, children } = setup();

    const hung = host.apply('C:\\a.jpg');
    vi.advanceTimersByTime(5_000);
    const older = host.apply('C:\\b.jpg');
    const newest = host.apply('C:\\c.jpg');
    vi.advanceTimersByTime(5_000);

    await expect(hung).resolves.toMatchObject({ kind: 'error', error: 'timeout' });
    await expect(older).resolves.toEqual({ kind: 'superseded' });
    const replacement = children[1];
    expect(replacement.posted).toEqual([expect.objectContaining({ path: 'C:\\c.jpg' })]);
    replacement.reply({ id: replacement.posted[0].id, kind: 'applied' });
    await expect(newest).resolves.toEqual({ kind: 'applied' });
  });

  it('counts watchdog kills toward the cap', async () => {
    const { host, forkApplier } = setup();

    for (let i = 0; i < 3; i++) {
      const result = host.apply(`C:\\${i}.jpg`);
      vi.advanceTimersByTime(10_000);
      await expect(result).resolves.toMatchObject({ error: 'timeout' });
    }

    await expect(host.apply('C:\\capped.jpg')).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);
  });

  it('forks a fresh child lazily on the next apply after a watchdog kill', async () => {
    const { host, forkApplier, children } = setup();

    const timedOut = host.apply('C:\\a.jpg');
    vi.advanceTimersByTime(10_000);
    await timedOut;
    expect(forkApplier).toHaveBeenCalledTimes(1);

    const next = host.apply('C:\\b.jpg');
    expect(forkApplier).toHaveBeenCalledTimes(2);
    // The killed child's exit arrives late and must not touch the new child's requests.
    children[0].exit(1);
    const replacement = children[1];
    replacement.reply({ id: replacement.posted[0].id, kind: 'applied' });

    await expect(next).resolves.toEqual({ kind: 'applied' });
  });

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

  it('when the child dies, re-sends only the newest unanswered request to a fresh child and supersedes the older ones', async () => {
    const { host, forkApplier, children } = setup();

    const first = host.apply('C:\\a.jpg');
    const second = host.apply('C:\\b.jpg');
    const newest = host.apply('C:\\c.jpg');
    children[0].exit(1);

    await expect(first).resolves.toEqual({ kind: 'superseded' });
    await expect(second).resolves.toEqual({ kind: 'superseded' });
    expect(forkApplier).toHaveBeenCalledTimes(2);
    const replacement = children[1];
    expect(replacement.posted).toEqual([expect.objectContaining({ op: 'apply', path: 'C:\\c.jpg' })]);

    replacement.reply({ id: replacement.posted[0].id, kind: 'applied' });
    await expect(newest).resolves.toEqual({ kind: 'applied' });
  });

  it('stops forking after 3 deaths within 60 s and works again once the window has passed', async () => {
    const { host, forkApplier, children } = setup();

    // Three deaths that leave nothing to retry: each child dies after answering.
    for (let i = 0; i < 3; i++) {
      const applied = host.apply(`C:\\${i}.jpg`);
      const current = children[children.length - 1];
      current.reply({ id: current.posted[0].id, kind: 'applied' });
      await applied;
      current.exit(1);
      vi.advanceTimersByTime(10_000);
    }
    expect(forkApplier).toHaveBeenCalledTimes(3);

    await expect(host.apply('C:\\capped.jpg')).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);

    // Deaths were at 0 s, 10 s and 20 s; at 60 s the first leaves the window and the cap lifts.
    vi.advanceTimersByTime(30_000);
    const recovered = host.apply('C:\\recovered.jpg');
    expect(forkApplier).toHaveBeenCalledTimes(4);
    const fresh = children[3];
    fresh.reply({ id: fresh.posted[0].id, kind: 'applied' });
    await expect(recovered).resolves.toEqual({ kind: 'applied' });
  });

  it('counts the silent retry toward the cap', async () => {
    const { host, forkApplier, children } = setup();

    // Death 1 (original) and death 2 (its retry).
    const first = host.apply('C:\\a.jpg');
    children[0].exit(1);
    children[1].exit(1);
    await expect(first).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });

    // Death 3: with the retry counted, the cap is reached, so there's no further retry.
    const second = host.apply('C:\\b.jpg');
    children[2].exit(1);
    await expect(second).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);

    await expect(host.apply('C:\\c.jpg')).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);
  });

  it('counts a child that cannot start (exits before its first reply) as a death', async () => {
    // e.g. koffi's native library was quarantined: every child exits right after it is forked.
    const forkApplier = vi.fn(() => {
      const child = new FakeChild();
      setTimeout(() => child.exit(1), 0);
      return child;
    });
    const host = createApplierHost({ forkApplier, logError: () => undefined });

    const first = host.apply('C:\\a.jpg');
    await vi.runAllTimersAsync();
    await expect(first).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(2);

    const second = host.apply('C:\\b.jpg');
    await vi.runAllTimersAsync();
    await expect(second).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);

    // Three failed starts: capped, so no fork is tried.
    await expect(host.apply('C:\\c.jpg')).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);
  });

  it('counts a fork that throws as a death and never rejects the apply', async () => {
    const forkApplier = vi.fn((): FakeChild => {
      throw new Error('spawn failed');
    });
    const host = createApplierHost({ forkApplier, logError: () => undefined });

    // Original plus its one retry: two failed starts.
    await expect(host.apply('C:\\a.jpg')).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(2);

    // Third failed start reaches the cap; after that no fork is even tried.
    await expect(host.apply('C:\\b.jpg')).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);
    await expect(host.apply('C:\\c.jpg')).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(forkApplier).toHaveBeenCalledTimes(3);
  });

  it('resolves applier-unavailable when the retried request dies again', async () => {
    const { host, children } = setup();

    const result = host.apply('C:\\a.jpg');
    children[0].exit(1);
    children[1].exit(1);

    await expect(result).resolves.toMatchObject({ kind: 'error', error: 'applier-unavailable' });
    expect(children).toHaveLength(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { checkForUpdates } from './autoUpdate.js';

describe('checkForUpdates', () => {
  it('calls checkForUpdatesAndNotify on the updater', async () => {
    const updater = { checkForUpdatesAndNotify: vi.fn().mockResolvedValue(undefined) };

    await checkForUpdates(updater);

    expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledOnce();
  });

  it('does not throw when the updater fails (e.g. offline or no release)', async () => {
    const updater = { checkForUpdatesAndNotify: vi.fn().mockRejectedValue(new Error('network error')) };

    await expect(checkForUpdates(updater)).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { burstOffsets, evaluateBurst, summariseBursts } from './burst.js';
import type { BurstRequest, BurstTrial } from './burst.models.js';

function request(path: string, outcome: BurstRequest['outcome']): BurstRequest {
  return { path, sentAtMs: 0, outcome, repliedAtMs: outcome ? 1 : null };
}

describe('burstOffsets', () => {
  it('spaces requests evenly at the given rate for the whole duration, starting at once', () => {
    const offsets = burstOffsets(30, 3000);

    expect(offsets).toHaveLength(90);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeCloseTo(33.33, 2);
    expect(offsets[89]).toBeCloseTo(2966.67, 2);
  });
});

describe('evaluateBurst', () => {
  it('passes when the last request was applied and is the wallpaper that landed', () => {
    const verdict = evaluateBurst(
      [
        request('C:\\burst\\000.jpg', { kind: 'applied' }),
        request('C:\\burst\\001.jpg', { kind: 'superseded' }),
        request('C:\\burst\\002.jpg', { kind: 'applied' }),
      ],
      'C:\\burst\\002.jpg',
    );

    expect(verdict).toEqual({
      requests: 3,
      applied: 2,
      superseded: 1,
      errors: 0,
      unanswered: 0,
      lastRequestedPath: 'C:\\burst\\002.jpg',
      landedPath: 'C:\\burst\\002.jpg',
      lastImageWins: true,
    });
  });

  it('fails when an earlier image is the one that landed', () => {
    const verdict = evaluateBurst(
      [request('C:\\burst\\000.jpg', { kind: 'applied' }), request('C:\\burst\\001.jpg', { kind: 'applied' })],
      'C:\\burst\\000.jpg',
    );

    expect(verdict.lastImageWins).toBe(false);
  });

  it('fails when the last request errored or was never answered, even if its path is set', () => {
    const errored = evaluateBurst(
      [request('C:\\burst\\000.jpg', { kind: 'error', error: 'os-rejected', code: 5 })],
      'C:\\burst\\000.jpg',
    );
    const unanswered = evaluateBurst([request('C:\\burst\\000.jpg', null)], 'C:\\burst\\000.jpg');

    expect(errored).toMatchObject({ errors: 1, lastImageWins: false });
    expect(unanswered).toMatchObject({ unanswered: 1, lastImageWins: false });
  });

  it('compares Windows paths case-insensitively', () => {
    const verdict = evaluateBurst([request('C:\\Burst\\000.JPG', { kind: 'applied' })], 'c:\\burst\\000.jpg');

    expect(verdict.lastImageWins).toBe(true);
  });
});

describe('summariseBursts', () => {
  function trial(maxExplorerPingMs: number, lastImageWins: boolean): Pick<BurstTrial, 'maxExplorerPingMs' | 'verdict'> {
    const verdict = evaluateBurst([request('C:\\a.jpg', { kind: 'applied' })], lastImageWins ? 'C:\\a.jpg' : 'C:\\b.jpg');
    return { maxExplorerPingMs, verdict };
  }

  it('reports the worst Explorer hang over all bursts and passes only if every burst ended on its last image', () => {
    expect(summariseBursts([trial(40, true), trial(75, true)])).toEqual({
      bursts: 2,
      passed: 2,
      worstExplorerHangMs: 75,
      lastImageWins: true,
    });
    expect(summariseBursts([trial(40, true), trial(30, false)])).toMatchObject({ passed: 1, lastImageWins: false });
  });

  it('does not pass with no bursts run', () => {
    expect(summariseBursts([])).toEqual({ bursts: 0, passed: 0, worstExplorerHangMs: null, lastImageWins: false });
  });
});

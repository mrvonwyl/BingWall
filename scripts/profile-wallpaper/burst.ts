import path from 'node:path';
import type { BurstRequest, BurstVerdict } from './burst.models.js';

// When each request of a simulated key-hold is sent, in ms from the start of the burst.
export function burstOffsets(ratePerSecond: number, durationMs: number): number[] {
  const count = Math.round((ratePerSecond * durationMs) / 1000);
  return Array.from({ length: count }, (_, index) => (index * 1000) / ratePerSecond);
}

// Last image wins: the final request must be applied and be the wallpaper Windows ends up with.
export function evaluateBurst(requests: BurstRequest[], landedPath: string | null): BurstVerdict {
  const count = (kind: string): number => requests.filter((request) => request.outcome?.kind === kind).length;
  const last = requests[requests.length - 1];
  return {
    requests: requests.length,
    applied: count('applied'),
    superseded: count('superseded'),
    errors: count('error'),
    unanswered: requests.filter((request) => request.outcome === null).length,
    lastRequestedPath: last?.path ?? null,
    landedPath,
    lastImageWins: last?.outcome?.kind === 'applied' && landedPath !== null && samePath(landedPath, last.path),
  };
}

function samePath(a: string, b: string): boolean {
  return path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();
}

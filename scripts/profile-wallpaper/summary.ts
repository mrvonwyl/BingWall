import type { Summary } from './summary.models.js';

export function summarise(values: (number | null)[]): Summary {
  const sorted = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, median: null, worst: null };
  }
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    worst: sorted[sorted.length - 1],
  };
}

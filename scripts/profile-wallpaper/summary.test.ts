import { describe, expect, it } from 'vitest';
import { summarise } from './summary.js';

describe('summarise', () => {
  it('reports the median and the worst of the measured values', () => {
    expect(summarise([120, 90, 300])).toEqual({ count: 3, median: 120, worst: 300 });
  });

  it('averages the two middle values of an even count and skips unmeasured trials', () => {
    expect(summarise([100, null, 80, 140, 60])).toEqual({ count: 4, median: 90, worst: 140 });
  });

  it('reports nothing when no trial was measured', () => {
    expect(summarise([null])).toEqual({ count: 0, median: null, worst: null });
  });
});

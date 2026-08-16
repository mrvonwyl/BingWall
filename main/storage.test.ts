import { describe, expect, it } from 'vitest';
import { upsertMetadata } from './storage.js';
import type { StoredImageMetadata } from './storage.models.js';

function entry(date: string): StoredImageMetadata {
  return { date, title: `Title ${date}`, description: 'desc', copyright: '© someone', copyrightlink: 'https://example.com' };
}

describe('upsertMetadata', () => {
  it('adds a new entry to the front', () => {
    const result = upsertMetadata([entry('2026-08-15')], entry('2026-08-16'));

    expect(result.map((e) => e.date)).toEqual(['2026-08-16', '2026-08-15']);
  });

  it('replaces an existing entry for the same date instead of duplicating it', () => {
    const updated = { ...entry('2026-08-16'), title: 'Updated title' };

    const result = upsertMetadata([entry('2026-08-16'), entry('2026-08-15')], updated);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(updated);
  });

  it('caps retained entries at 8, dropping the oldest', () => {
    const existing = Array.from({ length: 8 }, (_, i) => entry(`2026-08-${String(8 - i).padStart(2, '0')}`));

    const result = upsertMetadata(existing, entry('2026-08-09'));

    expect(result).toHaveLength(8);
    expect(result.map((e) => e.date)).not.toContain('2026-08-01');
    expect(result[0].date).toBe('2026-08-09');
  });
});

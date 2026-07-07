import { describe, it, expect } from 'vitest';
import { historyLabel } from '@/lib/history-label';

describe('historyLabel', () => {
  it('formats a plain history filename as a localized date/time', () => {
    const label = historyLabel('2026-07-07T03-49-12-345Z.html');
    expect(label).toBe(new Date('2026-07-07T03:49:12.345Z').toLocaleString('ru-RU'));
    expect(label).not.toMatch(/\(\d+\)/);
  });

  it('appends the collision suffix as " (N)"', () => {
    const label = historyLabel('2026-07-07T03-49-12-345Z-2.html');
    const expected = new Date('2026-07-07T03:49:12.345Z').toLocaleString('ru-RU') + ' (2)';
    expect(label).toBe(expected);
  });

  it('falls back to the raw name for unrecognized formats', () => {
    expect(historyLabel('not-a-timestamp.html')).toBe('not-a-timestamp.html');
    expect(historyLabel('garbage')).toBe('garbage');
  });
});

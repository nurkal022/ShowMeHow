import { describe, expect, it } from 'vitest';
import { levelOf, masteryOf } from '@/lib/lms/tutor';

describe('уровень студента для наставника', () => {
  it('EWMA: свежие оценки весят больше старых', () => {
    expect(masteryOf([])).toBeNull();
    expect(masteryOf([1, 1, 1, 0, 0])!).toBeLessThan(0.5);
    expect(masteryOf([0, 0, 1, 1, 1])!).toBeGreaterThan(0.75);
    expect(masteryOf([2, -1, NaN])).toBe(0.6);
  });
  it('пороги уровней', () => {
    expect(levelOf(null)).toBeNull();
    expect(levelOf(0.3)).toBe('struggling');
    expect(levelOf(0.65)).toBe('steady');
    expect(levelOf(0.9)).toBe('strong');
  });
});

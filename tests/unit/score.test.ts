import { describe, it, expect } from 'vitest';
import { aggregate } from '../../evals/score';

const S = (n: number) => ({ physics: n, clarity: n, interactivity: n, aesthetics: n });

describe('aggregate', () => {
  it('computes averages, pass rate and failures', () => {
    const r = aggregate([
      { prompt: 'a', scores: S(9) },
      { prompt: 'b', scores: S(7) },
      { prompt: 'c', scores: null, error: 'boom' },
    ]);
    expect(r.avg.physics).toBe(8);        // (9+7)/2
    expect(r.passRate).toBeCloseTo(1 / 3); // только 'a' прошёл (min>=8), из 3 промптов
    expect(r.failures).toEqual(['c: boom']);
  });
});

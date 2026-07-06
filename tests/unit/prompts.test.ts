import { describe, it, expect } from 'vitest';
import * as P from '@/lib/pipeline/prompts';

describe('prompts', () => {
  it('all prompts are non-empty strings', () => {
    for (const p of [P.PLANNER_SYSTEM, P.FIXER_SYSTEM, P.CRITIC_SYSTEM,
      P.JUDGE_SYSTEM, P.REFINER_SYSTEM]) {
      expect(p.length).toBeGreaterThan(200);
    }
  });
  it('generator prompt embeds style hint, uikit doc and CDN whitelist', () => {
    const g = P.generatorSystem(P.STYLE_HINTS[0]);
    expect(g).toContain(P.STYLE_HINTS[0]);
    expect(g).toContain('SimUI');
    for (const url of Object.values(P.CDN_WHITELIST)) expect(g).toContain(url);
  });
  it('has exactly 3 style hints', () => {
    expect(P.STYLE_HINTS).toHaveLength(3);
  });
});

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

  it('EXAMPLE_SKELETON covers the required structural elements', () => {
    expect(P.EXAMPLE_SKELETON).toContain('resetSim');
    expect(P.EXAMPLE_SKELETON).toContain('SimUI.playPause');
    expect(P.EXAMPLE_SKELETON).toContain('SimUI.slider');
    expect(P.EXAMPLE_SKELETON).toContain('requestAnimationFrame(loop)');
    expect(P.EXAMPLE_SKELETON).toContain("addEventListener('resize'");
  });

  it('generator prompt includes the quality skeleton marker and content', () => {
    const g = P.generatorSystem(P.STYLE_HINTS[0]);
    expect(g).toContain('Каркас качественной симуляции');
    expect(g).toContain(P.EXAMPLE_SKELETON);
  });

  it('generator prompt instructs three.js to load via ES module import (no UMD build)', () => {
    const g = P.generatorSystem(P.STYLE_HINTS[0]);
    expect(g).toContain('import * as THREE from');
    expect(g).toContain(P.CDN_WHITELIST.three);
    expect(P.CDN_WHITELIST.three).toContain('three.module.min.js');
  });
});

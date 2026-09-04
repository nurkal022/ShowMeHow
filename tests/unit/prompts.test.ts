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
  it('has exactly 5 style hints', () => {
    expect(P.STYLE_HINTS).toHaveLength(5);
  });

  it('STYLE_NAMES has 5 entries, index-aligned with STYLE_HINTS', () => {
    expect(P.STYLE_NAMES).toEqual(['Реализм', 'Наглядность', 'Интерактив', 'Схема', 'Данные']);
    expect(P.STYLE_NAMES).toHaveLength(P.STYLE_HINTS.length);
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

describe('generator prompt layout rules', () => {
  const sys = P.generatorSystem('Стиль: реализм.');
  it('forbids hand-rolled fixed panels and mandates SimUI.panel', () => {
    expect(sys).toContain('SimUI.panel');
    expect(sys).toContain('position:fixed');
    expect(sys.toLowerCase()).toContain('центр экрана');
  });
  it('prefers canvas charts over fragile chart libraries', () => {
    expect(sys.toLowerCase()).toContain('canvas');
    expect(sys.toLowerCase()).toContain('chart.js');
  });
  it('the skeleton uses SimUI.panel and has no hand-rolled #info fixed div', () => {
    expect(P.EXAMPLE_SKELETON).toContain('SimUI.readout');
    expect(P.EXAMPLE_SKELETON).toContain('SimUI.chart');
    expect(P.EXAMPLE_SKELETON).toContain('SimUI.formula');
    expect(P.EXAMPLE_SKELETON).toContain('SimUI.expose');
    expect(P.EXAMPLE_SKELETON).not.toContain('#info { position: fixed');
  });
});

describe('GENERATION_RULES', () => {
  it('единый блок правил входит в генератор, фиксер и рефайнер', () => {
    expect(P.generatorSystem(P.STYLE_HINTS[0])).toContain(P.GENERATION_RULES);
    expect(P.FIXER_SYSTEM).toContain(P.GENERATION_RULES);
    expect(P.REFINER_SYSTEM).toContain(P.GENERATION_RULES);
  });
  it('правила требуют SimUI.expose и запрещают свои fixed-панели', () => {
    expect(P.GENERATION_RULES).toContain('SimUI.expose');
    expect(P.GENERATION_RULES).toContain('position:fixed');
  });
  it('ни один акцент не требует chart.js', () => {
    for (const hint of P.STYLE_HINTS) expect(hint.toLowerCase()).not.toContain('chart.js');
  });
  it('генератор вставляет эталон, когда он передан', () => {
    const withEx = P.generatorSystem(P.STYLE_HINTS[0], '<!DOCTYPE html><html>ЭТАЛОН_МАРКЕР</html>');
    expect(withEx).toContain('ЭТАЛОН_МАРКЕР');
    expect(withEx).toContain('ЭТАЛОН КАЧЕСТВА');
    expect(P.generatorSystem(P.STYLE_HINTS[0])).not.toContain('ЭТАЛОН КАЧЕСТВА');
  });
});

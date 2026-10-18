import { describe, it, expect } from 'vitest';
import { repairArtifact, quoteOddKeys, syntaxError } from '@/lib/pipeline/repair';

const page = (js: string) => `<!DOCTYPE html><html><head></head><body><canvas id="scene"></canvas><script>
(function () {
${js}
})();
</script></body></html>`;

describe('механическая починка', () => {
  it('ключи объекта в виде LaTeX берутся в кавычки, и страница разбирается', () => {
    const js = `SimUI.formula({ tex: 'I = U/R', vars: {
      U: { label: "U" },
      R_{лампа}: { label: "R_{лампа}" },
      \\theta: { label: '\\\\theta' },
      R_{\\mathrm{реостат}}: { label: "R" },
    } });`;
    expect(syntaxError(js)).not.toBeNull();
    expect(syntaxError(quoteOddKeys(js))).toBeNull();
    const r = repairArtifact(page(js));
    expect(r.fixed.join()).toMatch(/LaTeX/);
    expect(r.html).toContain('"R_{лампа}":');
  });

  it('обычный код не трогается', () => {
    const html = page("var a = { x: 1, y: { z: 2 } }; var s = 'R_{x}: 1'; var t = a ? { k: 1 } : { k: 2 };");
    expect(repairArtifact(html)).toEqual({ html, fixed: [] });
  });

  it('physics без обёртки: верхнеуровневый return убран, PHYS определён', () => {
    const html = page(`  // ==== @section physics ====
  function init(p) { return { t: 0, x: p.x0 }; }
  function step(s, p, dt) { if (dt > 0) { s.t += dt; } }
  function observe(s) { return { t: s.t }; }
  return { init: init, step: step, observe: observe };
  // ==== @end physics ====
  // ==== @section state ====
  var P = { x0: 1 }; var S = PHYS.init(P);
  // ==== @end state ====`);
    const r = repairArtifact(html);
    expect(r.fixed.join()).toMatch(/physics/);
    expect(r.html).not.toMatch(/^\s*return \{ init: init/m);
    expect(r.html).toContain('var PHYS = { init: init, step: step, observe: observe };');
  });

  it('physics с обёрткой не трогается', () => {
    const html = page(`  // ==== @section physics ====
  var PHYS = (function () { function init() { return {}; } function step() {} return { init: init, step: step }; })();
  // ==== @end physics ====`);
    expect(repairArtifact(html).fixed).toEqual([]);
  });
});

import { normalizeSpec } from '@/lib/pipeline/spec';
import { scaffold } from '@/lib/pipeline/blocks';

describe('план с показом по фазам', () => {
  const raw = {
    title: 'ДВС', physics: 'такты', learningGoals: ['такты'], level: 'demo',
    parameters: [{ name: 'rpm', label: 'Обороты', min: 1, max: 60, value: 6 }],
    observables: [{ name: 'p', label: 'Давление', unit: 'атм' }],
    presentation: 'phases', phases: [{ name: 'Впуск', text: 'клапан открыт' }, 'Сжатие', { title: 'Рабочий ход' }],
  };
  it('фазы разбираются, выбор автора важнее планировщика', () => {
    const a = normalizeSpec(raw).spec;
    expect(a.presentation).toBe('phases');
    expect(a.phases?.map((p) => p.name)).toEqual(['Впуск', 'Сжатие', 'Рабочий ход']);
    expect(normalizeSpec(raw, { presentation: 'live' }).spec.presentation).toBeUndefined();
    expect(normalizeSpec({ ...raw, phases: [] }, { presentation: 'phases' }).problems.join()).toMatch(/phases/);
  });
  it('секция приборов получает SimUI.phases, а observe обязан вернуть phase', () => {
    const s = scaffold(normalizeSpec(raw).spec);
    expect(s.instruments).toContain('SimUI.phases(');
    expect(s.instruments).toContain('"Рабочий ход"');
    expect(s.keys).toContain('phase');
  });
});

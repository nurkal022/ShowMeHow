import { describe, it, expect, afterAll } from 'vitest';
import { instrument } from '@/lib/artifact';
import { openSession, closeBrowser } from '@/lib/renderer';
import { runProbes } from '@/lib/pipeline/probes';
import { UIKIT_JS } from '@/lib/runtime';
import { scaffold, scaffoldBrief, mainChart, hasPhases } from '@/lib/pipeline/blocks';
import type { PlanSpec } from '@/lib/types';

afterAll(() => closeBrowser());

const page = (body: string) => instrument(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<canvas id="scene"></canvas><script>${body}</script></body></html>`);

/** Минимальный тренажёр на SimUI.run: ядро, P, S и приборы с key — без цикла и expose. */
const RUN_SIM = `
var PHYS = {
  init: function (p) { return { t: 0, x: p.x0, v: 0 }; },
  step: function (s, p, dt) { s.v += -p.k * s.x * dt; s.x += s.v * dt; s.t += dt; },
  observe: function (s, p) { return { t: s.t, x: s.x, v: s.v, E: p.k * s.x * s.x / 2 + s.v * s.v / 2 }; },
};
var P = { k: 4, x0: 1 };
var S = PHYS.init(P);
var view = SimUI.view2d({ x: [-2, 2], y: [-1, 1] });
function draw(o) { view.clear(); view.ball(o.x, 0, 0.2, 'orange'); }
SimUI.title('Осциллятор');
SimUI.params(P, [
  { name: 'k', label: 'Жёсткость', min: 1, max: 10, step: 0.5, unit: 'Н/м' },
  { name: 'x0', label: 'Смещение', min: -1.5, max: 1.5, step: 0.1, unit: 'м' },
]);
SimUI.readouts({ x: { label: 'Смещение', unit: 'м' } });
SimUI.chart({ title: 'x(t)', x: 't', y: ['x'] });
var app = SimUI.run({ physics: PHYS, P: P, S: S, draw: draw });
`;

describe('SimUI.run', () => {
  it('сам даёт цикл, паузу, сброс и expose — тренажёр проходит все пробы', async () => {
    const s = await openSession(page(RUN_SIM));
    try {
      expect(s.errors()).toEqual([]);
      const r = await runProbes(s);
      expect(r.failures).toEqual([]);
      expect(r.controls?.map((c) => c.name)).toEqual(expect.arrayContaining(['k', 'x0', 'speed']));
    } finally { await s.close(); }
  }, 60000);

  it('приборы с key обновляются сами, слайдер пишет P, параметр начального состояния перезапускает опыт', async () => {
    const s = await openSession(page(RUN_SIM));
    try {
      await s.wait(1500);
      const shown = await s.evaluate<string>("document.querySelector('.sim-readout-value').textContent");
      expect(shown).toMatch(/м$/);
      expect(shown).not.toBe('—');
      expect(await s.evaluate<number>('P.k')).toBe(4);
      await s.evaluate("SimUI.set('k', 9)");
      expect(await s.evaluate<number>('P.k')).toBe(9);
      const t1 = await s.evaluate<number>('window.__smh.state().t');
      await s.evaluate("SimUI.set('x0', 0.5)"); // x0 читает только init — опыт начинается заново
      const after = await s.evaluate<{ t: number; x: number }>('window.__smh.state()');
      expect(after.t).toBeLessThan(t1);
      expect(Math.abs(after.x - 0.5)).toBeLessThan(0.2);
    } finally { await s.close(); }
  }, 60000);

  it('сторож NaN перезапускает разошедшийся расчёт и сообщает о нём пробам', async () => {
    const s = await openSession(page(`
      var PHYS = { init: function () { return { t: 0, x: 1 }; },
        step: function (s, p, dt) { s.t += dt; if (s.t > 0.3) s.x = NaN; },
        observe: function (s) { return { t: s.t, x: s.x }; } };
      SimUI.run({ physics: PHYS });`));
    try {
      await s.wait(1500);
      const bad = await s.evaluate<string[]>('window.__smh.badNumbers()');
      expect(bad.join()).toMatch(/разошёлся/);
    } finally { await s.close(); }
  }, 60000);
});

describe('зависимость от параметра', () => {
  it('SimUI.sweep строит кривую по всему диапазону слайдера тем же ядром', async () => {
    const s = await openSession(page(`
      var PHYS = { init: function () { return { t: 0 }; }, step: function (s, p, dt) { s.t += dt; },
        observe: function (s, p) { return { t: s.t, I: p.E / (p.R + p.r) }; } };
      var P = { E: 6, r: 1, R: 5 };
      SimUI.params(P, [{ name: 'R', label: 'R', min: 1, max: 21, step: 1, unit: 'Ом' }]);
      window.sw = SimUI.sweep({ title: 'I(R)', param: 'R', y: 'I' });
      SimUI.run({ physics: PHYS, P: P });`));
    try {
      await s.wait(500);
      const b = await s.evaluate<{ xmin: number; xmax: number; ymin: number; ymax: number }>('window.sw.__bounds()');
      expect(b.xmin).toBe(1);
      expect(b.xmax).toBe(21);
      expect(b.ymax).toBeGreaterThan(2.7); // I(1) = 3 А, с полями графика
      expect(s.errors()).toEqual([]);
    } finally { await s.close(); }
  }, 60000);
});

describe('страховка кита', () => {
  it('выдуманный метод SimUI не роняет страницу, а даёт ошибку с подсказкой', async () => {
    const s = await openSession(page(`
      var w = SimUI.gaugeWidget({ label: 'x' }); w.set(3).foo();
      SimUI.addSlider({ name: 'a', label: 'A', min: 0, max: 1, value: 0.5 });
      SimUI.slider('Масса', 1, 10, 5, function () {});
      window.ok = document.querySelectorAll('input[type=range]').length;`));
    try {
      expect(await s.evaluate<number>('window.ok')).toBe(2);
      const errs = s.errors().join('\n');
      expect(errs).toMatch(/SimUI\.gaugeWidget не существует/);
      expect(errs).toMatch(/SimUI\.addSlider не существует — используй SimUI\.slider/);
      expect(errs).not.toMatch(/TypeError/);
    } finally { await s.close(); }
  }, 60000);

  it('LaTeX в обычных подписях — Юникод, кириллица в формуле — в \\text{}', async () => {
    const s = await openSession(page(''));
    try {
      expect(await s.evaluate<string>("SimUI.uni('\\\\theta_0 = 4.8°, v^2')")).toBe('θ₀ = 4.8°, v²');
      const env = await s.evaluate<string>("SimUI.uni('\\\\[ \\\\begin{cases} a \\\\\\\\ b \\\\end{cases} \\\\]')");
      expect(env).not.toMatch(/begin|cases|\\/);
      expect(await s.evaluate<string>("SimUI.texSafe('x = 3\\\\,\\\\text{м}, скорость')"))
        .toBe('x = 3\\,\\text{м}, \\text{скорость}');
    } finally { await s.close(); }
  }, 60000);

  it('кит собирается в валидный JS', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
});

const SPEC: PlanSpec = {
  title: 'Цикл Отто', subject: 'Физика', mode: '2d', level: 'demo', learningGoals: ['КПД растёт со степенью сжатия'],
  physics: 'Четыре такта: впуск, сжатие, рабочий ход, выпуск.', visualPlan: '',
  parameters: [{ name: 'eps', label: 'Степень сжатия', min: 4, max: 14, step: 0.5, value: 10, unit: '', group: 'Цилиндр' }],
  observables: [
    { name: 'p', label: 'Давление', unit: 'бар' }, { name: 'V', label: 'Объём', unit: 'л' },
    { name: 'phase', label: 'Такт', unit: '' }, { name: 'T', label: 'Температура', unit: 'К' },
  ],
  views: [{ kind: 'chart', title: 'p от времени', what: '', y: ['p'] }],
  presets: [{ label: 'Дизель', values: { eps: 14 } }],
};

describe('блоки из плана', () => {
  it('controls: все параметры через SimUI.params с группами и пресеты', () => {
    const s = scaffold(SPEC);
    expect(s.controls).toContain('SimUI.params(P, [');
    expect(s.controls).toContain('name: "eps"');
    expect(s.controls).toContain('group: "Цилиндр"');
    expect(s.controls).toContain('SimUI.presets(');
  });
  it('instruments: показания без служебных величин и главный график по осям плана', () => {
    const s = scaffold(SPEC);
    expect(s.instruments).toContain('SimUI.readouts(');
    expect(s.instruments).not.toContain('"phase"');
    expect(mainChart(SPEC)).toEqual({ title: 'p от времени', x: 't', y: ['p'] });
    expect(s.keys).toEqual(expect.arrayContaining(['t', 'p', 'V', 'T']));
  });
  it('фазы процесса подсказывают баннер, бриф перечисляет обязательные ключи observe', () => {
    expect(hasPhases(SPEC)).toBe(true);
    const b = scaffoldBrief(SPEC);
    expect(b).toContain('SimUI.banner');
    expect(b).toMatch(/observe обязан возвращать числами: t, p, V, T/);
  });
  it('собранные секции исполняются и проходят пробы вместе с ядром', async () => {
    const s = scaffold(SPEC);
    const html = page(`
      var PHYS = { init: function (p) { return { t: 0 }; }, step: function (s, p, dt) { s.t += dt; },
        observe: function (s, p) { return { t: s.t, p: 1 + Math.sin(s.t) * p.eps / 10, V: 1 + Math.cos(s.t), T: 300 + 10 * Math.sin(s.t), phase: 0 }; } };
      var P = {}; var S = PHYS.init({ eps: 10 });
      var view = SimUI.view2d({ x: [-1, 1], y: [-1, 1] });
      function draw(o) { view.clear(); view.circle(Math.sin(o.t) * 0.5, 0, 0.1 * o.p, 'blue'); }
      ${s.controls}
      ${s.instruments}
      SimUI.run({ physics: PHYS, P: P, S: S, draw: draw });`);
    const session = await openSession(html);
    try {
      expect(session.errors()).toEqual([]);
      const r = await runProbes(session);
      expect(r.failures).toEqual([]);
    } finally { await session.close(); }
  }, 60000);
});

describe('показ по фазам', () => {
  const PHASED = `
    var PHYS = { init: function () { return { t: 0 }; }, step: function (s, p, dt) { s.t += dt; },
      observe: function (s) { return { t: s.t, phase: Math.floor(s.t / 0.5) % 3 }; } };
    window.ph = SimUI.phases({ key: 'phase', items: [{ name: 'А', text: 'первая' }, { name: 'Б' }, { name: 'В' }] });
    SimUI.run({ physics: PHYS });`;

  it('пошагово: стоит в начале фазы, «Далее» проигрывает её и останавливается ровно на следующей', async () => {
    const s = await openSession(page(PHASED));
    try {
      await s.evaluate("window.ph.mode('step')");
      await s.wait(400);
      const t0 = await s.evaluate<number>('window.__smh.state().t');
      await s.wait(400);
      expect(await s.evaluate<number>('window.__smh.state().t')).toBe(t0); // ждёт «Далее»
      await s.evaluate('window.ph.next()');
      await s.wait(1500);
      const st = await s.evaluate<{ t: number; phase: number }>('window.__smh.state()');
      expect(st.phase).toBe(1);
      expect(Math.abs(st.t - 0.5)).toBeLessThan(0.01); // остановка точно на границе
      await s.evaluate('window.ph.jump(2)'); // ещё не виденная фаза — доматывает сам
      expect(await s.evaluate<number>('window.__smh.state().phase')).toBe(2);
      await s.evaluate('window.ph.back()');
      const back = await s.evaluate<{ t: number; phase: number }>('window.__smh.state()');
      expect(back.phase).toBe(1);
      expect(Math.abs(back.t - 0.5)).toBeLessThan(0.01);
      expect(await s.evaluate<string>("document.querySelector('.sim-phase-name').textContent")).toContain('Б');
      expect(s.errors()).toEqual([]);
    } finally { await s.close(); }
  }, 60000);

  it('под автоматической проверкой — непрерывный показ, и тренажёр проходит пробы', async () => {
    const s = await openSession(page(PHASED + `
      SimUI.params({}, [{ name: 'k', label: 'k', min: 0, max: 1, step: 0.1 }]);`));
    try {
      const r = await runProbes(s);
      expect(r.results.find((x) => x.id === 'animates')?.status).toBe('pass');
      expect(r.results.find((x) => x.id === 'pause')?.status).toBe('pass');
    } finally { await s.close(); }
  }, 60000);
});

describe('ядро с фазами', () => {
  it('числовая проверка требует, чтобы observe().phase прошла все фазы по порядку', async () => {
    const { checkCore } = await import('@/lib/pipeline/core');
    const spec = {
      title: 'x', subject: 'Физика', mode: '2d' as const, learningGoals: ['x'], physics: 'x', visualPlan: '',
      parameters: [{ name: 'k', label: 'k', min: 1, max: 2, step: 0.1, value: 1, unit: '' }],
      presentation: 'phases' as const, phases: [{ name: 'A', text: '' }, { name: 'B', text: '' }, { name: 'C', text: '' }],
    };
    const core = (expr: string) => `var PHYS = { init: function (p) { return { t: 0 }; }, step: function (s, p, dt) { s.t += dt * p.k; },
      observe: function (s, p) { return { t: s.t, phase: ${expr} }; } };`;
    const good = await checkCore({ core: core('Math.floor(s.t) % 3'), checks: 'var CHECKS = [];' }, spec);
    expect(good.results.find((r) => /Фазы/.test(r.label))?.ok).toBe(true);
    const skip = await checkCore({ core: core('(Math.floor(s.t) * 2) % 3'), checks: 'var CHECKS = [];' }, spec);
    expect(skip.hard.join()).toMatch(/перескочила/);
  }, 60000);
});

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeSpec, levelOf } from '@/lib/pipeline/spec';
import { listSections, getSection, putSection, sectionsFromReply } from '@/lib/pipeline/sections';
import { readConfig, writeConfig, mergeConfig, sanitizeConfig } from '@/lib/pipeline/config';
import { parseCoreReply, checkCore } from '@/lib/pipeline/core';
import { parseRefinePatch } from '@/lib/pipeline/edits';
import { planLayers, coverageFailures, type Ctx } from '@/lib/pipeline/stages';
import { runPipeline, refineExisting, lostProbes, specWithConfig } from '@/lib/pipeline/run';
import { EXAMPLE_SKELETON } from '@/lib/pipeline/prompts';
import { pickNote } from '@/lib/jobs/pick';
import { instrument } from '@/lib/artifact';
import { openSession, closeBrowser } from '@/lib/renderer';
import { createSimulation, getArtifact, getSpec, saveSpec } from '@/lib/storage';
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';
import type { PipelineEvent, PlanSpec, RenderReport, Role } from '@/lib/types';

const OWNER = '11111111-1111-1111-1111-111111111111';

afterAll(() => closeBrowser());

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  __setRepoForTests(createMemoryRepo());
});

const PENDULUM: PlanSpec = {
  title: 'Маятник', subject: 'Физика', mode: '2d', learningGoals: ['период'],
  physics: 'T = 2π√(L/g)', visualPlan: 'v', level: 'lab',
  parameters: [
    { name: 'L', label: 'Длина', min: 0.5, max: 3, step: 0.1, value: 1, unit: 'м' },
    { name: 'g', label: 'g', min: 1, max: 20, step: 0.1, value: 9.8, unit: 'м/с²' },
  ],
  views: [{ kind: 'chart', title: 'Угол', what: 'θ(t)' }, { kind: 'phase', title: 'Фазовый портрет', what: 'ω(θ)' }],
  scenario: [{ title: 'Наблюдай', task: 'Смотри на период' }],
};

const GOOD_CORE = `var PHYS = (function () {
  function init(p) { return { t: 0, th: 0.3, w: 0 }; }
  function step(s, p, dt) { s.w += -(p.g / p.L) * Math.sin(s.th) * dt; s.th += s.w * dt; s.t += dt; }
  function observe(s, p) { return { t: s.t, th: s.th, w: s.w, E: 0.5 * p.L * p.L * s.w * s.w + p.g * p.L * (1 - Math.cos(s.th)) }; }
  return { init: init, step: step, observe: observe };
})();`;

describe('normalizeSpec', () => {
  it('чинит диапазоны, имена и шаг; уровень по умолчанию — demo', () => {
    const { spec, problems } = normalizeSpec({
      title: 'X', physics: 'F=ma', learningGoals: ['a'],
      parameters: [
        { name: 'темп', label: 'T', min: 10, max: 0, value: 50 },
        { name: 'L', label: 'L', min: 0, max: 1, value: 0.5, step: 0 },
        { name: 'L', label: 'L2', min: 0, max: 1, value: 0.5 },
      ],
    });
    expect(problems).toEqual([]);
    expect(levelOf(spec)).toBe('demo');
    expect(spec.parameters.map((p) => p.name)).toEqual(['param1', 'L', 'L_3']);
    expect(spec.parameters[0]).toMatchObject({ min: 0, max: 10, value: 10 });
    expect(spec.parameters[1].step).toBeGreaterThan(0);
  });
  it('«скорость времени» не параметр плана — её даёт кит', () => {
    const { spec } = normalizeSpec({ physics: 'x', learningGoals: ['a'], parameters: [
      { name: 'a', label: 'Большая полуось', min: 0.5, max: 5, value: 1 },
      { name: 'timeScale', label: 'Скорость времени', min: 0.1, max: 10, value: 1 },
      { name: 'k', label: 'Темп симуляции', min: 1, max: 5, value: 1 },
      { name: 'speed', label: 'Скорость частиц', min: 1, max: 10, value: 3 },
    ] });
    expect(spec.parameters.map((p) => p.name)).toEqual(['a', 'speed']);
  });
  it('без параметров и физики — проблемы; сценарий в demo отбрасывается', () => {
    const { spec, problems } = normalizeSpec({ level: 'demo', scenario: [{ title: 'a', task: 'b' }] });
    expect(problems.length).toBeGreaterThanOrEqual(2);
    expect(spec.scenario).toBeUndefined();
  });
  it('lab без сценария — проблема; пресеты только по существующим параметрам', () => {
    const { spec, problems } = normalizeSpec({
      level: 'lab', physics: 'x', learningGoals: ['a'], parameters: [{ name: 'a', min: 0, max: 1 }],
      presets: [{ label: 'p', values: { a: 1, zzz: 2 } }, { label: 'пусто', values: { zzz: 1 } }],
    });
    expect(problems.some((p) => p.includes('сценарий'))).toBe(true);
    expect(spec.presets).toEqual([{ label: 'p', values: { a: 1 } }]);
  });
});

describe('секции', () => {
  const html = `<script>\n  // ==== @section physics ====\n  var PHYS = 1;\n  // ==== @end physics ====\n\n  // ==== @section main ====\n  go();\n  // ==== @end main ====\n</script>`;
  it('читаются по маркерам', () => {
    expect(listSections(html).map((s) => s.name)).toEqual(['physics', 'main']);
    expect(getSection(html, 'physics')).toBe('  var PHYS = 1;');
  });
  it('заменяются и вставляются перед main', () => {
    const replaced = putSection(html, 'physics', 'var PHYS = 2;')!;
    expect(getSection(replaced, 'physics')).toBe('var PHYS = 2;');
    const added = putSection(replaced, 'views', 'hooks.frame.push(f);')!;
    expect(listSections(added).map((s) => s.name)).toEqual(['physics', 'views', 'main']);
    expect(putSection('<script>x</script>', 'views', 'y')).toBeNull();
  });
  it('каркас размечен всеми обязательными секциями', () => {
    expect(listSections(EXAMPLE_SKELETON).map((s) => s.name))
      .toEqual(['physics', 'state', 'scene', 'controls', 'instruments', 'main']);
  });
  it('пропавшие при переписывании секции замечаются', async () => {
    const { lostSections, keepsSections } = await import('@/lib/pipeline/sections');
    const added = putSection(html, 'views', 'v();')!;
    expect(lostSections(added, html)).toEqual(['views']);
    expect(keepsSections(html, added)).toBe(true);
  });
  it('ответ без разметки становится секцией по умолчанию', () => {
    expect(sectionsFromReply('```js\nSimUI.steps({});\n```', 'scenario')).toEqual({ scenario: 'SimUI.steps({});' });
  });
});

describe('наложение настроек', () => {
  it('пишется, читается, сливается и не ломает тег', () => {
    const html = '<!DOCTYPE html><html><head></head><body></body></html>';
    const a = writeConfig(html, { title: 'Новый </script> заголовок', parameters: { L: { label: 'Длина нити', max: 5 } } });
    expect(a).not.toContain('Новый </script>');
    expect(readConfig(a).title).toBe('Новый </script> заголовок');
    const b = writeConfig(a, mergeConfig(readConfig(a), { parameters: { L: { value: 2 } } }));
    expect(readConfig(b).parameters!.L).toEqual({ label: 'Длина нити', max: 5, value: 2 });
    expect(writeConfig(b, {})).not.toContain('sim-config');
  });
  it('мусор отбрасывается', () => {
    expect(sanitizeConfig({ parameters: { 'bad name': { min: 1 }, ok: { min: 'x', max: Infinity, step: -1 } }, presets: 'x' }))
      .toEqual({});
  });
  it('план подтягивает подписи и диапазоны из наложения', () => {
    const next = specWithConfig(PENDULUM, { parameters: { L: { label: 'Нить', max: 5 } } });
    expect(next.parameters[0]).toMatchObject({ label: 'Нить', max: 5, min: 0.5 });
  });
});

describe('кит: наложение и виджеты урока', () => {
  it('слайдер берёт подпись и значение из sim-config, виджеты урока регистрируются', async () => {
    const html = instrument(writeConfig(EXAMPLE_SKELETON.replace(
      '  // ==== @section main ====',
      `  // ==== @section scenario ====
  SimUI.steps({ items: [{ title: 'Смотри', text: 'а' }, { title: 'Меряй', text: 'б' }] });
  SimUI.task({ question: 'g?', answer: function () { return P.g; }, tolerance: 0.01 });
  SimUI.table({ columns: [{ label: 't', unit: 'с' }], record: function () { return [S.t]; } });
  // ==== @end scenario ====

  // ==== @section main ====`),
    { title: 'Мяч на Марсе', parameters: { g: { label: 'Гравитация', value: 3.7 } } }));
    const s = await openSession(html);
    try {
      await s.wait(300);
      expect(s.errors()).toEqual([]);
      const controls = await s.evaluate<{ kind: string; name: string; label: string; value: unknown }[]>('window.__smh.controls()');
      const g = controls.find((c) => c.name === 'g')!;
      expect(g).toMatchObject({ label: 'Гравитация', value: 3.7 });
      expect(await s.evaluate<number>('window.__smh.state().g')).toBe(3.7);
      expect(controls.map((c) => c.kind)).toEqual(expect.arrayContaining(['steps', 'task', 'table']));
      expect(await s.evaluate<string>("document.querySelector('.sim-panel h1').textContent")).toBe('Мяч на Марсе');
    } finally {
      await s.close();
    }
  }, 30000);
});

describe('конструктор: приборы урока', () => {
  it('задание — исследование, таблица и шаги — лаборатория; уровень уходит в запрос', async () => {
    const { buildPrompt, levelHint } = await import('@/components/constructor/buildPrompt');
    expect(levelHint(['slider', 'task'])).toBe('research');
    expect(levelHint(['table'])).toBe('lab');
    expect(levelHint(['slider', 'chart'])).toBeNull();
    const text = buildPrompt({ section: '', phenomenon: 'маятник', mode: '2d', style: 'schematic',
      parameters: [], instruments: ['slider', 'lesson', 'table'], notes: '', level: 'grade7to9' });
    expect(text).toContain('уровень тренажёра: lab');
    expect(text).toContain('таблицу измерений');
  });
});

describe('продолжение после потери воркера', () => {
  it('точки сохраняются по этапам и читаются обратно', async () => {
    const { saveCheckpoint, loadCheckpoint, clearCheckpoint } = await import('@/lib/jobs/checkpoints');
    saveCheckpoint('job-1', { spec: PENDULUM });
    saveCheckpoint('job-1', { core: 'var PHYS = 1;' });
    expect(loadCheckpoint('job-1')).toMatchObject({ spec: { title: 'Маятник' }, core: 'var PHYS = 1;' });
    clearCheckpoint('job-1');
    expect(loadCheckpoint('job-1')).toBeNull();
  });
  it('собранная основа: без плана, ядра, генерации и слоёв — сразу суд', async () => {
    const chat = vi.fn(async (role: Role) => {
      if (role === 'judge') return JSON.stringify({ winnerIndex: 0, scores: [{ physics: 9, clarity: 9, interactivity: 9, aesthetics: 9 }], feedback: '' });
      if (role === 'critic') return '{"physicsOk":true,"issues":[]}';
      return '```html\n' + EXAMPLE_SKELETON + '\n```';
    });
    const saved: object[] = [];
    const ctx: Ctx = {
      chat: chat as unknown as Ctx['chat'], hasVision: true, emit: () => {},
      render: vi.fn(async () => okRender),
      checkCore: vi.fn(),
      checkpoint: { load: () => ({ spec: PENDULUM, core: 'var PHYS = 1;', built: instrument(EXAMPLE_SKELETON) }), save: (p) => { saved.push(p); } },
    };
    const meta = await runPipeline(ctx, { ownerId: OWNER, prompt: 'маятник', mode: 'standard' });
    const roles = chat.mock.calls.map((c) => c[0]);
    expect(roles).not.toContain('planner');
    expect(roles).not.toContain('generator');
    expect(ctx.checkCore).not.toHaveBeenCalled();
    expect(await getArtifact(OWNER, meta.id)).toContain('@section physics');
  });
});

describe('SimPhys', () => {
  it('доступен ядру в песочнице проверки: RK4-маятник держит энергию', async () => {
    const core = `var PHYS = (function () {
      function init(p) { return { t: 0, y: [0.3, 0] }; }
      function step(s, p, dt) {
        SimPhys.substep(dt, 1 / 240, function (h) {
          s.y = SimPhys.rk4(s.y, s.t, h, function (y) { return [y[1], -(p.g / p.L) * Math.sin(y[0])]; });
          s.t += h;
        });
      }
      function observe(s, p) { return { t: s.t, th: s.y[0], E: 0.5 * p.L * p.L * s.y[1] * s.y[1] + p.g * p.L * (1 - Math.cos(s.y[0])) }; }
      return { init: init, step: step, observe: observe };
    })();`;
    const r = await checkCore({ core, checks: `var CHECKS = [{ label: 'E', fn: function (PHYS, run) {
      var s = run({}, 20).samples; return Math.abs(s[s.length - 1].obs.E - s[0].obs.E) < 1e-4 * s[0].obs.E || 'дрейф'; } }];` }, PENDULUM);
    expect(r.failures).toEqual([]);
  }, 30000);
  it('на странице: столкновение сохраняет импульс, измеритель периода считает период', async () => {
    const s = await openSession(instrument('<!DOCTYPE html><html><head></head><body></body></html>'));
    try {
      const res = await s.evaluate<{ p0: number; p1: number; period: number; scene3d: string }>(`(function(){
        var a = {x:0,y:0,vx:2,vy:0,r:1,m:1}, b = {x:1.5,y:0,vx:-1,vy:0,r:1,m:3};
        var p0 = a.m*a.vx + b.m*b.vx; SimPhys.collide(a, b, 1); var p1 = a.m*a.vx + b.m*b.vx;
        var m = SimPhys.periodMeter(); for (var i = 0; i < 2000; i++) { var t = i / 100; m.feed(t, Math.sin(2 * Math.PI * t / 1.7)); }
        return { p0: p0, p1: p1, period: m.get(), scene3d: typeof SimUI.scene3d };
      })()`);
      expect(res.p1).toBeCloseTo(res.p0, 9);
      expect(res.period).toBeCloseTo(1.7, 2);
      expect(res.scene3d).toBe('function');
    } finally { await s.close(); }
  }, 30000);
});

describe('свои эталоны', () => {
  it('подбирается ближайший по уровню и теме, в промпт — только приборы, виды и урок', async () => {
    const { pickOwnExemplar, scoreOwnExemplar } = await import('@/lib/exemplars');
    const withLesson = putSection(putSection(EXAMPLE_SKELETON, 'views', 'SimUI.table({});')!, 'scenario', 'SimUI.steps({});')!;
    const far: PlanSpec = { ...PENDULUM, title: 'Диффузия', subject: 'Химия', mode: '3d', level: 'demo', physics: 'x', learningGoals: ['y'] };
    expect(scoreOwnExemplar(PENDULUM, PENDULUM)).toBeGreaterThan(scoreOwnExemplar(far, PENDULUM));
    const code = pickOwnExemplar([{ id: 'far', spec: far, html: withLesson }, { id: 'near', spec: PENDULUM, html: withLesson }], PENDULUM, listSections)!;
    expect(code).toContain('Эталон: Маятник');
    expect(code).toContain('@section scenario');
    expect(code).not.toContain('@section physics');
    expect(pickOwnExemplar([{ id: 'far', spec: far, html: withLesson }], PENDULUM, listSections)).toBeNull();
  });
  it('отметка эталона хранится у тренажёра и попадает в выборку автора', async () => {
    const { setExemplar, isExemplar, listExemplars } = await import('@/lib/storage');
    const meta = await createSimulation(OWNER, { title: 't', prompt: 'p', subject: 's', tags: [] }, EXAMPLE_SKELETON);
    await saveSpec(OWNER, meta.id, PENDULUM);
    expect(await listExemplars(OWNER)).toEqual([]);
    await setExemplar(OWNER, meta.id, true);
    expect(await isExemplar(OWNER, meta.id)).toBe(true);
    expect((await listExemplars(OWNER)).map((e) => e.id)).toEqual([meta.id]);
    await setExemplar(OWNER, meta.id, false);
    expect(await isExemplar(OWNER, meta.id)).toBe(false);
  });
});

describe('сводка качества', () => {
  it('провалы собираются в готовую просьбу на починку', async () => {
    const { qualityReport } = await import('@/lib/pipeline/quality');
    const report: RenderReport = { ok: true, errors: [], animated: true, screenshots: [], probes: {
      results: [{ id: 'pause', label: 'Пауза', status: 'fail', detail: 'не останавливает' }],
      passRate: 0, failures: [], shots: [], controls: [{ kind: 'slider', name: 'L', label: 'Длина' }] } };
    const q = qualityReport(report, PENDULUM, EXAMPLE_SKELETON);
    expect(q.items.find((i) => i.id === 'coverage')).toMatchObject({ status: 'fail' }); // нет слайдера g
    expect(q.items.find((i) => i.id === 'lesson')).toMatchObject({ status: 'fail' });    // lab без сценария
    expect(q.fixInstruction).toMatch(/Пауза: не останавливает/);
    expect(q.fixInstruction).toMatch(/name: 'g'/);
  });
});

describe('доводка обязана улучшать', () => {
  it('improved: худшая оценка не проседает и сумма растёт', async () => {
    const { improved } = await import('@/lib/pipeline/run');
    const a = { physics: 2, clarity: 6, interactivity: 7, aesthetics: 8, depth: 4 };
    expect(improved(a, { physics: 2, clarity: 4, interactivity: 5, aesthetics: 6, depth: 3 })).toBe(false);
    expect(improved(a, { physics: 8, clarity: 7, interactivity: 8, aesthetics: 8, depth: 8 })).toBe(true);
    expect(improved(a, { physics: 1, clarity: 9, interactivity: 9, aesthetics: 9, depth: 9 })).toBe(false);
  });
  it('доводка, снизившая оценки, откатывается: в библиотеке версия до неё', async () => {
    const events: PipelineEvent[] = [];
    let judged = 0;
    const base = EXAMPLE_SKELETON.replace('Название симуляции</title>', 'ОСНОВА</title>');
    const chat = vi.fn(async (role: Role) => {
      if (role === 'planner') return JSON.stringify({ ...PENDULUM, level: 'demo', scenario: undefined });
      if (role === 'critic') return '{"physicsOk":true,"issues":[]}';
      if (role === 'judge') {
        const s = judged++ === 0 ? { physics: 6, clarity: 6, interactivity: 6, aesthetics: 6 } : { physics: 3, clarity: 3, interactivity: 3, aesthetics: 3 };
        return JSON.stringify({ winnerIndex: 0, scores: [s], feedback: 'улучшить' });
      }
      if (role === 'refiner') return '```html\n' + EXAMPLE_SKELETON.replace('Название симуляции</title>', 'ХУЖЕ</title>') + '\n```';
      return '```html\n' + base + '\n```';
    });
    const ctx: Ctx = { chat: chat as unknown as Ctx['chat'], hasVision: true, emit: (e) => events.push(e), render: vi.fn(async () => okRender) };
    const meta = await runPipeline(ctx, { ownerId: OWNER, prompt: 'маятник', mode: 'standard' });
    const html = (await getArtifact(OWNER, meta.id))!;
    expect(html).toContain('ОСНОВА');
    expect(html).not.toContain('ХУЖЕ');
    expect(events.some((e) => e.type === 'warning' && e.message.includes('не улучшила'))).toBe(true);
  });
});

describe('предохранитель дорогих действий', () => {
  it('один запуск за раз и не больше лимита в минуту, у каждого человека свой', async () => {
    const { acquire, THROTTLE } = await import('@/lib/http/throttle');
    let t = 1_000_000;
    const now = () => t;
    const r1 = acquire('u-throttle', 'check', now)!;
    expect(r1).toBeTypeOf('function');
    expect(acquire('u-throttle', 'check', now)).toBeNull();        // уже идёт
    expect(acquire('u-other', 'check', now)).not.toBeNull();       // другой человек — свой слот
    r1();
    for (let i = 1; i < THROTTLE.check.perMinute; i++) acquire('u-throttle', 'check', now)!();
    expect(acquire('u-throttle', 'check', now)).toBeNull();        // лимит минуты
    t += 61_000;
    expect(acquire('u-throttle', 'check', now)).not.toBeNull();    // окно прошло
  });
});

describe('починка не выбрасывает слои', () => {
  it('фиксер, приславший файл без секции views, отвергается', async () => {
    const { fixArtifact } = await import('@/lib/pipeline/stages');
    const withViews = instrument(putSection(EXAMPLE_SKELETON, 'views', 'SimUI.legend({items:[]});')!);
    const ctx: Ctx = {
      chat: vi.fn(async () => '```html\n' + EXAMPLE_SKELETON + '\n```') as unknown as Ctx['chat'],
      hasVision: false, render: vi.fn(), emit: () => {},
    };
    await expect(fixArtifact(ctx, withViews, ['ошибка'])).rejects.toThrow(/потеряла секции: views/);
  });
});

describe('проба «сцена видна»', () => {
  it('холст внутри холста — провал с подсказкой для three.js; обычная сцена проходит', async () => {
    const { runProbes } = await import('@/lib/pipeline/probes');
    const broken = instrument(EXAMPLE_SKELETON.replace(
      "var ctx2d = canvas.getContext('2d');",
      "var inner = document.createElement('canvas'); canvas.appendChild(inner); var ctx2d = inner.getContext('2d');"));
    const s1 = await openSession(broken);
    try {
      const r = await runProbes(s1);
      expect(r.results.find((x) => x.id === 'scene')).toMatchObject({ status: 'fail' });
      expect(r.failures.join()).toMatch(/WebGLRenderer\(\{canvas/);
    } finally { await s1.close(); }
    const s2 = await openSession(instrument(EXAMPLE_SKELETON));
    try {
      const r = await runProbes(s2);
      expect(r.results.find((x) => x.id === 'scene')).toMatchObject({ status: 'pass' });
    } finally { await s2.close(); }
  }, 60000);
});

describe('ядро физики', () => {
  it('разбирается из двух блоков', () => {
    const code = parseCoreReply('```js\n' + GOOD_CORE + '\n```\n```js\nvar CHECKS = [];\n```');
    expect(code?.core).toContain('var PHYS');
    expect(code?.checks).toBe('var CHECKS = [];');
    expect(parseCoreReply('нет кода')).toBeNull();
  });
  it('хорошее ядро проходит, инвариант проверяется', async () => {
    const r = await checkCore({ core: GOOD_CORE, checks: `var CHECKS = [{ label: 'Энергия сохраняется', fn: function (PHYS, run) {
      var s = run({}, 10, 1/600).samples; var e0 = s[0].obs.E, e1 = s[s.length - 1].obs.E;
      return Math.abs(e1 - e0) < 0.02 * e0 || ('E: ' + e0 + ' → ' + e1); } }];` }, PENDULUM);
    expect(r.failures).toEqual([]);
    expect(r.results.map((x) => x.label)).toContain('Энергия сохраняется');
  }, 30000);
  it('period() меряет период точно: T растёт как √L', async () => {
    const r = await checkCore({ core: GOOD_CORE, checks: `var CHECKS = [{ label: 'T ~ √L', fn: function (PHYS, run, P, period) {
      var k = period({ L: 2 }, 'th') / period({ L: 0.5 }, 'th');
      return Math.abs(k - 2) < 0.03 || ('отношение ' + k); } }];` }, PENDULUM);
    expect(r.failures).toEqual([]);
  }, 30000);
  it('параметр, который по плану «не влияет», не проверяется; мёртвый — мягкий провал', async () => {
    const withMass: PlanSpec = {
      ...PENDULUM,
      parameters: [...PENDULUM.parameters, { name: 'm', label: 'Масса груза', min: 0.1, max: 5, step: 0.1, value: 1, unit: 'кг' }],
      invariants: [{ text: 'Период не зависит от массы груза' }],
    };
    const r = await checkCore({ core: GOOD_CORE, checks: '' }, withMass);
    expect(r.ok).toBe(true);
    const noInv = await checkCore({ core: GOOD_CORE, checks: '' }, { ...withMass, invariants: [] });
    expect(noInv.failures.join()).toMatch(/Масса груза не меняют/);
    expect(noInv.hard).toEqual([]);
  }, 30000);
  it('NaN, мёртвый параметр и зависание ловятся', async () => {
    const nan = await checkCore({ core: GOOD_CORE.replace('s.th += s.w * dt', 's.th += s.w * dt / (p.L - 3)'), checks: '' }, PENDULUM);
    expect(nan.ok).toBe(false);
    expect(nan.failures.join()).toMatch(/конечны/);
    const dead = await checkCore({ core: GOOD_CORE.replace('(p.g / p.L)', '(9.8 / p.L)').replace('p.g * p.L', '9.8 * p.L'), checks: '' }, PENDULUM);
    expect(dead.failures.join()).toMatch(/g не меняют/);
    const hang = await checkCore({ core: GOOD_CORE.replace('s.t += dt;', 's.t += dt; while (true) {}'), checks: '' }, PENDULUM, { timeoutMs: 1500 });
    expect(hang.failures.join()).toMatch(/бесконечный цикл/);
  }, 30000);
});

describe('слои и сверка с планом', () => {
  it('lab даёт слои видов и сценария, demo — ни одного', () => {
    expect(planLayers(PENDULUM).map((l) => l.name)).toEqual(['views', 'scenario']);
    expect(planLayers({ ...PENDULUM, level: 'demo' })).toEqual([]);
  });
  it('нет слайдера параметра плана — провал сверки', () => {
    const report: RenderReport = { ok: true, errors: [], animated: true, screenshots: [],
      probes: { results: [], passRate: 1, failures: [], shots: [], controls: [{ kind: 'slider', name: 'L', label: 'Длина' }] } };
    expect(coverageFailures(PENDULUM, report).join()).toContain("name: 'g'");
  });
});

const okRender: RenderReport = { ok: true, errors: [], animated: true, screenshots: [Buffer.from('png')],
  probes: { results: [{ id: 'pause', label: 'Пауза', status: 'pass', detail: '' }], passRate: 1, failures: [], shots: [],
    controls: [{ kind: 'slider', name: 'L', label: 'Длина' }, { kind: 'slider', name: 'g', label: 'g' }] } };

describe('генерация по этапам', () => {
  it('ядро, основа на ядре, слои; план сохраняется', async () => {
    const events: PipelineEvent[] = [];
    const skeleton = EXAMPLE_SKELETON;
    const chat = vi.fn(async (role: Role, msgs: { content: unknown }[]) => {
      const sys = String(msgs[0].content);
      if (role === 'planner') return JSON.stringify(PENDULUM);
      if (role === 'critic') return '{"physicsOk": true, "issues": []}';
      if (role === 'judge') return '{"winnerIndex":0,"scores":[{"physics":9,"clarity":9,"interactivity":9,"aesthetics":9,"depth":9}],"feedback":""}';
      if (sys.includes('ЯДРО ФИЗИКИ')) return '```js\n' + GOOD_CORE + '\n```';
      if (sys.includes('достраиваешь')) return '```js\n// ==== @section views ====\nSimUI.chart({title:"ω(θ)", mode:"xy", series:[{name:"ω"}]});\n// ==== @end views ====\n```';
      return '```html\n' + skeleton + '\n```';
    });
    const ctx: Ctx = {
      chat: chat as unknown as Ctx['chat'], hasVision: true, emit: (e) => events.push(e),
      render: vi.fn(async () => okRender),
      checkCore: vi.fn(async () => ({ ok: true, results: [{ label: 'Ядро исполняется', ok: true, detail: '' }], failures: [], hard: [] })),
    };
    const meta = await runPipeline(ctx, { ownerId: OWNER, prompt: 'маятник', mode: 'standard' });
    const html = (await getArtifact(OWNER, meta.id))!;
    // Проверенное ядро стоит в артефакте дословно, слой views вставлен перед main.
    expect(getSection(html, 'physics')).toBe(GOOD_CORE);
    expect(listSections(html).map((s) => s.name)).toContain('views');
    expect(events.find((e) => e.type === 'physics-check')).toMatchObject({ ok: true });
    expect(events.filter((e) => e.type === 'layer').map((e) => e.type === 'layer' && `${e.name}:${e.status}`))
      .toEqual(['views:start', 'views:ok', 'scenario:start', 'scenario:ok']);
    expect((await getSpec(OWNER, meta.id))?.level).toBe('lab');
  });

  it('утверждённый план идёт без планировщика', async () => {
    const chat = vi.fn(async (role: Role) => (role === 'critic' ? '{"physicsOk":true,"issues":[]}' : '```html\n' + EXAMPLE_SKELETON + '\n```'));
    const ctx: Ctx = { chat: chat as unknown as Ctx['chat'], hasVision: false, emit: () => {}, render: vi.fn(async () => okRender) };
    await runPipeline(ctx, { ownerId: OWNER, prompt: 'маятник', mode: 'fast', spec: { ...PENDULUM, level: 'demo' } });
    expect(chat.mock.calls.filter((c) => c[0] === 'planner')).toHaveLength(0);
  });
});

describe('доработка v2', () => {
  it('настройки из ответа модели ложатся наложением, регрессия сообщается', async () => {
    const meta = await createSimulation(OWNER, { title: 't', prompt: 'p', subject: 's', tags: [] }, EXAMPLE_SKELETON);
    await saveSpec(OWNER, meta.id, PENDULUM);
    const events: PipelineEvent[] = [];
    const worse: RenderReport = { ...okRender, probes: { ...okRender.probes!, results: [{ id: 'pause', label: 'Пауза', status: 'fail', detail: 'не стоит' }] } };
    const renders = [okRender, worse, worse];
    const ctx: Ctx = {
      chat: vi.fn(async (role: Role) => role === 'refiner'
        ? JSON.stringify({ summary: 'Переименовал', changed: ['подпись'], skipped: [], next: [],
            config: { parameters: { g: { label: 'Гравитация' } } }, edits: [], sections: {} })
        : '```html\n' + EXAMPLE_SKELETON + '\n```') as unknown as Ctx['chat'],
      hasVision: false, emit: (e) => events.push(e),
      render: vi.fn(async () => renders.shift() ?? worse),
    };
    await refineExisting(ctx, OWNER, meta.id, 'назови g гравитацией');
    const html = (await getArtifact(OWNER, meta.id))!;
    expect(readConfig(html).parameters?.g?.label).toBe('Гравитация');
    expect(events.find((e) => e.type === 'regression')).toMatchObject({ lost: ['Пауза: не стоит'] });
    expect((await getSpec(OWNER, meta.id))?.parameters.find((p) => p.name === 'g')?.label).toBe('Гравитация');
  });

  it('разбор ответа доработки', () => {
    expect(parseRefinePatch('{"summary":"x"}')).toBeNull();
    expect(parseRefinePatch('{"sections":{"views":"a"},"edits":[{"find":"a","replace":"b"}],"config":{}}'))
      .toEqual({ config: null, edits: [{ find: 'a', replace: 'b' }], sections: { views: 'a' } });
  });

  it('потерянные пробы считаются только среди прошедших до правки', () => {
    const before: RenderReport = { ...okRender, probes: { ...okRender.probes!, results: [
      { id: 'pause', label: 'Пауза', status: 'pass', detail: '' }, { id: 'nan', label: 'NaN', status: 'fail', detail: 'x' }] } };
    const after: RenderReport = { ...okRender, probes: { ...okRender.probes!, results: [
      { id: 'pause', label: 'Пауза', status: 'fail', detail: 'y' }, { id: 'nan', label: 'NaN', status: 'fail', detail: 'x' }] } };
    expect(lostProbes(before, after)).toEqual(['Пауза: y']);
  });

  it('точка в превью превращается в пояснение к просьбе', () => {
    expect(pickNote({ x: 0.25, y: 0.5, target: 'панель «График»' })).toContain('25% от левого края, 50% от верха; там: панель «График»');
    expect(pickNote({ x: 2, y: 0 })).toBe('');
    expect(pickNote(null)).toBe('');
  });
});

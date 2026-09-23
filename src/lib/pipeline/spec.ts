import type {
  PlanSpec, SimLevel, SimParameter, PlanView, PlanStep, PlanPreset, PlanObservable, PlanEntity,
} from '../types';

/**
 * Спецификация — контракт для всех следующих этапов, поэтому её проверяет код, а не
 * модель: диапазоны параметров, уникальные имена, обязательные поля. Мелочи чиним
 * молча; то, что починить нельзя (нет ни одного параметра, пустая физика), уходит
 * списком в problems — вызывающий решает, переспрашивать ли планировщика.
 */

export const LEVELS: SimLevel[] = ['demo', 'lab', 'research'];

export const LEVEL_LABELS: Record<SimLevel, string> = {
  demo: 'Демонстрация',
  lab: 'Лаборатория',
  research: 'Исследование',
};

/** Объём работы по уровню: планировщик получает его как требование, код — как лимит. */
export const LEVEL_BUDGET: Record<SimLevel, { params: [number, number]; views: number; steps: number }> = {
  demo: { params: [2, 4], views: 1, steps: 0 },
  lab: { params: [3, 6], views: 3, steps: 3 },
  research: { params: [4, 8], views: 4, steps: 5 },
};

const VIEW_KINDS: PlanView['kind'][] = ['scene', 'chart', 'phase', 'table', 'formula', 'section'];

function str(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

/** Имя переменной для кода: латиница, цифры, подчёркивание; не с цифры. */
export function safeName(raw: string, fallback: string): string {
  const s = raw.replace(/[^A-Za-z0-9_]/g, '');
  if (!s) return fallback;
  return /^[0-9]/.test(s) ? `p${s}` : s;
}

export function isLevel(v: unknown): v is SimLevel {
  return typeof v === 'string' && (LEVELS as string[]).includes(v);
}

export function levelOf(spec: Pick<PlanSpec, 'level'>): SimLevel {
  return isLevel(spec.level) ? spec.level : 'demo';
}

/**
 * Скорость времени даёт прибор кита (SimUI.speed). Параметр с тем же смыслом в плане
 * задваивает её и уходит в физику множителем dt — так в прогоне планета улетала на
 * 195 а.е.: ядро честно интегрировало с шагом в десятки раз крупнее расчётного.
 */
export function isTimeScale(name: string, label: string): boolean {
  // Имя «speed» само по себе — обычная скорость частиц, его не трогаем: только явные имена.
  return /^(timescale|timespeed|simspeed|timefactor|timewarp)$/i.test(name) ||
    /(скорость|ускорение|масштаб|темп)\s+(времени|симуляции)/i.test(label);
}

function normParameter(raw: unknown, i: number, used: Set<string>): SimParameter | null {
  const o = obj(raw);
  if (!o) return null;
  if (isTimeScale(str(o.name, 40), str(o.label, 60))) return null;
  let name = safeName(str(o.name, 40), `param${i + 1}`);
  while (used.has(name)) name = `${name}_${i + 1}`;
  let min = num(o.min);
  let max = num(o.max);
  let value = num(o.value);
  if (min === null && max === null) return null;
  if (min === null) min = 0;
  if (max === null) max = min + 1;
  if (min > max) [min, max] = [max, min];
  if (min === max) max = min + 1;
  if (value === null || value < min || value > max) value = value === null ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  let step = num(o.step);
  if (step === null || step <= 0 || step > max - min) {
    const span = max - min;
    step = Number((span / 100).toPrecision(1));
    if (!(step > 0)) step = span / 100;
  }
  used.add(name);
  const p: SimParameter = {
    name, label: str(o.label, 60) || name, min, max, step, value, unit: str(o.unit, 20),
  };
  const group = str(o.group, 40);
  if (group) p.group = group;
  return p;
}

export interface NormalizedSpec {
  spec: PlanSpec;
  /** Что починить нельзя — повод переспросить планировщика. */
  problems: string[];
}

export function normalizeSpec(raw: unknown, fallback: { level?: SimLevel } = {}): NormalizedSpec {
  const o = obj(raw) ?? {};
  const problems: string[] = [];
  const level: SimLevel = isLevel(o.level) ? o.level : (fallback.level ?? 'demo');
  const budget = LEVEL_BUDGET[level];

  const used = new Set<string>();
  const parameters = arr(o.parameters)
    .map((p, i) => normParameter(p, i, used))
    .filter((p): p is SimParameter => p !== null)
    .slice(0, budget.params[1] + 2);
  if (parameters.length === 0) problems.push('нет ни одного параметра со слайдером');

  const physics = str(o.physics, 4000);
  if (!physics) problems.push('пустое описание физической модели (physics)');

  const learningGoals = arr(o.learningGoals).map((g) => str(g, 200)).filter(Boolean).slice(0, 6);
  if (learningGoals.length === 0) problems.push('нет целей обучения (learningGoals)');

  const spec: PlanSpec = {
    title: str(o.title, 120) || 'Симуляция',
    subject: str(o.subject, 60) || 'Физика',
    mode: o.mode === '3d' ? '3d' : '2d',
    learningGoals,
    physics,
    parameters,
    visualPlan: str(o.visualPlan, 3000),
    level,
  };

  const audience = str(o.audience, 80);
  if (audience) spec.audience = audience;
  const wow = str(o.wowMoment, 300);
  if (wow) spec.wowMoment = wow;

  const entities = arr(o.entities).map(obj).filter(Boolean).map((e): PlanEntity => ({
    name: str(e!.name, 60), role: str(e!.role, 200),
  })).filter((e) => e.name).slice(0, 12);
  if (entities.length) spec.entities = entities;

  const observables = arr(o.observables).map(obj).filter(Boolean).map((e, i): PlanObservable => ({
    name: safeName(str(e!.name, 40), `obs${i + 1}`), label: str(e!.label, 60), unit: str(e!.unit, 20),
  })).filter((e) => e.label).slice(0, 10);
  if (observables.length) spec.observables = observables;

  const views = arr(o.views).map(obj).filter(Boolean).map((v): PlanView => ({
    kind: (VIEW_KINDS as string[]).includes(str(v!.kind)) ? str(v!.kind) as PlanView['kind'] : 'chart',
    title: str(v!.title, 80), what: str(v!.what, 300),
  })).filter((v) => v.title).slice(0, budget.views + 2);
  if (views.length) spec.views = views;

  const invariants = arr(o.invariants).map((v) => {
    const t = typeof v === 'string' ? v : str(obj(v)?.text);
    return str(t, 300);
  }).filter(Boolean).slice(0, 6).map((text) => ({ text }));
  if (invariants.length) spec.invariants = invariants;

  const scenario = arr(o.scenario).map(obj).filter(Boolean).map((s): PlanStep => {
    const step: PlanStep = { title: str(s!.title, 80), task: str(s!.task, 400) };
    const expect = str(s!.expect, 300);
    if (expect) step.expect = expect;
    return step;
  }).filter((s) => s.title && s.task).slice(0, Math.max(budget.steps, 0) + 2);
  if (scenario.length && level !== 'demo') spec.scenario = scenario;

  const names = new Set(parameters.map((p) => p.name));
  const presets = arr(o.presets).map(obj).filter(Boolean).map((p): PlanPreset | null => {
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj(p!.values) ?? {})) {
      const n = num(v);
      if (names.has(k) && n !== null) values[k] = n;
    }
    const label = str(p!.label, 40);
    return label && Object.keys(values).length ? { label, values } : null;
  }).filter((p): p is PlanPreset => p !== null).slice(0, 6);
  if (presets.length) spec.presets = presets;

  if (level !== 'demo' && !spec.scenario?.length) problems.push('для лаборатории и исследования нужен сценарий (scenario)');

  return { spec, problems };
}

/** Короткая сводка для ленты и карточки плана. */
export function describeSpec(spec: PlanSpec): string {
  const parts = [
    `${spec.parameters.length} парам.`,
    spec.views?.length ? `${spec.views.length} вида` : '',
    spec.scenario?.length ? `${spec.scenario.length} шагов урока` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

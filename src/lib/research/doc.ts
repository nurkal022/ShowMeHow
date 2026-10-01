import { compile, freeVars, parse, type Scope } from './expr';
import { confidenceBand, fit, fitCurve, FitError, residuals, type FitModelKey, type FitResult } from './fit';
import { parseTable, type DataTable } from './data';
import { parseEquation, solveOde } from './ode';
import { previewSize } from './journals';
import { plotPalette, renderPlot, sample, type PlotArrow, type PlotCurve, type PlotSeries, type PlotSpec, type PlotStyle } from './plot';
import { directionField, paddedExtent, planarField, trajectoryArrows } from './phase';
import { translator } from '@/i18n/core';
import { localizeMessage } from '@/i18n/catalog';
import type { Locale } from '@/i18n/config';
import { researchFigure } from '@/i18n/messages/research-figure';

const tf = (locale: Locale) => translator(researchFigure, locale);

/**
 * Документы исследователя — то, что хранится в research_items.doc (jsonb).
 * Модуль без базы и без DOM: его зовут редактор, публичная страница и тесты.
 * Из документа детерминированно получается картинка — сохранять SVG не нужно.
 */

export type ResearchKind = 'plot' | 'model' | 'sim';

export interface FigureOptions {
  title: string;
  xLabel: string;
  yLabel: string;
  xLog: boolean;
  yLog: boolean;
  style: PlotStyle;
  grid: boolean;
  /** Для чего рисунок: '' — экран, иначе пресет журнала/слайда/постера («elsevier:single»). */
  size?: string;
}

export interface PlotSeriesDoc {
  y: number;
  /** Столбец погрешностей y или null. */
  err: number | null;
  label: string;
  mode: PlotSeries['mode'];
  fit: { model: FitModelKey; expr?: string } | null;
}

export interface PlotDoc extends FigureOptions {
  /** Таблица как её вставили — чтобы человек мог поправить число руками. */
  data: string;
  x: number;
  series: PlotSeriesDoc[];
  /** Строки таблицы (с нуля, без заголовка), исключённые как выбросы: не участвуют в подгонке, рисуются полыми. */
  excluded?: number[];
  /** Показывать под графиком остатки аппроксимации. */
  residuals?: boolean;
  /** Рисовать 95%-полосу доверия вокруг кривой аппроксимации. */
  band?: boolean;
  /** Подписи на рисунке: точка данных и текст со стрелкой. */
  annotations?: { x: number; y: number; text: string }[];
}

/** hint — смысл и единицы параметра («сопротивление, кОм»): подпись у слайдера. */
export interface ModelParam { name: string; value: number; min: number; max: number; hint?: string }

export interface ModelDoc extends FigureOptions {
  mode: 'function' | 'ode';
  /** function: «y = a*sin(b*x)» по строке на кривую; ode: «x' = …» по строке на уравнение. */
  lines: string[];
  params: ModelParam[];
  from: number;
  to: number;
  /** Начальные условия ОДУ. */
  initial: Record<string, number>;
  /** Точки эксперимента поверх модели: таблица и столбцы. */
  data: string;
  dataX: number;
  dataY: number | null;
  /** Вид: зависимость от времени/аргумента или фазовый портрет (для ОДУ из двух и более уравнений). */
  view?: 'time' | 'phase';
  /** Оси фазового портрета — имена переменных ОДУ. */
  phaseX?: string;
  phaseY?: string;
  /** «Зафиксированные» наборы параметров — сравнение сценариев поверх текущей кривой. */
  snapshots?: { label: string; values: Record<string, number> }[];
  /** Ключ модели из галереи, если она оттуда. */
  template?: string;
  /** Подписи переменных ОДУ с единицами («θ, рад»): легенда и оси фазового портрета. */
  varLabels?: Record<string, string>;
}

export interface SimDoc { simulationId: string }

export type ResearchDoc = PlotDoc | ModelDoc | SimDoc;

const FIGURE_DEFAULTS: FigureOptions = { title: '', xLabel: 'x', yLabel: 'y', xLog: false, yLog: false, style: 'screen', grid: true };

export const SAMPLE_DATA = `t, с\tU, В\tσU, В
0\t9.92\t0.15
0.5\t6.08\t0.12
1\t3.61\t0.1
1.5\t2.27\t0.08
2\t1.33\t0.06
2.5\t0.83\t0.05
3\t0.49\t0.05
3.5\t0.31\t0.04
4\t0.18\t0.04`;

export function newPlotDoc(locale: Locale = 'ru'): PlotDoc {
  const t = tf(locale);
  const data = locale === 'ru' ? SAMPLE_DATA
    : SAMPLE_DATA.replace(/^[^\n]*/, [t('sampleT'), t('sampleU'), t('sampleSigmaU')].join('\t'));
  return {
    ...FIGURE_DEFAULTS, title: t('samplePlotTitle'), xLabel: t('sampleT'), yLabel: t('sampleU'),
    data, x: 0,
    series: [{ y: 1, err: 2, label: t('experiment'), mode: 'markers', fit: { model: 'exp' } }],
  };
}

export function newModelDoc(mode: 'function' | 'ode' = 'function', locale: Locale = 'ru'): ModelDoc {
  const t = tf(locale);
  if (mode === 'ode') {
    return {
      ...FIGURE_DEFAULTS, title: t('sampleOdeTitle'), xLabel: 't', yLabel: t('sampleOdeY'),
      mode, lines: ["x' = a*x - b*x*y", "y' = -c*y + d*x*y"],
      params: [
        { name: 'a', value: 1.1, min: 0, max: 3 }, { name: 'b', value: 0.4, min: 0, max: 2 },
        { name: 'c', value: 0.4, min: 0, max: 2 }, { name: 'd', value: 0.1, min: 0, max: 1 },
      ],
      from: 0, to: 50, initial: { x: 10, y: 10 }, data: '', dataX: 0, dataY: null,
    };
  }
  return {
    ...FIGURE_DEFAULTS, title: t('sampleFnTitle'), xLabel: 't', yLabel: 'x(t)',
    mode, lines: ['x = A*exp(-g*t)*cos(w*t)', `${t('sampleEnvelope')} = A*exp(-g*t)`],
    params: [
      { name: 'A', value: 1, min: 0, max: 2 }, { name: 'g', value: 0.3, min: 0, max: 2 },
      { name: 'w', value: 4, min: 0.5, max: 12 },
    ],
    from: 0, to: 10, initial: {}, data: '', dataX: 0, dataY: null,
  };
}

/* ----------------------------------- графики из данных ----------------------------------- */

export interface BuiltFigure {
  spec: PlotSpec;
  fits: (FitResult | null)[];
  errors: string[];
  table: DataTable | null;
  /** Графики остатков по сериям с аппроксимацией (если включены). */
  residualSpecs?: PlotSpec[];
}

export function buildPlot(doc: PlotDoc, locale: Locale = 'ru'): BuiltFigure {
  const t = tf(locale);
  const table = parseTable(doc.data, locale);
  const errors: string[] = [];
  const xs = table.columns[doc.x] ?? [];
  const excluded = new Set(doc.excluded ?? []);
  const series: PlotSeries[] = [];
  const curves: PlotCurve[] = [];
  const bands: NonNullable<PlotSpec['bands']> = [];
  const residualSpecs: PlotSpec[] = [];
  const fits: (FitResult | null)[] = [];
  doc.series.forEach((s, si) => {
    const ys = table.columns[s.y] ?? [];
    const errs = s.err !== null ? table.columns[s.err] ?? [] : [];
    series.push({
      label: s.label || table.headers[s.y] || t('data'), mode: s.mode,
      points: xs.map((x, i) => ({ x, y: ys[i], row: i, muted: excluded.has(i), err: Number.isFinite(errs[i]) ? Math.abs(errs[i]) : undefined })),
    });
    if (!s.fit) { fits.push(null); return; }
    // Выбросы не участвуют в подгонке, но остаются на рисунке — честно и наглядно.
    const keep = xs.map((_, i) => !excluded.has(i));
    const fx = xs.filter((_, i) => keep[i]);
    const fy = ys.filter((_, i) => keep[i]);
    const fe = errs.length ? errs.filter((_, i) => keep[i]).map((e) => (Number.isFinite(e) ? Math.abs(e) : null)) : undefined;
    try {
      const r = fit({ xs: fx, ys: fy, sigma: fe, model: s.fit.model, expr: s.fit.expr });
      fits.push(r);
      const finite = xs.filter((x) => Number.isFinite(x) && (!doc.xLog || x > 0));
      if (finite.length) {
        const lo = Math.min(...finite);
        const hi = Math.max(...finite);
        // В журнальном рисунке R² уходит в подпись: в узкой колонке легенда должна быть короткой.
        curves.push({ label: doc.size ? t('fit') : t('fitR2', { r2: r.r2.toFixed(4) }), points: sample(fitCurve(r), lo, hi, 400, doc.xLog) });
        if (doc.band) bands.push({ points: confidenceBand(r, sample(() => 0, lo, hi, 120, doc.xLog).map((p) => p.x)) });
      }
      if (doc.residuals) {
        residualSpecs.push({
          ...figure(doc), title: doc.series.length > 1 ? t('residualsOf', { label: s.label || t('seriesN', { n: si + 1 }) }) : '', yLabel: t('residual'), yLog: false, grid: true, hline: 0,
          series: [{ label: t('residuals'), mode: 'markers', points: residuals(r, fx, fy).map((p) => ({ x: p.x, y: p.r })) }],
        });
      }
    } catch (e) {
      fits.push(null);
      errors.push(`${s.label || t('series')}: ${localizeMessage(e instanceof FitError || e instanceof Error ? e.message : String(e), locale)}`);
    }
  });
  return {
    spec: { ...figure(doc), series, curves, bands, annotations: doc.annotations ?? [] },
    fits, errors, table, residualSpecs,
  };
}

/* ---------------------------------------- модели ---------------------------------------- */

/** Параметры модели: имена из формул минус переменные; прежние значения и пределы сохраняются. */
export function modelParams(doc: Pick<ModelDoc, 'mode' | 'lines' | 'params'>): { params: ModelParam[]; error: string | null } {
  const names = new Set<string>();
  const bound = new Set<string>([doc.mode === 'ode' ? 't' : 'x']);
  try {
    const parsed = doc.lines.filter((l) => l.trim()).map((l) => {
      if (doc.mode === 'ode') {
        const eq = parseEquation(l);
        bound.add(eq.name);
        return parse(eq.rhs);
      }
      const { name, rhs } = splitFunctionLine(l);
      // Переменная — x, если она есть в формуле, иначе t: «x = A*cos(w*t)».
      if (name) bound.add(name);
      return parse(rhs);
    });
    const indep = doc.mode === 'function' ? functionVar(parsed.flatMap((n) => [...freeVars(n)])) : 't';
    bound.add(indep);
    parsed.forEach((n) => freeVars(n).forEach((v) => { if (!bound.has(v)) names.add(v); }));
  } catch (e) {
    return { params: doc.params, error: e instanceof Error ? e.message : String(e) };
  }
  const known = new Map(doc.params.map((p) => [p.name, p]));
  return { params: [...names].map((n) => known.get(n) ?? { name: n, value: 1, min: 0, max: 10 }), error: null };
}

function functionVar(vars: string[]): string {
  if (vars.includes('x')) return 'x';
  if (vars.includes('t')) return 't';
  return 'x';
}

export function splitFunctionLine(line: string): { name: string | null; rhs: string } {
  const m = /^\s*([^=]+?)\s*=\s*(.+)$/.exec(line);
  if (!m) return { name: null, rhs: line.trim() };
  // «y(x) = …» → имя «y».
  return { name: m[1].replace(/\(.*\)$/, '').trim(), rhs: m[2].trim() };
}

/** Сколько сценариев можно зафиксировать: больше — и рисунок уже не читается. */
export const MAX_SNAPSHOTS = 4;

export interface ModelFigure extends BuiltFigure {
  /** Вид, который реально нарисован: фазовый — только для ОДУ из двух и более уравнений. */
  view: 'time' | 'phase';
  /** Оси фазового портрета (имена переменных), если он нарисован. */
  phaseAxes: [string, string] | null;
  /** Нарисовано ли поле направлений. */
  field: boolean;
  /** Текущие кривые без сценариев — по ним ходит анимированная точка. */
  current: PlotCurve[];
  /** Для фазового портрета — время каждой точки траектории (для подписи при анимации). */
  times: number[] | null;
  /** Цвета сценариев по порядку — для «чипов» в редакторе. */
  snapshotColors: string[];
}

/** Имена переменных ОДУ по строкам; битая строка — пропускаем (ошибку покажет buildModel). */
export function odeVarNames(doc: Pick<ModelDoc, 'mode' | 'lines'>): string[] {
  if (doc.mode !== 'ode') return [];
  return doc.lines.filter((l) => l.trim()).flatMap((l) => { try { return [parseEquation(l).name]; } catch { return []; } });
}

/** Оси фазового портрета: выбранные, если они есть в системе, иначе первые две переменные. */
export function phaseAxes(doc: Pick<ModelDoc, 'mode' | 'lines' | 'phaseX' | 'phaseY'>): [string, string] | null {
  const names = odeVarNames(doc);
  if (names.length < 2) return null;
  const x = doc.phaseX && names.includes(doc.phaseX) ? doc.phaseX : names[0];
  const y = doc.phaseY && names.includes(doc.phaseY) && doc.phaseY !== x ? doc.phaseY : names.find((n) => n !== x)!;
  return [x, y];
}

/** Подпись сценария по умолчанию: «a=1.1, b=0.4» (до трёх параметров). */
export function snapshotLabel(values: Record<string, number>, locale: Locale = 'ru'): string {
  const parts = Object.entries(values).map(([k, v]) => `${k}=${Number(v.toPrecision(3))}`);
  return parts.length > 3 ? `${parts.slice(0, 3).join(', ')}…` : parts.join(', ') || tf(locale)('scenario');
}

type ModelRun =
  | { kind: 'ode'; names: string[]; t: number[]; series: Record<string, number[]>; diverged: boolean }
  | { kind: 'function'; curves: PlotCurve[] };

/** Один расчёт модели при заданных параметрах — общий для текущей кривой и сценариев. */
function runModel(doc: ModelDoc, scope: Scope): ModelRun {
  const lines = doc.lines.filter((l) => l.trim());
  if (doc.mode === 'ode') {
    const equations = lines.map(parseEquation);
    const sol = solveOde({ equations, initial: doc.initial, params: scope, t0: doc.from, t1: doc.to, steps: 2000 });
    return { kind: 'ode', names: equations.map((e) => e.name), ...sol };
  }
  const compiled = lines.map((l) => {
    const { name, rhs } = splitFunctionLine(l);
    return { name: name ?? rhs, ...compile(rhs) };
  });
  const indep = functionVar(compiled.flatMap((c) => c.vars));
  return {
    kind: 'function',
    curves: compiled.map((c, i) => ({
      label: c.name, dashed: i > 0 && compiled.length > 1 && /огиб|орауыш|envelope|asympt|асимпт|уровень|деңгей|level/i.test(c.name),
      points: sample((x) => c.fn({ ...scope, [indep]: x }), doc.from, doc.to, 600, doc.xLog),
    })),
  };
}

export function buildModel(doc: ModelDoc, values?: Scope, locale: Locale = 'ru'): ModelFigure {
  const t = tf(locale);
  const scope: Scope = {};
  doc.params.forEach((p) => { scope[p.name] = values?.[p.name] ?? p.value; });
  const errors: string[] = [];
  const hasData = !!doc.data.trim() && doc.dataY !== null;
  const axes = doc.view === 'phase' ? phaseAxes(doc) : null;
  const label = (n: string) => doc.varLabels?.[n] || n;
  const palette = plotPalette(doc.style);
  const snaps = (doc.snapshots ?? []).slice(0, MAX_SNAPSHOTS);

  /** Кривые одного расчёта в выбранном виде. */
  const toCurves = (run: ModelRun): PlotCurve[] => {
    if (run.kind === 'function') return run.curves;
    if (axes) {
      const [px, py] = axes;
      return [{ label: t('trajectory'), points: run.t.map((_, i) => ({ x: run.series[px][i], y: run.series[py][i] })) }];
    }
    return run.names.map((n) => ({ label: label(n), points: run.t.map((t, i) => ({ x: t, y: run.series[n][i] })) }));
  };

  let current: PlotCurve[] = [];
  let times: number[] | null = null;
  const snapCurves: PlotCurve[] = [];
  const snapshotColors: string[] = [];
  try {
    const run = runModel(doc, scope);
    current = toCurves(run);
    if (run.kind === 'ode') {
      if (axes) times = run.t;
      if (run.diverged) errors.push(t('diverged'));
    }
    // Сценарии: те же формулы при зафиксированных значениях; цвет — следующий после текущих кривых.
    snaps.forEach((s, k) => {
      const color = palette[((hasData && !axes ? 1 : 0) + current.length + k) % palette.length];
      snapshotColors.push(color);
      const sScope: Scope = { ...scope };
      doc.params.forEach((p) => { if (Number.isFinite(s.values[p.name])) sScope[p.name] = s.values[p.name]; });
      try {
        toCurves(runModel(doc, sScope)).forEach((c) => snapCurves.push({
          ...c, color, dashed: true, opacity: 0.8,
          label: current.length > 1 ? `${c.label} · ${s.label}` : s.label,
        }));
      } catch { /* сценарий с битыми значениями просто не рисуем */ }
    });
  } catch (e) {
    errors.push(localizeMessage(e instanceof Error ? e.message : String(e), locale));
  }

  const series: PlotSeries[] = [];
  let table: DataTable | null = null;
  // Точки эксперимента — это y(t), на фазовой плоскости им не место.
  if (hasData && !axes) {
    table = parseTable(doc.data, locale);
    const xs = table.columns[doc.dataX] ?? [];
    const ys = table.columns[doc.dataY!] ?? [];
    series.push({ label: table.headers[doc.dataY!] ?? t('experiment'), mode: 'markers', points: xs.map((x, i) => ({ x, y: ys[i] })) });
  }
  // Текущие кривые — первыми (и в легенде), сценарии — пунктиром следом.
  const curves = [...current, ...snapCurves];
  const base = { fits: [], errors, table, current, times, snapshotColors };
  if (!axes) {
    // Цвет явно: по нему редактор красит бегущие точки анимации.
    current.forEach((c, i) => { if (!c.color) c.color = palette[(series.length + i) % palette.length]; });
    return { ...base, spec: { ...figure(doc), series, curves }, view: 'time', phaseAxes: null, field: false };
  }

  const [px, py] = axes;
  const all = curves.flatMap((c) => c.points);
  const xRange = paddedExtent(all.map((p) => p.x));
  const yRange = paddedExtent(all.map((p) => p.y));
  const color = palette[0];
  current.forEach((c) => { c.color = color; });
  const arrows: PlotArrow[] = [];
  let field = false;
  try {
    const f = planarField(doc.lines.filter((l) => l.trim()).map(parseEquation), px, py, scope);
    if (f) { field = true; directionField(f, xRange, yRange).forEach((a) => arrows.push(a)); }
  } catch { /* без поля направлений */ }
  if (current[0]) trajectoryArrows(current[0].points, xRange, yRange).forEach((a) => arrows.push({ ...a, kind: 'head', color }));
  const start = current[0]?.points.find((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const spec: PlotSpec = {
    ...figure(doc), xLabel: label(px), yLabel: label(py), xLog: false, yLog: false,
    series, curves, xRange, yRange, arrows,
    // Начало траектории — кружок: без него не понять, откуда система стартовала.
    overlay: start ? (X, Y) => `<circle cx="${X(start.x).toFixed(2)}" cy="${Y(start.y).toFixed(2)}" r="5" fill="#ffffff" stroke="${color}" stroke-width="2.2"/>` : undefined,
  };
  return { ...base, spec, view: 'phase', phaseAxes: axes, field };
}

function figure(o: FigureOptions): Omit<PlotSpec, 'series'> {
  return { title: o.title, xLabel: o.xLabel, yLabel: o.yLabel, xLog: o.xLog, yLog: o.yLog, style: o.style, grid: o.grid };
}

/** Картинка документа целиком — для карточек и публичной страницы. */
export function renderDoc(kind: ResearchKind, doc: unknown, opts: { width?: number; height?: number; clipId?: string } = {}, locale: Locale = 'ru'): string | null {
  try {
    const dims = previewSize((doc as { size?: string }).size);
    if (kind === 'plot') return renderPlot({ ...buildPlot(doc as PlotDoc, locale).spec, ...dims, ...opts });
    if (kind === 'model') return renderPlot({ ...buildModel(doc as ModelDoc, undefined, locale).spec, ...dims, ...opts });
  } catch { /* битый документ — карточка без превью, страница не падает */ }
  return null;
}

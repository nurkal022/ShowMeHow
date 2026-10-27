import { checkExpr, compile } from '../research/expr';
import { renderPlot, sample } from '../research/plot';

/**
 * Живой график в ответе наставника: формулы от x и параметры-ползунки.
 * Модель присылает только описание — рисует наш движок графиков, поэтому
 * чужой код в страницу не попадает. Модуль чистый: сервер проверяет, браузер рисует.
 */

export interface TutorPlotParam { name: string; label: string; min: number; max: number; value: number }
/**
 * Отметки доски: координаты — выражения от параметров, поэтому точка «едет» вместе с ползунком.
 * step — на каком шаге разбора отметка появляется (1 — сразу).
 */
export type TutorMark =
  | { type: 'point'; x: string; y: string; label: string; step: number }
  | { type: 'segment'; x: string; y: string; x2: string; y2: string; label: string; arrow: boolean; step: number }
  | { type: 'vline'; x: string; label: string; step: number }
  | { type: 'hline'; y: string; label: string; step: number };
export interface TutorPlot {
  title: string; xLabel: string; yLabel: string;
  x: [number, number];
  curves: { label: string; expr: string; step: number }[];
  params: TutorPlotParam[];
  marks: TutorMark[];
  /** Подписи шагов разбора: «Шаг 2: вот где скорость обнуляется». Пусто — всё видно сразу. */
  steps: string[];
}

const MAX_STEPS = 6;

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const NAME = /^[A-Za-zα-ωΑ-Ω_][A-Za-zα-ωΑ-Ω_0-9]{0,15}$/;

/** Описание от модели → проверенный график или null, если что-то не так: лучше без графика, чем с битым. */
export function parseTutorPlot(raw: unknown): TutorPlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const x = Array.isArray(r.x) ? r.x.map(num) : [];
  if (x.length !== 2 || x[0] === null || x[1] === null || !(x[1] > x[0])) return null;

  const params: TutorPlotParam[] = [];
  for (const p of (Array.isArray(r.params) ? r.params : []).slice(0, 4)) {
    const q = p && typeof p === 'object' ? p as Record<string, unknown> : {};
    const name = clip(q.name, 16);
    const [min, max, value] = [num(q.min), num(q.max), num(q.value)];
    if (!NAME.test(name) || name === 'x' || min === null || max === null || value === null || !(max > min)) return null;
    params.push({ name, label: clip(q.label, 40) || name, min, max, value: Math.min(max, Math.max(min, value)) });
  }

  const known = new Set(['x', ...params.map((p) => p.name)]);
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((v) => clip(v, 160)).filter(Boolean).slice(0, MAX_STEPS);
  const stepOf = (v: unknown) => Math.min(Math.max(steps.length, 1), Math.max(1, Math.round(num(v) ?? 1)));
  const curves: TutorPlot['curves'] = [];
  for (const c of (Array.isArray(r.curves) ? r.curves : []).slice(0, 3)) {
    const q = c && typeof c === 'object' ? c as Record<string, unknown> : {};
    const expr = clip(q.expr, 200);
    if (!expr || checkExpr(expr)) return null;
    if (compile(expr).vars.some((v) => !known.has(v))) return null;
    curves.push({ label: clip(q.label, 40), expr, step: stepOf(q.step) });
  }
  if (!curves.length) return null;

  // Координата отметки: число или выражение от параметров (без x — отметка не кривая).
  const coord = (v: unknown): string | null => {
    const e = typeof v === 'number' && Number.isFinite(v) ? String(v) : clip(v, 120);
    if (!e || checkExpr(e)) return null;
    return compile(e).vars.every((n) => n !== 'x' && known.has(n)) ? e : null;
  };
  const marks: TutorMark[] = [];
  for (const m of (Array.isArray(r.marks) ? r.marks : []).slice(0, 8)) {
    const q = m && typeof m === 'object' ? m as Record<string, unknown> : {};
    const label = clip(q.label, 40);
    const step = stepOf(q.step);
    const [mx, my, mx2, my2] = [coord(q.x), coord(q.y), coord(q.x2), coord(q.y2)];
    if (q.type === 'point' && mx && my) marks.push({ type: 'point', x: mx, y: my, label, step });
    else if (q.type === 'segment' && mx && my && mx2 && my2) marks.push({ type: 'segment', x: mx, y: my, x2: mx2, y2: my2, label, arrow: q.arrow === true, step });
    else if (q.type === 'vline' && mx) marks.push({ type: 'vline', x: mx, label, step });
    else if (q.type === 'hline' && my) marks.push({ type: 'hline', y: my, label, step });
  }

  const plot: TutorPlot = {
    title: clip(r.title, 80), xLabel: clip(r.xLabel, 40), yLabel: clip(r.yLabel, 40),
    x: [x[0], x[1]], curves, params, marks, steps: steps.length > 1 ? steps : [],
  };
  // Кривая, у которой при стартовых значениях нет ни одной конечной точки, — ошибка модели.
  return plotCurves(plot, startValues(plot)).every((c) => c.points.some((p) => Number.isFinite(p.y))) ? plot : null;
}

export function startValues(plot: TutorPlot): Record<string, number> {
  return Object.fromEntries(plot.params.map((p) => [p.name, p.value]));
}

/** Сколько шагов у разбора; 1 — показывать всё сразу. */
export function stepCount(plot: TutorPlot): number {
  return Math.max(1, plot.steps.length);
}

function plotCurves(plot: TutorPlot, values: Record<string, number>, upTo = Infinity) {
  return plot.curves.filter((c) => (c.step ?? 1) <= upTo).map((c) => {
    const { fn } = compile(c.expr);
    return { label: c.label, points: sample((x) => fn({ ...values, x }), plot.x[0], plot.x[1], 240) };
  });
}

const at = (expr: string, values: Record<string, number>) => {
  const v = compile(expr).fn(values);
  return Number.isFinite(v) ? v : null;
};
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Диапазон по y: по всем кривым (без выбросов у асимптот) и отметкам, с полями. Он общий для всех шагов — доска не «прыгает». */
function yRangeOf(plot: TutorPlot, values: Record<string, number>): [number, number] {
  const ys = plotCurves(plot, values).flatMap((c) => c.points.map((p) => p.y)).filter(Number.isFinite).sort((a, b) => a - b);
  const markYs = plot.marks.flatMap((m) => (m.type === 'point' || m.type === 'hline' ? [m.y] : m.type === 'segment' ? [m.y, m.y2] : []))
    .map((e) => at(e, values)).filter((v): v is number => v !== null);
  const q = (p: number) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(p * (ys.length - 1))))];
  const all = [...(ys.length ? [q(0.02), q(0.98)] : []), ...markYs];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-1, 1];
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

/** upTo — до какого шага видно; freshStep — отметки этого шага только что открыты и появляются с анимацией. */
export function tutorPlotSvg(plot: TutorPlot, values: Record<string, number>, clipId: string, upTo = Infinity, freshStep = 0): string {
  const [y0, y1] = yRangeOf(plot, values);
  const ink = '#7c3aed';
  const fresh = (m: TutorMark, svg: string) => (svg ? `<g class="tp-mark${m.step === freshStep ? ' tp-new' : ''}">${svg}</g>` : '');
  const overlay = (X: (v: number) => number, Y: (v: number) => number) => plot.marks.filter((m) => m.step <= upTo).map((m) => fresh(m, (() => {
    const tag = (x: number, y: number, dy = -8) => (m.label ? `<text x="${x + 6}" y="${y + dy}" fill="${ink}" font-weight="600">${escText(m.label)}</text>` : '');
    if (m.type === 'point') {
      const x = at(m.x, values), y = at(m.y, values);
      if (x === null || y === null) return '';
      return `<circle cx="${X(x)}" cy="${Y(y)}" r="4.5" fill="${ink}" stroke="#fff" stroke-width="1.5"/>${tag(X(x), Y(y))}`;
    }
    if (m.type === 'vline') {
      const x = at(m.x, values);
      return x === null ? '' : `<line x1="${X(x)}" x2="${X(x)}" y1="${Y(y0)}" y2="${Y(y1)}" stroke="${ink}" stroke-dasharray="5 4"/>${tag(X(x), Y(y1), 14)}`;
    }
    if (m.type === 'hline') {
      const y = at(m.y, values);
      return y === null ? '' : `<line x1="${X(plot.x[0])}" x2="${X(plot.x[1])}" y1="${Y(y)}" y2="${Y(y)}" stroke="${ink}" stroke-dasharray="5 4"/>${tag(X(plot.x[0]), Y(y), -6)}`;
    }
    const [x, y, x2, y2] = [at(m.x, values), at(m.y, values), at(m.x2, values), at(m.y2, values)];
    if (x === null || y === null || x2 === null || y2 === null) return '';
    const [a, b, c, d] = [X(x), Y(y), X(x2), Y(y2)];
    const len = Math.hypot(c - a, d - b) || 1;
    const [ux, uy] = [(c - a) / len, (d - b) / len];
    const head = m.arrow ? `<path d="M${c} ${d}L${c - 9 * ux + 4.5 * uy} ${d - 9 * uy - 4.5 * ux}L${c - 9 * ux - 4.5 * uy} ${d - 9 * uy + 4.5 * ux}Z" fill="${ink}"/>` : '';
    return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${ink}" stroke-width="2"/>${head}${tag((a + c) / 2, (b + d) / 2)}`;
  })())).join('');
  const curves = plotCurves(plot, values, upTo);
  return renderPlot({
    width: 420, height: 260, style: 'screen', grid: true, clipId,
    title: plot.title || undefined, xLabel: plot.xLabel || undefined, yLabel: plot.yLabel || undefined,
    legend: curves.length > 1, series: [], curves, xRange: plot.x, yRange: [y0, y1], overlay,
  });
}

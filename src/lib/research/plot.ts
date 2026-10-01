/**
 * Рисование научного графика в SVG — чистая функция от описания. Одна и та же
 * картинка показывается в редакторе, на публичной странице и уходит в экспорт
 * (SVG для статьи, PNG для слайда), поэтому цвета — литералы, без CSS-переменных:
 * файл должен выглядеть одинаково в Word, LaTeX и Inkscape.
 */

/** muted — точка исключена из подгонки (выброс): рисуется полой и серой, но остаётся видна. */
export interface PlotPoint { x: number; y: number; err?: number; muted?: boolean; row?: number }

export interface PlotSeries {
  label: string;
  points: PlotPoint[];
  mode: 'markers' | 'line' | 'both';
  color?: string;
}

export interface PlotCurve {
  label: string;
  points: { x: number; y: number }[];
  color?: string;
  dashed?: boolean;
  /** Прозрачность линии: сценарии для сравнения рисуются бледнее текущей кривой. */
  opacity?: number;
}

/**
 * Стрелка на поле: направление (dx, dy) — в единицах данных, длина — в пикселях.
 * field — тонкая стрелка поля направлений, head — наконечник на траектории.
 */
export interface PlotArrow { x: number; y: number; dx: number; dy: number; kind?: 'field' | 'head'; color?: string; len?: number; opacity?: number }

export type PlotStyle = 'screen' | 'paper' | 'talk';

export interface PlotSpec {
  width?: number;
  height?: number;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  xLog?: boolean;
  yLog?: boolean;
  style?: PlotStyle;
  grid?: boolean;
  legend?: boolean;
  series: PlotSeries[];
  curves?: PlotCurve[];
  xRange?: [number, number] | null;
  yRange?: [number, number] | null;
  /** id области обрезки: несколько графиков на одной странице не должны делить один clipPath. */
  clipId?: string;
  /** Полосы (например, 95%-доверия вокруг аппроксимации): заливка между lo и hi. */
  bands?: { points: { x: number; lo: number; hi: number }[]; color?: string }[];
  /** Подписи на рисунке: стрелка к точке данных и текст. */
  annotations?: { x: number; y: number; text: string }[];
  /** Горизонтальная линия (например, ноль на графике остатков). */
  hline?: number;
  /** Стрелки поверх поля: поле направлений и направление движения по траектории. */
  arrows?: PlotArrow[];
  /** Дополнительный SVG внутри области графика (маркеры и т. п.); X, Y переводят данные в пиксели. */
  overlay?: (X: (v: number) => number, Y: (v: number) => number) => string;
}

/** Палитра, различимая при дальтонизме (Okabe–Ito), — стандарт для журналов. */
export const PLOT_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#F0E442'];
const PAPER_COLORS = ['#000000', '#555555', '#0072B2', '#D55E00', '#009E73', '#888888'];

/** Палитра стиля — чтобы маркеры и подписи вне SVG совпадали по цвету с линиями. */
export const plotPalette = (style?: PlotStyle): string[] => (style === 'paper' ? PAPER_COLORS : PLOT_COLORS);

/** Цвет i-й кривой ровно так, как её раскрасит renderPlot. */
export function curveColor(spec: Pick<PlotSpec, 'style' | 'series' | 'curves'>, i: number): string {
  const palette = plotPalette(spec.style);
  return spec.curves?.[i]?.color || palette[(spec.series.length + i) % palette.length];
}
const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'cross'] as const;

const STYLES: Record<PlotStyle, { font: string; size: number; title: number; stroke: number; marker: number }> = {
  screen: { font: 'Onest, Helvetica, Arial, sans-serif', size: 12, title: 15, stroke: 2, marker: 3.6 },
  paper: { font: '"Times New Roman", Times, serif', size: 13, title: 14, stroke: 1.4, marker: 3.2 },
  talk: { font: 'Onest, Helvetica, Arial, sans-serif', size: 17, title: 21, stroke: 3, marker: 5 },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** «Красивые» деления оси: шаг 1, 2 или 5 × 10ⁿ. */
export function niceTicks(lo: number, hi: number, count = 6): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function fmtTick(v: number, step: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1).replace('e+', 'e');
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + (step / 10 ** Math.floor(Math.log10(step)) === 2.5 ? 1 : 0));
  return v.toFixed(Math.min(decimals, 6)).replace('-', '−');
}

function extent(values: number[], log: boolean): [number, number] {
  const v = values.filter((x) => Number.isFinite(x) && (!log || x > 0));
  if (v.length === 0) return log ? [1, 10] : [0, 1];
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (log) return [10 ** Math.floor(Math.log10(lo)), 10 ** Math.ceil(Math.log10(hi) + 1e-12)];
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.05;
  return [lo - pad, hi + pad];
}

function marker(shape: typeof MARKERS[number], x: number, y: number, r: number, color: string, filled: boolean): string {
  const fill = filled ? color : '#fff';
  const f = (n: number) => n.toFixed(2);
  switch (shape) {
    case 'circle': return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="1.2"/>`;
    case 'square': return `<rect x="${f(x - r)}" y="${f(y - r)}" width="${2 * r}" height="${2 * r}" fill="${fill}" stroke="${color}" stroke-width="1.2"/>`;
    case 'triangle': return `<path d="M${f(x)} ${f(y - r * 1.2)}L${f(x + r * 1.1)} ${f(y + r * 0.8)}L${f(x - r * 1.1)} ${f(y + r * 0.8)}Z" fill="${fill}" stroke="${color}" stroke-width="1.2"/>`;
    case 'diamond': return `<path d="M${f(x)} ${f(y - r * 1.3)}L${f(x + r)} ${f(y)}L${f(x)} ${f(y + r * 1.3)}L${f(x - r)} ${f(y)}Z" fill="${fill}" stroke="${color}" stroke-width="1.2"/>`;
    case 'cross': return `<path d="M${f(x - r)} ${f(y - r)}L${f(x + r)} ${f(y + r)}M${f(x + r)} ${f(y - r)}L${f(x - r)} ${f(y + r)}" stroke="${color}" stroke-width="1.6"/>`;
  }
}

export function renderPlot(spec: PlotSpec): string {
  const W = spec.width ?? 720;
  const H = spec.height ?? 460;
  const style = STYLES[spec.style ?? 'screen'];
  const paper = spec.style === 'paper';
  const palette = paper ? PAPER_COLORS : PLOT_COLORS;
  const curves = spec.curves ?? [];
  const showLegend = (spec.legend ?? true) && spec.series.length + curves.length > 1;

  const allX = [...spec.series.flatMap((s) => s.points.map((p) => p.x)), ...curves.flatMap((c) => c.points.map((p) => p.x))];
  const allY = [
    ...spec.series.flatMap((s) => s.points.flatMap((p) => (p.err ? [p.y - p.err, p.y + p.err] : [p.y]))),
    ...curves.flatMap((c) => c.points.map((p) => p.y)),
  ];
  const [x0, x1] = spec.xRange ?? extent(allX, !!spec.xLog);
  const [y0, y1] = spec.yRange ?? extent(allY, !!spec.yLog);

  const m = { l: style.size * 5.2, r: 18, t: spec.title ? style.title * 2.4 : 16, b: style.size * 3.8 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const tx = (v: number) => (spec.xLog ? Math.log10(v) : v);
  const ty = (v: number) => (spec.yLog ? Math.log10(v) : v);
  const X = (v: number) => m.l + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * pw;
  const Y = (v: number) => m.t + ph - ((ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * ph;
  const inside = (x: number, y: number) => Number.isFinite(x) && Number.isFinite(y)
    && (!spec.xLog || x > 0) && (!spec.yLog || y > 0);

  const clip = spec.clipId ?? 'plot-area';
  const ink = '#1a1a1e';
  const gridColor = '#e6e6e6';
  const out: string[] = [];
  // Карта координат поля — редактор по ней переводит клик мыши в значения данных (подписи, выбросы).
  const map = [m.l, m.t, pw, ph, x0, x1, y0, y1, spec.xLog ? 1 : 0, spec.yLog ? 1 : 0].map((v) => +Number(v).toPrecision(8)).join(',');
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${style.font}' font-size="${style.size}" data-map="${map}">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<defs><clipPath id="${clip}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>`);

  const xt = spec.xLog ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(3, Math.round(pw / 90)));
  const yt = spec.yLog ? logTicks(y0, y1) : niceTicks(y0, y1, Math.max(3, Math.round(ph / 60)));
  const xStep = xt.length > 1 ? xt[1] - xt[0] : 1;
  const yStep = yt.length > 1 ? yt[1] - yt[0] : 1;
  const label = (v: number, log: boolean, step: number) => (log ? `10^${Math.round(Math.log10(v))}` : fmtTick(v, step));

  if (spec.grid ?? !paper) {
    xt.forEach((v) => out.push(`<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${m.t + ph}" stroke="${gridColor}"/>`));
    yt.forEach((v) => out.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${gridColor}"/>`));
  }
  // Рамка вокруг поля — журнальный стиль; деления смотрят внутрь.
  out.push(`<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${ink}" stroke-width="1"/>`);
  xt.forEach((v) => {
    out.push(`<line x1="${X(v)}" x2="${X(v)}" y1="${m.t + ph}" y2="${m.t + ph - 5}" stroke="${ink}"/>`);
    out.push(`<text x="${X(v)}" y="${m.t + ph + style.size * 1.4}" text-anchor="middle" fill="${ink}">${esc(label(v, !!spec.xLog, xStep))}</text>`);
  });
  yt.forEach((v) => {
    out.push(`<line x1="${m.l}" x2="${m.l + 5}" y1="${Y(v)}" y2="${Y(v)}" stroke="${ink}"/>`);
    out.push(`<text x="${m.l - 7}" y="${Y(v) + style.size * 0.35}" text-anchor="end" fill="${ink}">${esc(label(v, !!spec.yLog, yStep))}</text>`);
  });
  if (spec.xLabel) out.push(`<text x="${m.l + pw / 2}" y="${H - style.size * 0.9}" text-anchor="middle" fill="${ink}">${esc(spec.xLabel)}</text>`);
  if (spec.yLabel) out.push(`<text transform="translate(${style.size * 1.3} ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" fill="${ink}">${esc(spec.yLabel)}</text>`);
  if (spec.title) out.push(`<text x="${m.l + pw / 2}" y="${style.title * 1.5}" text-anchor="middle" font-size="${style.title}" font-weight="600" fill="${ink}">${esc(spec.title)}</text>`);

  out.push(`<g clip-path="url(#${clip})">`);
  (spec.bands ?? []).forEach((b, i) => {
    const pts = b.points.filter((p) => inside(p.x, p.lo) && inside(p.x, p.hi));
    if (pts.length < 2) return;
    const color = b.color || palette[(spec.series.length + i) % palette.length];
    const d = `M${pts.map((p) => `${X(p.x).toFixed(2)} ${Y(p.hi).toFixed(2)}`).join('L')}L${[...pts].reverse().map((p) => `${X(p.x).toFixed(2)} ${Y(p.lo).toFixed(2)}`).join('L')}Z`;
    out.push(`<path d="${d}" fill="${color}" fill-opacity="0.16" stroke="none"/>`);
  });
  if (spec.hline !== undefined && inside(x0, spec.hline)) out.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(spec.hline)}" y2="${Y(spec.hline)}" stroke="#888" stroke-dasharray="4 3"/>`);
  // Стрелки: длина и наконечник — в пикселях, направление переводим из данных в экран,
  // иначе при разном масштабе осей поле направлений «врёт» (для лог-осей — приближённо).
  const drawArrows = (kind: 'field' | 'head') => (spec.arrows ?? []).forEach((a) => {
    if ((a.kind ?? 'field') !== kind || !inside(a.x, a.y)) return;
    const ux = (a.dx / (tx(x1) - tx(x0))) * pw;
    const uy = (-a.dy / (ty(y1) - ty(y0))) * ph;
    const n = Math.hypot(ux, uy);
    if (!(n > 0)) return;
    const ex = ux / n, ey = uy / n, px = X(a.x), py = Y(a.y);
    const f = (v: number) => v.toFixed(2);
    if (kind === 'field') {
      const len = a.len ?? Math.max(6, Math.min(pw, ph) * 0.035);
      const hx = px + (ex * len) / 2, hy = py + (ey * len) / 2, s = len * 0.32;
      out.push(`<g stroke="${a.color ?? '#8a94a6'}" fill="${a.color ?? '#8a94a6'}" opacity="${a.opacity ?? 0.6}"><path d="M${f(px - (ex * len) / 2)} ${f(py - (ey * len) / 2)}L${f(hx)} ${f(hy)}" stroke-width="1"/><path d="M${f(hx)} ${f(hy)}L${f(hx - ex * s - ey * s * 0.55)} ${f(hy - ey * s + ex * s * 0.55)}L${f(hx - ex * s + ey * s * 0.55)} ${f(hy - ey * s - ex * s * 0.55)}Z" stroke="none"/></g>`);
    } else {
      const s = a.len ?? style.stroke * 2.6 + 3;
      out.push(`<path d="M${f(px + ex * s)} ${f(py + ey * s)}L${f(px - ex * s * 0.7 - ey * s * 0.75)} ${f(py - ey * s * 0.7 + ex * s * 0.75)}L${f(px - ex * s * 0.35)} ${f(py - ey * s * 0.35)}L${f(px - ex * s * 0.7 + ey * s * 0.75)} ${f(py - ey * s * 0.7 - ex * s * 0.75)}Z" fill="${a.color ?? ink}" opacity="${a.opacity ?? 1}"/>`);
    }
  });
  drawArrows('field');
  curves.forEach((c, i) => {
    const color = c.color || palette[(spec.series.length + i) % palette.length];
    const d = pathOf(c.points.filter((p) => inside(p.x, p.y)).map((p) => [X(p.x), Y(p.y)]));
    if (d) out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${style.stroke}"${c.dashed ? ` stroke-dasharray="${style.stroke * 3} ${style.stroke * 2}"` : ''}${c.opacity !== undefined ? ` stroke-opacity="${c.opacity}"` : ''}/>`);
  });
  drawArrows('head');
  spec.series.forEach((s, i) => {
    const color = s.color || palette[i % palette.length];
    const pts = s.points.filter((p) => inside(p.x, p.y));
    if (s.mode !== 'markers') {
      const d = pathOf([...pts].sort((a, b) => a.x - b.x).map((p) => [X(p.x), Y(p.y)]));
      if (d) out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${style.stroke}"/>`);
    }
    pts.forEach((p) => {
      if (!p.err) return;
      const cx = X(p.x);
      const lo = Y(spec.yLog ? Math.max(p.y - p.err, y0) : p.y - p.err);
      const hi = Y(p.y + p.err);
      const cap = style.marker * 1.2;
      out.push(`<path d="M${cx} ${lo}V${hi}M${cx - cap} ${lo}H${cx + cap}M${cx - cap} ${hi}H${cx + cap}" stroke="${color}" stroke-width="1"/>`);
    });
    if (s.mode !== 'line') {
      const shape = MARKERS[i % MARKERS.length];
      pts.forEach((p) => out.push(p.muted
        ? marker('cross', X(p.x), Y(p.y), style.marker, '#9a9a9a', false)
        : marker(shape, X(p.x), Y(p.y), style.marker, color, !paper || i % 2 === 0)));
    }
  });
  if (spec.overlay) out.push(spec.overlay(X, Y));
  out.push('</g>');
  (spec.annotations ?? []).forEach((a) => {
    if (!inside(a.x, a.y) || !a.text.trim()) return;
    // Текст — выше и правее точки, но внутри поля; стрелка от текста к точке.
    const px = X(a.x), py = Y(a.y);
    const tw = a.text.length * style.size * 0.55;
    const tx = Math.min(Math.max(px + 26, m.l + 4), m.l + pw - tw - 4);
    const ty = Math.max(py - 30, m.t + style.size + 2);
    // Стрелка от текста к точке; наконечник смотрит на точку и не залезает на маркер.
    const ax = tx - 2, ay = ty - style.size * 0.35;
    const len = Math.hypot(px - ax, py - ay) || 1;
    const ux = (px - ax) / len, uy = (py - ay) / len;
    const tipX = px - ux * (style.marker + 2), tipY = py - uy * (style.marker + 2);
    const bx = tipX - ux * 8, by = tipY - uy * 8;
    const f2 = (n: number) => n.toFixed(2);
    out.push(`<path d="M${f2(ax)} ${f2(ay)}L${f2(bx)} ${f2(by)}" stroke="${ink}" stroke-width="1" fill="none"/>`);
    out.push(`<path d="M${f2(tipX)} ${f2(tipY)}L${f2(bx - uy * 3.5)} ${f2(by + ux * 3.5)}L${f2(bx + uy * 3.5)} ${f2(by - ux * 3.5)}Z" fill="${ink}"/>`);
    out.push(`<text x="${tx}" y="${ty}" fill="${ink}" font-style="italic">${esc(a.text)}</text>`);
  });

  if (showLegend) {
    const items = [
      ...spec.series.map((s, i) => ({ label: s.label, color: s.color || palette[i % palette.length], kind: s.mode, i, dashed: false, opacity: undefined as number | undefined })),
      ...curves.map((c, i) => ({ label: c.label, color: c.color || palette[(spec.series.length + i) % palette.length], kind: 'line' as const, i: -1, dashed: !!c.dashed, opacity: c.opacity })),
    ];
    // Легенда не должна вылезать из поля: если подписи длинные, мельчим шрифт легенды, а не обрезаем её.
    const longest = Math.max(...items.map((it) => it.label.length));
    const fs = Math.max(8, Math.min(style.size, (pw * 0.62 - 46) / (longest * 0.6)));
    const lh = fs * 1.45;
    const lw = Math.min(pw - 20, longest * fs * 0.6 + 46);
    const lx = m.l + pw - lw - 10;
    const ly = m.t + 10;
    out.push(`<rect x="${lx}" y="${ly}" width="${lw}" height="${items.length * lh + 10}" fill="#ffffff" fill-opacity="0.92" stroke="#cccccc"/>`);
    items.forEach((it, k) => {
      const cy = ly + 5 + lh * (k + 0.5);
      if (it.kind !== 'markers') out.push(`<line x1="${lx + 8}" x2="${lx + 30}" y1="${cy}" y2="${cy}" stroke="${it.color}" stroke-width="${style.stroke}"${it.dashed ? ` stroke-dasharray="${style.stroke * 3} ${style.stroke * 2}"` : ''}${it.opacity !== undefined ? ` stroke-opacity="${it.opacity}"` : ''}/>`);
      if (it.kind !== 'line' && it.i >= 0) out.push(marker(MARKERS[it.i % MARKERS.length], lx + 19, cy, style.marker, it.color, !paper || it.i % 2 === 0));
      out.push(`<text x="${lx + 38}" y="${cy + fs * 0.35}" font-size="${fs.toFixed(1)}" fill="${ink}">${esc(it.label)}</text>`);
    });
  }
  out.push('</svg>');
  return out.join('');
}

function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo) - 1e-9); e <= Math.floor(Math.log10(hi) + 1e-9); e++) out.push(10 ** e);
  return out;
}

/** Путь по точкам; разрывы (NaN, выход за область) рвут линию, а не тянут её через весь график. */
function pathOf(pts: number[][]): string {
  let d = '';
  let pen = false;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 1e6) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    pen = true;
  }
  return d;
}

/** Выборка функции на отрезке — для кривых подгонки и моделей. */
export function sample(fn: (x: number) => number, from: number, to: number, n = 400, log = false): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const x = log && from > 0 ? from * (to / from) ** (i / n) : from + ((to - from) * i) / n;
    out.push({ x, y: fn(x) });
  }
  return out;
}

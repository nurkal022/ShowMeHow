/**
 * Обратное отображение «пиксель рисунка → значения данных» по карте, которую renderPlot
 * кладёт в атрибут data-map. Нужна, чтобы кликом по рисунку ставить подписи и отмечать выбросы.
 */

export interface PlotMap { ml: number; mt: number; pw: number; ph: number; x0: number; x1: number; y0: number; y1: number; xLog: boolean; yLog: boolean }

export function parseMap(attr: string | null | undefined): PlotMap | null {
  if (!attr) return null;
  const v = attr.split(',').map(Number);
  if (v.length < 10 || v.some((n) => !Number.isFinite(n))) return null;
  return { ml: v[0], mt: v[1], pw: v[2], ph: v[3], x0: v[4], x1: v[5], y0: v[6], y1: v[7], xLog: v[8] === 1, yLog: v[9] === 1 };
}

const lg = (v: number, log: boolean) => (log ? Math.log10(v) : v);
const unlg = (v: number, log: boolean) => (log ? 10 ** v : v);

export function toData(m: PlotMap, sx: number, sy: number): { x: number; y: number } {
  const fx = (sx - m.ml) / m.pw;
  const fy = (m.mt + m.ph - sy) / m.ph;
  return {
    x: unlg(lg(m.x0, m.xLog) + fx * (lg(m.x1, m.xLog) - lg(m.x0, m.xLog)), m.xLog),
    y: unlg(lg(m.y0, m.yLog) + fy * (lg(m.y1, m.yLog) - lg(m.y0, m.yLog)), m.yLog),
  };
}

export function toPixel(m: PlotMap, x: number, y: number): { sx: number; sy: number } {
  return {
    sx: m.ml + ((lg(x, m.xLog) - lg(m.x0, m.xLog)) / (lg(m.x1, m.xLog) - lg(m.x0, m.xLog))) * m.pw,
    sy: m.mt + m.ph - ((lg(y, m.yLog) - lg(m.y0, m.yLog)) / (lg(m.y1, m.yLog) - lg(m.y0, m.yLog))) * m.ph,
  };
}

/** Ближайшая точка в пикселях рисунка (не в единицах данных — оси бывают несоизмеримы). */
export function nearestPoint<T extends { x: number; y: number }>(m: PlotMap, sx: number, sy: number, points: T[], maxDist = 18): T | null {
  let best: T | null = null;
  let bestD = maxDist;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const q = toPixel(m, p.x, p.y);
    const d = Math.hypot(q.sx - sx, q.sy - sy);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

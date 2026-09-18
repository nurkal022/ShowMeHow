/** Геометрия графиков кабинета. Модуль чистый: без React и без DOM. */

export interface Point { x: number; y: number }

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** '2026-09-12' → '12 сен'. Без Intl: сервер и клиент обязаны дать одну строку. */
export function formatDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

/** Ровные целые деления оси от нуля: 0, 5, 10, 15… Верхнее — не ниже максимума. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= rough) ?? 10 * pow);
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Индексы подписей оси X: не больше `max` штук, всегда с последней точкой. */
export function labelIndexes(count: number, max: number): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil((count - 1) / (max - 1));
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Гладкая линия через точки — монотонная кубическая интерполяция (Фритч — Карлсон):
 * кривая не уходит ниже нуля и не рисует горбов, которых нет в данных.
 */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${r(p.x)},${r(p.y)}`).join('');
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (dx[i] || 1));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) { tangent[i] = (3 * a / h) * slope[i]; tangent[i + 1] = (3 * b / h) * slope[i]; }
  }
  let d = `M${r(points[0].x)},${r(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const k = dx[i] / 3;
    d += `C${r(p0.x + k)},${r(p0.y + tangent[i] * k)} ${r(p1.x - k)},${r(p1.y - tangent[i + 1] * k)} ${r(p1.x)},${r(p1.y)}`;
  }
  return d;
}

/** Замыкает линию до базовой высоты — получается заливка под графиком. */
export function areaPath(line: string, points: Point[], baseY: number): string {
  if (points.length === 0) return '';
  return `${line}L${r(points[points.length - 1].x)},${r(baseY)}L${r(points[0].x)},${r(baseY)}Z`;
}

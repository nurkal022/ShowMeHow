import { compile, type Scope } from './expr';
import type { OdeEquation } from './ode';

/**
 * Фазовый портрет системы ОДУ: поле направлений и стрелки движения по траектории.
 * Чистая математика без SVG — рисует plot.ts, здесь только числа (и тесты на них).
 */

export interface FieldArrow { x: number; y: number; dx: number; dy: number }

/**
 * Правая часть на плоскости (px, py). Поле направлений честно только тогда, когда
 * скорости по обеим осям зависят лишь от этих двух переменных и параметров: без t
 * и без остальных переменных. Иначе через одну точку плоскости проходят разные
 * траектории, и стрелки вводили бы в заблуждение, — возвращаем null.
 */
export function planarField(equations: OdeEquation[], px: string, py: string, params: Scope): ((x: number, y: number) => [number, number]) | null {
  if (px === py) return null;
  const ex = equations.find((e) => e.name === px);
  const ey = equations.find((e) => e.name === py);
  if (!ex || !ey) return null;
  const cx = compile(ex.rhs);
  const cy = compile(ey.rhs);
  const allowed = (v: string) => v === px || v === py || (v in params && !equations.some((e) => e.name === v));
  if (![...cx.vars, ...cy.vars].every(allowed)) return null;
  return (x, y) => {
    const scope: Scope = { ...params, [px]: x, [py]: y };
    return [cx.fn(scope), cy.fn(scope)];
  };
}

/** Сетка стрелок в центрах клеток; нулевые (точки равновесия) и нечисловые пропускаем. */
export function directionField(
  f: (x: number, y: number) => [number, number],
  xr: [number, number], yr: [number, number], cols = 19, rows = 13,
): FieldArrow[] {
  const out: FieldArrow[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = xr[0] + ((i + 0.5) * (xr[1] - xr[0])) / cols;
      const y = yr[0] + ((j + 0.5) * (yr[1] - yr[0])) / rows;
      const [dx, dy] = f(x, y);
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) continue;
      out.push({ x, y, dx, dy });
    }
  }
  return out;
}

/**
 * Стрелки по траектории через равные промежутки длины дуги. Длину меряем в долях
 * осей, а не в данных: иначе при x ~ 1000 и y ~ 1 все стрелки сбились бы в одном месте.
 */
export function trajectoryArrows(pts: { x: number; y: number }[], xr: [number, number], yr: [number, number], count = 5): FieldArrow[] {
  const sx = xr[1] - xr[0] || 1;
  const sy = yr[1] - yr[0] || 1;
  const ok = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (ok.length < 3) return [];
  const acc = [0];
  for (let i = 1; i < ok.length; i++) acc.push(acc[i - 1] + Math.hypot((ok[i].x - ok[i - 1].x) / sx, (ok[i].y - ok[i - 1].y) / sy));
  const total = acc[acc.length - 1];
  if (!(total > 0)) return [];
  const out: FieldArrow[] = [];
  let i = 1;
  for (let k = 0; k < count; k++) {
    const target = (total * (k + 0.5)) / count;
    while (i < ok.length - 1 && acc[i] < target) i++;
    const a = ok[Math.max(0, i - 1)];
    const b = ok[Math.min(ok.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) continue;
    out.push({ x: ok[i].x, y: ok[i].y, dx, dy });
  }
  return out;
}

/** Пределы по конечным значениям с полями — одни и те же для кривых и сетки поля. */
export function paddedExtent(values: number[], pad = 0.06): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === Infinity) return [0, 1];
  if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; return [lo - d, hi + d]; }
  const d = (hi - lo) * pad;
  return [lo - d, hi + d];
}

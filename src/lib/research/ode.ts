import { compile, type Scope } from './expr';

/**
 * Системы ОДУ для «моделей по формуле»: «x' = a*x - b*x*y», «y' = -c*y + d*x*y».
 * Интегрирование — РК4 с фиксированным шагом: предсказуемо по времени, что важно
 * для слайдеров (пересчёт на каждое движение), и достаточно точно для показа.
 */

export interface OdeEquation { name: string; rhs: string }

export class OdeError extends Error {}

/** «x' = …» или «dx/dt = …» → { name: 'x', rhs: '…' }. */
export function parseEquation(line: string): OdeEquation {
  const m = /^\s*(?:d([A-Za-z_]\w*)\/dt|([A-Za-z_]\w*)\s*')\s*=\s*(.+)$/.exec(line);
  if (!m) throw new OdeError(`Уравнение «${line.trim()}» — ожидается вид «x' = …» или «dx/dt = …».`);
  return { name: m[1] ?? m[2], rhs: m[3].trim() };
}

export interface OdeSolution {
  t: number[];
  /** Решение по каждой переменной, в порядке уравнений. */
  series: Record<string, number[]>;
  /** Оборвалось ли решение (ушло в бесконечность) — тогда кривые короче интервала. */
  diverged: boolean;
}

export function solveOde(opts: {
  equations: OdeEquation[];
  initial: Scope;
  params: Scope;
  t0: number;
  t1: number;
  steps?: number;
  timeVar?: string;
}): OdeSolution {
  const { equations, initial, params, t0, t1 } = opts;
  const steps = Math.min(Math.max(opts.steps ?? 1000, 10), 20000);
  const tv = opts.timeVar ?? 't';
  const fns = equations.map((e) => compile(e.rhs).fn);
  const names = equations.map((e) => e.name);
  const h = (t1 - t0) / steps;
  const deriv = (t: number, y: number[]) => {
    const scope: Scope = { ...params, [tv]: t };
    names.forEach((n, i) => { scope[n] = y[i]; });
    return fns.map((f) => f(scope));
  };
  let y = names.map((n) => initial[n] ?? 0);
  const t: number[] = [t0];
  const series: Record<string, number[]> = Object.fromEntries(names.map((n, i) => [n, [y[i]]]));
  let diverged = false;
  for (let k = 0; k < steps; k++) {
    const tk = t0 + k * h;
    const k1 = deriv(tk, y);
    const k2 = deriv(tk + h / 2, y.map((v, i) => v + (h / 2) * k1[i]));
    const k3 = deriv(tk + h / 2, y.map((v, i) => v + (h / 2) * k2[i]));
    const k4 = deriv(tk + h, y.map((v, i) => v + h * k3[i]));
    const next = y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    if (next.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e12)) { diverged = true; break; }
    y = next;
    t.push(tk + h);
    names.forEach((n, i) => series[n].push(y[i]));
  }
  return { t, series, diverged };
}

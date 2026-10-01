import { compile, type Scope } from './expr';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';

/**
 * Аппроксимация экспериментальных данных. Любая модель — формула от x с параметрами;
 * параметры подбираются методом Левенберга–Марквардта (взвешенно, если заданы
 * погрешности). Для готовых моделей начальное приближение считается по линеаризации —
 * без него LM на экспоненте и степени часто уходит в сторону.
 *
 * Результат — то, что пишут в статье: значения ± стандартная ошибка, R², χ²/ν, RMSE.
 */

export type FitModelKey = 'linear' | 'quadratic' | 'cubic' | 'exp' | 'power' | 'log' | 'gauss' | 'sine' | 'logistic' | 'custom';

export interface FitModel {
  key: FitModelKey;
  label: string;
  expr: string;
  params: string[];
}

export const FIT_MODELS: FitModel[] = [
  { key: 'linear', label: 'Линейная', expr: 'a*x + b', params: ['a', 'b'] },
  { key: 'quadratic', label: 'Парабола', expr: 'a*x^2 + b*x + c', params: ['a', 'b', 'c'] },
  { key: 'cubic', label: 'Кубическая', expr: 'a*x^3 + b*x^2 + c*x + d', params: ['a', 'b', 'c', 'd'] },
  { key: 'exp', label: 'Экспонента', expr: 'a*exp(b*x)', params: ['a', 'b'] },
  { key: 'power', label: 'Степенная', expr: 'a*x^b', params: ['a', 'b'] },
  { key: 'log', label: 'Логарифм', expr: 'a*ln(x) + b', params: ['a', 'b'] },
  { key: 'gauss', label: 'Гаусс', expr: 'A*exp(-(x-mu)^2/(2*s^2))', params: ['A', 'mu', 's'] },
  { key: 'sine', label: 'Синусоида', expr: 'A*sin(w*x + phi) + c', params: ['A', 'w', 'phi', 'c'] },
  { key: 'logistic', label: 'Логистическая', expr: 'L/(1 + exp(-k*(x - x0)))', params: ['L', 'k', 'x0'] },
];

export interface FitParam { name: string; value: number; error: number }

export interface FitResult {
  expr: string;
  params: FitParam[];
  r2: number;
  rmse: number;
  /** χ² на степень свободы; считается, только если заданы погрешности. */
  chi2red: number | null;
  n: number;
  iterations: number;
  converged: boolean;
  /** Масштабированная ковариационная матрица параметров — для полосы доверия; null, если вырождена. */
  cov: number[][] | null;
  /** Число степеней свободы n − k. */
  dof: number;
  /** Критерий Акаике с поправкой на малую выборку — для сравнения моделей на одних данных. */
  aicc: number;
  bic: number;
}

export class FitError extends Error {}

/* ---------------------------- линейная алгебра ---------------------------- */

/** Решает A·x = b методом Гаусса с выбором главного элемента; null — матрица вырождена. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0));
    const col = solve(A, e);
    if (!col) return null;
    cols.push(col);
  }
  return A.map((_, i) => cols.map((c) => c[i]));
}

/** Наименьшие квадраты для y = Σ c_k·x^k — точное решение для полиномов и начало для прочих. */
export function polyfit(xs: number[], ys: number[], degree: number): number[] | null {
  const m = degree + 1;
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  xs.forEach((x, i) => {
    for (let r = 0; r < m; r++) {
      b[r] += ys[i] * x ** r;
      for (let c = 0; c < m; c++) A[r][c] += x ** (r + c);
    }
  });
  return solve(A, b);
}

/* ------------------------- начальные приближения ------------------------- */

function guess(key: FitModelKey, xs: number[], ys: number[]): Scope {
  const lin = (u: number[], v: number[]) => polyfit(u, v, 1) ?? [0, 1];
  const ymax = Math.max(...ys);
  const ymin = Math.min(...ys);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  switch (key) {
    case 'linear': { const [b, a] = lin(xs, ys); return { a, b }; }
    case 'quadratic': { const c = polyfit(xs, ys, 2) ?? [0, 0, 0]; return { c: c[0], b: c[1], a: c[2] }; }
    case 'cubic': { const c = polyfit(xs, ys, 3) ?? [0, 0, 0, 0]; return { d: c[0], c: c[1], b: c[2], a: c[3] }; }
    case 'exp': {
      const sign = ys.reduce((s, y) => s + y, 0) >= 0 ? 1 : -1;
      const pts = xs.map((x, i) => [x, sign * ys[i]]).filter(([, y]) => y > 0);
      if (pts.length < 2) return { a: sign, b: 0 };
      const [lnA, b] = lin(pts.map((p) => p[0]), pts.map((p) => Math.log(p[1])));
      return { a: sign * Math.exp(lnA), b };
    }
    case 'power': {
      const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x > 0 && y > 0);
      if (pts.length < 2) return { a: 1, b: 1 };
      const [lnA, b] = lin(pts.map((p) => Math.log(p[0])), pts.map((p) => Math.log(p[1])));
      return { a: Math.exp(lnA), b };
    }
    case 'log': {
      const pts = xs.map((x, i) => [x, ys[i]]).filter(([x]) => x > 0);
      const [b, a] = lin(pts.map((p) => Math.log(p[0])), pts.map((p) => p[1]));
      return { a, b };
    }
    case 'gauss': {
      const i = ys.indexOf(ymax);
      const half = xs.filter((_, k) => ys[k] >= ymax / 2);
      const width = (Math.max(...half) - Math.min(...half)) / 2.355 || (xmax - xmin) / 6;
      return { A: ymax, mu: xs[i], s: width };
    }
    case 'sine': {
      // Частота — по числу пересечений среднего: грубо, но LM дальше уточнит.
      const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
      const order = xs.map((x, k) => [x, ys[k]]).sort((p, q) => p[0] - q[0]);
      let crossings = 0;
      for (let k = 1; k < order.length; k++) if ((order[k - 1][1] - mean) * (order[k][1] - mean) < 0) crossings++;
      const period = crossings > 1 ? (2 * (xmax - xmin)) / crossings : xmax - xmin || 1;
      return { A: (ymax - ymin) / 2, w: (2 * Math.PI) / period, phi: 0, c: mean };
    }
    case 'logistic': {
      const mid = xs[ys.findIndex((y) => y >= (ymax + ymin) / 2)] ?? (xmin + xmax) / 2;
      return { L: ymax, k: 4 / ((xmax - xmin) || 1), x0: mid };
    }
    default: return {};
  }
}

/* ------------------------------ Левенберг–Марквардт ----------------------------- */

export interface FitInput {
  xs: number[];
  ys: number[];
  /** Погрешности y: если заданы, точки взвешиваются как 1/σ². */
  sigma?: (number | null)[];
  model: FitModelKey;
  /** Формула для model = 'custom'. */
  expr?: string;
  /** Начальные значения параметров своей модели. */
  initial?: Scope;
}

export function fit(input: FitInput): FitResult {
  const preset = FIT_MODELS.find((m) => m.key === input.model);
  const expr = input.model === 'custom' ? (input.expr ?? '').trim() : preset!.expr;
  if (!expr) throw new FitError('Укажите формулу модели.');
  const { fn, vars } = compile(expr);
  if (!vars.includes('x')) throw new FitError('В формуле модели должна быть переменная x.');
  const names = preset?.params ?? vars.filter((v) => v !== 'x');
  if (names.length === 0) throw new FitError('В формуле нет параметров для подбора.');

  const pts = input.xs.map((x, i) => ({ x, y: input.ys[i], s: input.sigma?.[i] ?? null }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < names.length + 1) {
    throw new FitError(`Мало точек: для ${names.length} параметров нужно хотя бы ${names.length + 1}.`);
  }
  const weighted = pts.every((p) => p.s !== null && p.s > 0);
  const w = pts.map((p) => (weighted ? 1 / (p.s! * p.s!) : 1));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  const start = input.model === 'custom' ? {} : guess(input.model, xs, ys);
  let theta = names.map((n) => {
    const v = input.initial?.[n] ?? start[n];
    return Number.isFinite(v) ? v : 1;
  });

  const model = (t: number[], x: number) => {
    const scope: Scope = { x };
    names.forEach((n, i) => { scope[n] = t[i]; });
    return fn(scope);
  };
  const cost = (t: number[]) => pts.reduce((s, p, i) => {
    const r = p.y - model(t, p.x);
    return s + w[i] * r * r;
  }, 0);

  const jacobian = (t: number[]) => pts.map((p) => t.map((v, j) => {
    const h = 1e-6 * Math.max(Math.abs(v), 1e-3);
    const up = [...t]; up[j] = v + h;
    const dn = [...t]; dn[j] = v - h;
    return (model(up, p.x) - model(dn, p.x)) / (2 * h);
  }));

  let lambda = 1e-3;
  let current = cost(theta);
  if (!Number.isFinite(current)) {
    // Стартовая точка вне области модели (логарифм отрицательного и т. п.) — пробуем единицы.
    theta = names.map(() => 1);
    current = cost(theta);
    if (!Number.isFinite(current)) throw new FitError('Модель не вычисляется на этих данных — проверьте формулу и область x.');
  }
  let iterations = 0;
  let converged = false;
  const m = names.length;
  for (; iterations < 500; iterations++) {
    const J = jacobian(theta);
    const JtJ = Array.from({ length: m }, () => new Array(m).fill(0));
    const Jtr = new Array(m).fill(0);
    pts.forEach((p, i) => {
      const r = p.y - model(theta, p.x);
      for (let a = 0; a < m; a++) {
        Jtr[a] += w[i] * J[i][a] * r;
        for (let b = 0; b < m; b++) JtJ[a][b] += w[i] * J[i][a] * J[i][b];
      }
    });
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      const delta = solve(A, Jtr);
      if (!delta) { lambda *= 10; continue; }
      const next = theta.map((v, j) => v + delta[j]);
      const c = cost(next);
      if (Number.isFinite(c) && c < current) {
        const rel = (current - c) / Math.max(current, 1e-300);
        theta = next;
        current = c;
        lambda = Math.max(lambda / 10, 1e-12);
        improved = true;
        if (rel < 1e-12) converged = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved) { converged = true; break; }
    if (converged) break;
  }

  // Ковариация: (JᵀWJ)⁻¹, для невзвешенной подгонки масштабируется остаточной дисперсией.
  const dof = Math.max(pts.length - m, 1);
  const J = jacobian(theta);
  const JtJ = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) =>
    pts.reduce((s, _p, i) => s + w[i] * J[i][a] * J[i][b], 0)));
  const cov = invert(JtJ);
  const scale = weighted ? 1 : current / dof;
  const params = names.map((name, i) => ({
    name, value: theta[i],
    error: cov && cov[i][i] >= 0 ? Math.sqrt(cov[i][i] * scale) : NaN,
  }));

  const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
  const ssTot = ys.reduce((s, y) => s + (y - mean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - model(theta, p.x)) ** 2, 0);
  const n = pts.length;
  const k = m;
  // AIC по остаточной сумме: с весами — по χ², без — по SSR/n (гауссов шум с неизвестной дисперсией).
  const logLikTerm = weighted ? current : n * Math.log(Math.max(ssRes, 1e-300) / n);
  const aic = logLikTerm + 2 * k;
  return {
    expr, params,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 1,
    rmse: Math.sqrt(ssRes / n),
    chi2red: weighted ? current / dof : null,
    n, iterations, converged,
    cov: cov ? cov.map((row) => row.map((v) => v * scale)) : null,
    dof,
    aicc: n - k - 1 > 0 ? aic + (2 * k * (k + 1)) / (n - k - 1) : aic,
    bic: logLikTerm + k * Math.log(n),
  };
}

/** Функция по результату подгонки — для рисования кривой. */
export function fitCurve(result: FitResult): (x: number) => number {
  const { fn } = compile(result.expr);
  const base: Scope = {};
  result.params.forEach((p) => { base[p.name] = p.value; });
  return (x) => fn({ ...base, x });
}

/* ------------------------------ анализ подгонки ------------------------------ */

/** Квантиль t-распределения Стьюдента для 97,5% (двусторонние 95%) — по таблице с интерполяцией. */
export function tQuantile975(dof: number): number {
  const table: [number, number][] = [[1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447], [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228],
    [12, 2.179], [15, 2.131], [20, 2.086], [25, 2.06], [30, 2.042], [40, 2.021], [60, 2.0], [120, 1.98]];
  if (dof <= 1) return table[0][1];
  if (dof >= 120) return 1.96 + (1.98 - 1.96) * (120 / dof);
  for (let i = 1; i < table.length; i++) {
    const [d1, t1] = table[i - 1];
    const [d2, t2] = table[i];
    if (dof <= d2) return t1 + ((t2 - t1) * (dof - d1)) / (d2 - d1);
  }
  return 1.96;
}

/**
 * 95%-полоса доверия для кривой подгонки: ŷ ± t·√(gᵀ·Cov·g), g — градиент модели по параметрам в точке x.
 * Показывает, насколько точно определена сама зависимость, — рецензенты это любят.
 */
export function confidenceBand(result: FitResult, xs: number[]): { x: number; lo: number; hi: number }[] {
  if (!result.cov) return [];
  const { fn } = compile(result.expr);
  const names = result.params.map((p) => p.name);
  const theta = result.params.map((p) => p.value);
  const t = tQuantile975(result.dof);
  const at = (th: number[], x: number) => {
    const scope: Scope = { x };
    names.forEach((nm, i) => { scope[nm] = th[i]; });
    return fn(scope);
  };
  return xs.map((x) => {
    const y = at(theta, x);
    const g = theta.map((v, j) => {
      const h = 1e-6 * Math.max(Math.abs(v), 1e-3);
      const up = [...theta]; up[j] = v + h;
      const dn = [...theta]; dn[j] = v - h;
      return (at(up, x) - at(dn, x)) / (2 * h);
    });
    let variance = 0;
    for (let a = 0; a < g.length; a++) for (let b = 0; b < g.length; b++) variance += g[a] * result.cov![a][b] * g[b];
    const d = t * Math.sqrt(Math.max(variance, 0));
    return { x, lo: y - d, hi: y + d };
  }).filter((p) => Number.isFinite(p.lo) && Number.isFinite(p.hi));
}

/** Остатки y − f(x) для графика остатков: по ним видно, подходит ли модель в принципе. */
export function residuals(result: FitResult, xs: number[], ys: number[]): { x: number; r: number }[] {
  const f = fitCurve(result);
  return xs.map((x, i) => ({ x, r: ys[i] - f(x) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.r));
}

export interface ModelRank { model: FitModelKey; label: string; expr: string; r2: number; aicc: number; delta: number; weight: number; k: number }

/**
 * Сравнение готовых моделей на одних данных по AICc: ΔAICc < 2 — модели неразличимы,
 * > 10 — хуже без шансов. Веса Акаике — «вероятность», что модель лучшая из набора.
 */
export function compareModels(input: Omit<FitInput, 'model' | 'expr' | 'initial'>): ModelRank[] {
  const out: Omit<ModelRank, 'delta' | 'weight'>[] = [];
  for (const m of FIT_MODELS) {
    try {
      const r = fit({ ...input, model: m.key });
      if (Number.isFinite(r.aicc) && r.converged !== false && Number.isFinite(r.r2)) out.push({ model: m.key, label: m.label, expr: m.expr, r2: r.r2, aicc: r.aicc, k: m.params.length });
    } catch { /* модель не подходит к данным (логарифм отрицательных и т. п.) — пропускаем */ }
  }
  if (out.length === 0) return [];
  const best = Math.min(...out.map((o) => o.aicc));
  const rel = out.map((o) => Math.exp(-(o.aicc - best) / 2));
  const sum = rel.reduce((a, b) => a + b, 0);
  return out.map((o, i) => ({ ...o, delta: o.aicc - best, weight: rel[i] / sum })).sort((a, b) => a.aicc - b.aicc);
}

/* --------------------------------- форматирование -------------------------------- */

/**
 * Значение ± погрешность по правилам записи результата: погрешность — 1–2 значащие
 * цифры, значение округляется до того же разряда. 2.3456 ± 0.0123 → «2.346 ± 0.012».
 */
export function formatWithError(value: number, error: number): string {
  if (!Number.isFinite(error) || error <= 0) return formatNum(value);
  const exp = Math.floor(Math.log10(error));
  const lead = error / 10 ** exp;
  const digits = lead < 3 ? exp - 1 : exp;
  const factor = 10 ** digits;
  const r = (v: number) => Math.round(v / factor) * factor;
  const decimals = Math.max(0, -digits);
  if (Math.abs(value) >= 1e5 || (Math.abs(value) < 1e-3 && value !== 0)) {
    const e = Math.floor(Math.log10(Math.abs(value)));
    const k = 10 ** e;
    const d = Math.max(0, e - digits);
    return `(${(r(value) / k).toFixed(d)} ± ${(r(error) / k).toFixed(d)})·10^${e}`;
  }
  return `${r(value).toFixed(decimals)} ± ${r(error).toFixed(decimals)}`;
}

export function formatNum(v: number, sig = 4): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(sig - 1).replace('e', '·10^').replace('+', '');
  return String(Number(v.toPrecision(sig)));
}

/** Абзац для раздела «Методы» статьи — чтобы не переписывать руками. */
export function methodsText(r: FitResult, xLabel: string, yLabel: string, locale: Locale = 'ru'): string {
  const t = translator(researchFigure, locale);
  const ps = r.params.map((p) => `${p.name} = ${formatWithError(p.value, p.error)}`).join(', ');
  const weighting = r.chi2red !== null ? t('methodsWeighted', { chi: formatNum(r.chi2red, 3) }) : t('methodsUnweighted');
  return t('methods', {
    y: yLabel || 'y', x: xLabel || 'x', expr: r.expr, weighting, ps,
    r2: r.r2.toFixed(4), rmse: formatNum(r.rmse, 3), n: r.n,
  });
}

/** Таблица параметров в LaTeX (booktabs). */
export function latexTable(r: FitResult, locale: Locale = 'ru'): string {
  const t = translator(researchFigure, locale);
  const rows = r.params.map((p) => `  $${p.name}$ & $${formatWithError(p.value, p.error).replace('±', '\\pm').replace(/·10\^(-?\d+)/, '\\cdot 10^{$1}')}$ \\\\`);
  return [
    '\\begin{tabular}{lc}', '  \\toprule', `  ${t('texParam')} & ${t('texValue')} \\\\`, '  \\midrule',
    ...rows, '  \\midrule', `  $R^2$ & ${r.r2.toFixed(4)} \\\\`, '  \\bottomrule', '\\end{tabular}',
  ].join('\n');
}

import { describe, expect, it } from 'vitest';
import { checkExpr, compile, parse, toLatex } from '@/lib/research/expr';
import { fit, formatWithError, latexTable, methodsText, polyfit } from '@/lib/research/fit';
import { columnStats, parseTable, pearson } from '@/lib/research/data';
import { parseEquation, solveOde } from '@/lib/research/ode';
import { niceTicks, renderPlot } from '@/lib/research/plot';
import { buildModel, buildPlot, modelParams, newModelDoc, newPlotDoc } from '@/lib/research/doc';

describe('формулы', () => {
  it('считает с приоритетами, степенью и функциями', () => {
    expect(compile('2 + 3*4^2').fn({})).toBe(50);
    expect(compile('-2^2').fn({})).toBe(-4);
    expect(compile('2^3^2').fn({})).toBe(512);
    expect(compile('a*exp(-b*x)').fn({ a: 2, b: 0, x: 5 })).toBe(2);
    expect(compile('sin(pi/2) + ln(e)').fn({})).toBeCloseTo(2);
    expect(compile('2x').fn({ x: 3 })).toBe(6);
    expect(compile('x**2').fn({ x: 3 })).toBe(9);
  });
  it('находит параметры и не путает их с константами', () => {
    expect(compile('A*sin(w*t + phi) + pi').vars.sort()).toEqual(['A', 'phi', 't', 'w']);
  });
  it('отвергает опасное и битое, не исполняя', () => {
    expect(checkExpr('alert(1)')).toMatch(/Неизвестная функция/);
    expect(checkExpr('x +')).toMatch(/оборвалась/);
    expect(checkExpr('x; y')).toMatch(/Непонятный символ/);
    expect(checkExpr('constructor.constructor')).not.toBeNull();
  });
  it('переводит в LaTeX', () => {
    expect(toLatex(parse('a/(1+x^2)'))).toBe('\\frac{a}{1 + x^{2}}');
  });
});

describe('аппроксимация', () => {
  const xs = Array.from({ length: 20 }, (_, i) => i * 0.25);
  it('линейная совпадает с точным решением', () => {
    const ys = xs.map((x) => 3 * x - 1);
    const r = fit({ xs, ys, model: 'linear' });
    expect(r.params[0].value).toBeCloseTo(3, 8);
    expect(r.params[1].value).toBeCloseTo(-1, 8);
    expect(r.r2).toBeCloseTo(1, 10);
  });
  it('экспонента и степенная с шумом находят параметры', () => {
    const noise = (i: number) => 1 + 0.01 * Math.sin(i * 7.3);
    const e = fit({ xs, ys: xs.map((x, i) => 10 * Math.exp(-0.9 * x) * noise(i)), model: 'exp' });
    expect(e.params[0].value).toBeCloseTo(10, 0);
    expect(e.params[1].value).toBeCloseTo(-0.9, 1);
    expect(e.params[1].error).toBeGreaterThan(0);
    const px = xs.map((x) => x + 1);
    const p = fit({ xs: px, ys: px.map((x, i) => 2 * x ** 1.5 * noise(i)), model: 'power' });
    expect(p.params[1].value).toBeCloseTo(1.5, 1);
  });
  it('гаусс и своя формула', () => {
    const g = fit({ xs, ys: xs.map((x) => 4 * Math.exp(-((x - 2.2) ** 2) / (2 * 0.6 ** 2))), model: 'gauss' });
    expect(g.params.find((q) => q.name === 'mu')!.value).toBeCloseTo(2.2, 3);
    const c = fit({ xs, ys: xs.map((x) => 5 / (1 + x) + 0.5), model: 'custom', expr: 'k/(1+x) + c' });
    expect(c.params.map((q) => q.name)).toEqual(['k', 'c']);
    expect(c.params[0].value).toBeCloseTo(5, 5);
  });
  it('взвешенная подгонка даёт χ²/ν', () => {
    const r = fit({ xs, ys: xs.map((x, i) => 2 * x + 1 + (i % 2 ? 0.05 : -0.05)), sigma: xs.map(() => 0.05), model: 'linear' });
    expect(r.chi2red).not.toBeNull();
    expect(r.chi2red!).toBeCloseTo(1, 0);
  });
  it('мало точек — понятная ошибка', () => {
    expect(() => fit({ xs: [1, 2], ys: [1, 2], model: 'quadratic' })).toThrow(/Мало точек/);
  });
  it('polyfit и формат записи результата', () => {
    expect(polyfit([0, 1, 2], [1, 3, 7], 2)!.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 1, 1]);
    expect(formatWithError(2.3456, 0.0123)).toBe('2.346 ± 0.012');
    expect(formatWithError(123.4, 5.6)).toBe('123 ± 6');
    const r = fit({ xs, ys: xs.map((x) => 3 * x - 1 + 0.01 * Math.cos(x * 9)), model: 'linear' });
    expect(methodsText(r, 't, с', 'U, В')).toContain('Левенберга–Марквардта');
    expect(latexTable(r)).toContain('\\pm');
  });
});

describe('таблица данных', () => {
  it('понимает «;» и десятичную запятую с заголовком', () => {
    const t = parseTable('t;U\n0;1,5\n1;2,25\n');
    expect(t.headers).toEqual(['t', 'U']);
    expect(t.columns[1]).toEqual([1.5, 2.25]);
  });
  it('табуляция из Excel, без заголовка', () => {
    const t = parseTable('1\t2\n3\t4');
    expect(t.headers).toEqual(['Столбец 1', 'Столбец 2']);
    expect(t.rows).toBe(2);
  });
  it('статистика и корреляция', () => {
    const s = columnStats([1, 2, 3, 4, NaN]);
    expect(s.n).toBe(4);
    expect(s.mean).toBe(2.5);
    expect(s.median).toBe(2.5);
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
  });
});

describe('ОДУ', () => {
  it('разбирает запись уравнений', () => {
    expect(parseEquation("x' = -k*x")).toEqual({ name: 'x', rhs: '-k*x' });
    expect(parseEquation('dv/dt = -g')).toEqual({ name: 'v', rhs: '-g' });
    expect(() => parseEquation('x = 1')).toThrow();
  });
  it('РК4 решает экспоненциальный распад точно', () => {
    const s = solveOde({ equations: [{ name: 'x', rhs: '-k*x' }], initial: { x: 1 }, params: { k: 0.5 }, t0: 0, t1: 4, steps: 400 });
    expect(s.series.x.at(-1)!).toBeCloseTo(Math.exp(-2), 8);
  });
  it('сообщает о расходимости', () => {
    const s = solveOde({ equations: [{ name: 'x', rhs: 'x^2' }], initial: { x: 1 }, params: {}, t0: 0, t1: 2, steps: 200 });
    expect(s.diverged).toBe(true);
  });
});

describe('документы и рисунок', () => {
  it('пример графика строится, аппроксимация сходится', () => {
    const b = buildPlot(newPlotDoc());
    expect(b.errors).toEqual([]);
    expect(b.fits[0]!.r2).toBeGreaterThan(0.99);
    const svg = renderPlot(b.spec);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Аппроксимация');
  });
  it('модели: параметры из формул, ОДУ считается', () => {
    const f = newModelDoc('function');
    expect(modelParams(f).params.map((p) => p.name).sort()).toEqual(['A', 'g', 'w']);
    expect(modelParams({ ...f, lines: ['y = k*x + b0'] }).params.map((p) => p.name).sort()).toEqual(['b0', 'k']);
    const ode = newModelDoc('ode');
    expect(modelParams(ode).params.map((p) => p.name).sort()).toEqual(['a', 'b', 'c', 'd']);
    const b = buildModel(ode);
    expect(b.errors).toEqual([]);
    expect(b.spec.curves).toHaveLength(2);
  });
  it('подписи экранируются в SVG', () => {
    expect(renderPlot({ title: '<script>', series: [] })).not.toContain('<script>');
  });
  it('деления оси красивые', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

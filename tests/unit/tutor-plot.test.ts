import { describe, expect, it } from 'vitest';
import { parseTutorPlot, startValues, stepCount, tutorPlotSvg } from '@/lib/lms/tutor-plot';
import { sectionsSoFar } from '@/lib/pipeline/stages';

const good = {
  title: 'Скорость', xLabel: 't, с', yLabel: 'v, м/с', x: [0, 10],
  curves: [{ label: 'v(t)', expr: 'v0 + a*x' }],
  params: [{ name: 'a', label: 'ускорение', min: -5, max: 5, value: 2 }, { name: 'v0', label: 'v0', min: 0, max: 20, value: 3 }],
};

describe('живой график наставника', () => {
  it('принимает формулу от x с параметрами и рисует SVG', () => {
    const plot = parseTutorPlot(good)!;
    expect(plot.params.map((p) => p.name)).toEqual(['a', 'v0']);
    const svg = tutorPlotSvg(plot, startValues(plot), 'c1');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Скорость');
  });

  it('отбрасывает неизвестные переменные, битые формулы и пустые диапазоны', () => {
    expect(parseTutorPlot({ ...good, curves: [{ label: '', expr: 'k*x' }] })).toBeNull();
    expect(parseTutorPlot({ ...good, curves: [{ label: '', expr: 'x +* 2' }] })).toBeNull();
    expect(parseTutorPlot({ ...good, x: [5, 5] })).toBeNull();
    expect(parseTutorPlot({ ...good, curves: [{ label: '', expr: 'sqrt(-1-x*x)' }] })).toBeNull();
    expect(parseTutorPlot(null)).toBeNull();
  });

  it('экранирует подписи', () => {
    const plot = parseTutorPlot({ ...good, title: '<script>alert(1)</script>' })!;
    expect(tutorPlotSvg(plot, startValues(plot), 'c2')).not.toContain('<script>');
  });
});

describe('секции в живой ленте кода', () => {
  it('видит открытые и закрытые секции по порядку', () => {
    const text = '// ==== @section physics ====\nvar PHYS={};\n// ==== @end physics ====\n// ==== @section scene ====\nfunction draw(){';
    expect(sectionsSoFar(text)).toEqual([{ name: 'physics', done: true }, { name: 'scene', done: false }]);
  });
});

describe('доска наставника: отметки и шаги', () => {
  const raw = {
    title: 'Бросок', x: [0, 4], params: [{ name: 'v0', label: 'v0', min: 1, max: 20, value: 10 }],
    curves: [{ label: 'y', expr: 'v0*x - 5*x^2' }, { label: 'v', expr: 'v0 - 10*x', step: 3 }],
    marks: [
      { type: 'point', x: 'v0/10', y: 'v0^2/20', label: 'вершина', step: 2 },
      { type: 'vline', x: 'v0/10', step: 2 },
      { type: 'point', x: 'x', y: 1 },
      { type: 'segment', x: 0, y: 0, x2: 1, y2: 5, arrow: true, label: 'Δ', step: 9 },
      { type: 'circle', x: 1, y: 1 },
    ],
    steps: ['Траектория', 'Вершина', 'Скорость'],
  };

  it('принимает отметки от параметров, отбрасывает отметки от x и неизвестные типы, шаг ограничивает числом шагов', () => {
    const p = parseTutorPlot(raw)!;
    expect(p.marks.map((m) => m.type)).toEqual(['point', 'vline', 'segment']);
    expect(p.marks[2].step).toBe(3);
    expect(p.curves[1].step).toBe(3);
    expect(stepCount(p)).toBe(3);
  });

  it('на первом шаге нет отметок второго, на втором — вершина на своём месте и с анимацией', () => {
    const p = parseTutorPlot(raw)!;
    const one = tutorPlotSvg(p, startValues(p), 'c', 1);
    expect(one).not.toContain('вершина');
    const two = tutorPlotSvg(p, startValues(p), 'c', 2, 2);
    expect(two).toContain('вершина');
    expect(two).toContain('tp-new');
    expect(tutorPlotSvg(p, startValues(p), 'c', 2)).not.toContain('tp-new');
  });

  it('старый график без отметок по-прежнему читается', () => {
    const p = parseTutorPlot({ x: [0, 1], curves: [{ label: '', expr: 'x' }] })!;
    expect(p.marks).toEqual([]);
    expect(stepCount(p)).toBe(1);
  });
});

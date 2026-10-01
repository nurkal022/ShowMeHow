import { describe, expect, it } from 'vitest';
import { compareModels, confidenceBand, fit, residuals, tQuantile975 } from '@/lib/research/fit';
import { cellsToText, parseCells, parseTable } from '@/lib/research/data';
import { nearestPoint, parseMap, toData, toPixel } from '@/lib/research/plot-map';
import { renderPlot } from '@/lib/research/plot';
import { buildPlot, newPlotDoc } from '@/lib/research/doc';
import { detectTrigger, menuOptions } from '@/components/research/article/Autocomplete';

const xs = Array.from({ length: 15 }, (_, i) => i * 0.3);
const noisy = xs.map((x, i) => 8 * Math.exp(-0.7 * x) + 0.05 * Math.sin(i * 5.1));

describe('анализ подгонки', () => {
  it('квантиль Стьюдента по таблице', () => {
    expect(tQuantile975(10)).toBeCloseTo(2.228, 3);
    expect(tQuantile975(11)).toBeGreaterThan(2.179);
    expect(tQuantile975(1000)).toBeCloseTo(1.96, 1);
  });
  it('полоса доверия охватывает кривую и сужается в середине данных', () => {
    const r = fit({ xs, ys: noisy, model: 'exp' });
    const band = confidenceBand(r, [0, 2, 4.2]);
    expect(band).toHaveLength(3);
    band.forEach((b) => expect(b.hi).toBeGreaterThan(b.lo));
    const width = band.map((b) => b.hi - b.lo);
    expect(width[1]).toBeLessThan(Math.max(width[0], width[2]));
  });
  it('остатки малы для верной модели', () => {
    const r = fit({ xs, ys: noisy, model: 'exp' });
    const res = residuals(r, xs, noisy);
    expect(Math.max(...res.map((p) => Math.abs(p.r)))).toBeLessThan(0.1);
  });
  it('AICc выбирает экспоненту для экспоненциальных данных, веса в сумме 1', () => {
    const rank = compareModels({ xs, ys: noisy });
    expect(rank[0].model).toBe('exp');
    expect(rank[0].delta).toBe(0);
    expect(rank.reduce((s, m) => s + m.weight, 0)).toBeCloseTo(1, 6);
  });
  it('выброс, исключённый из подгонки, не портит параметры', () => {
    const doc = newPlotDoc();
    const lines = doc.data.split('\n');
    lines[4] = '1.5\t4.2\t0.08';
    const withOutlier = buildPlot({ ...doc, data: lines.join('\n') }).fits[0]!;
    const excluded = buildPlot({ ...doc, data: lines.join('\n'), excluded: [3] });
    expect(excluded.fits[0]!.r2).toBeGreaterThan(withOutlier.r2);
    expect(excluded.spec.series[0].points[3].muted).toBe(true);
    expect(excluded.fits[0]!.n).toBe(8);
  });
  it('остатки и полоса попадают в описание рисунка', () => {
    const b = buildPlot({ ...newPlotDoc(), residuals: true, band: true });
    expect(b.residualSpecs).toHaveLength(1);
    expect(b.spec.bands![0].points.length).toBeGreaterThan(10);
    expect(renderPlot(b.spec)).toContain('fill-opacity="0.16"');
  });
});

describe('карта координат рисунка', () => {
  it('пиксель ↔ данные туда и обратно, ближайшая точка', () => {
    const svg = renderPlot({ series: [{ label: 'a', mode: 'markers', points: [{ x: 1, y: 2 }, { x: 3, y: 5 }] }], width: 600, height: 400 });
    const map = parseMap(/data-map="([^"]+)"/.exec(svg)![1])!;
    const px = toPixel(map, 3, 5);
    const back = toData(map, px.sx, px.sy);
    expect(back.x).toBeCloseTo(3, 6);
    expect(back.y).toBeCloseTo(5, 6);
    expect(nearestPoint(map, px.sx + 3, px.sy - 2, [{ x: 1, y: 2 }, { x: 3, y: 5 }])).toEqual({ x: 3, y: 5 });
    expect(nearestPoint(map, px.sx + 60, px.sy, [{ x: 3, y: 5 }])).toBeNull();
  });
  it('логарифмическая ось', () => {
    const svg = renderPlot({ series: [{ label: 'a', mode: 'markers', points: [{ x: 1, y: 10 }, { x: 100, y: 1000 }] }], xLog: true, yLog: true });
    const map = parseMap(/data-map="([^"]+)"/.exec(svg)![1])!;
    const px = toPixel(map, 10, 100);
    expect(toData(map, px.sx, px.sy).x).toBeCloseTo(10, 6);
  });
});

describe('сетка данных', () => {
  it('ячейки туда и обратно сохраняют числа', () => {
    const c = parseCells('t;U\n0;1,5\n1;2,25');
    expect(c).toEqual({ headers: ['t', 'U'], rows: [['0', '1,5'], ['1', '2,25']] });
    expect(parseTable(cellsToText(c.headers, c.rows)).columns[1]).toEqual([1.5, 2.25]);
  });
});

describe('автодополнение в статье', () => {
  it('триггеры «/», «@» и «[[»', () => {
    expect(detectTrigger('Текст /фор')).toEqual({ kind: 'slash', start: 6, query: 'фор' });
    expect(detectTrigger('см. [@lee')).toMatchObject({ kind: 'cite', query: 'lee' });
    expect(detectTrigger('на [[fig')).toMatchObject({ kind: 'fig', query: 'fig' });
    expect(detectTrigger('a/b')).toBeNull();
    expect(detectTrigger('e-mail user@host')).toBeNull();
  });
  it('команды фильтруются, источники ищутся по автору', () => {
    expect(menuOptions('slash', 'фор', [], [], []).map((o) => o.key)).toEqual(['math']);
    const refs = [{ id: 'lee2020', type: 'article' as const, authors: [{ family: 'Lee', given: 'K' }], title: 'Waves', container: '', year: 2020, volume: '', issue: '', pages: '', publisher: '', doi: '', url: '' }];
    expect(menuOptions('cite', 'lee', refs, [], [])[0].insert).toBe('[@lee2020]');
  });
});

describe('составной рисунок', () => {
  it('панели с метками, id внутри панелей не конфликтуют', async () => {
    const { renderComposite } = await import('@/lib/research/composite');
    const a = renderPlot({ series: [{ label: 'a', mode: 'markers', points: [{ x: 1, y: 2 }] }], width: 400, height: 300 });
    const svg = renderComposite([a, a], { layout: 'row', labels: 'ru' });
    expect(svg).toContain('(а)');
    expect(svg).toContain('(б)');
    expect(svg).toContain('id="p0-plot-area"');
    expect(svg).toContain('id="p1-plot-area"');
    expect(svg).toContain('url(#p1-plot-area)');
    expect(/viewBox="0 0 (\d+) 300"/.exec(svg)![1]).toBe('816');
  });
});

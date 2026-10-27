import { describe, expect, it } from 'vitest';
import { pinnedCdnUrl, repairCdn } from '@/lib/pipeline/repair';
import { redLinesOf } from '@/lib/pipeline/judge';
import { answerOptions, pointOf } from '@/lib/lms/tutor';
import { CDN_WHITELIST } from '@/lib/cdn';

describe('CDN: чужая версия той же библиотеки переписывается на закреплённую', () => {
  it('модульная three и аддоны с любого CDN', () => {
    expect(pinnedCdnUrl('https://unpkg.com/three@0.150.1/build/three.module.js')).toBe(CDN_WHITELIST.three);
    expect(pinnedCdnUrl('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js'))
      .toBe(CDN_WHITELIST.threeAddons + 'controls/OrbitControls.js');
  });
  it('глобальную three.min.js не трогает — код ждёт window.THREE', () => {
    expect(pinnedCdnUrl('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')).toBeNull();
  });
  it('p5, matter, katex; подозрительные адреса и чужие пакеты — нет', () => {
    expect(pinnedCdnUrl('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js')).toBe(CDN_WHITELIST.p5);
    expect(pinnedCdnUrl('https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css')).toBe(CDN_WHITELIST.katexCss);
    expect(pinnedCdnUrl('https://cdn.jsdelivr.net/npm/matter-js@0.18.0/build/matter.min.js')).toBe(CDN_WHITELIST.matter);
    expect(pinnedCdnUrl('https://cdn.jsdelivr.net/npm/p5@1.4.0/lib/p5.min.js?x=1')).toBeNull();
    expect(pinnedCdnUrl('https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js')).toBeNull();
  });
  it('переписывает в HTML и снимает integrity, разрешённое не трогает', () => {
    const html = `<script src="https://cdn.jsdelivr.net/npm/p5@1.4.0/lib/p5.min.js" integrity="sha384-x" crossorigin="anonymous"></script>` +
      `<script src="${CDN_WHITELIST.matter}"></script>`;
    const r = repairCdn(html);
    expect(r.fixed).toHaveLength(1);
    expect(r.html).toContain(`src="${CDN_WHITELIST.p5}"`);
    expect(r.html).not.toContain('integrity');
    expect(r.html).toContain(CDN_WHITELIST.matter);
    expect(repairCdn(`<script src="${CDN_WHITELIST.p5}" integrity="sha384-y"></script>`).html).toContain('integrity');
  });
});

describe('красные линии судьи', () => {
  it('только известные коды, без повторов и пустых объяснений', () => {
    expect(redLinesOf([{ code: 'r4', detail: 'км/ч вместо м/с' }, { code: 'R4', detail: 'ещё' }, { code: 'R9', detail: 'x' }, { code: 'R2', detail: '' }]))
      .toEqual([{ code: 'R4', detail: 'км/ч вместо м/с' }]);
    expect(redLinesOf('мусор')).toEqual([]);
  });
});

describe('наставник: варианты ответа и «посмотри сюда»', () => {
  it('варианты: без пустых и повторов, меньше двух — нет выбора', () => {
    expect(answerOptions(['Вырастет', 'вырастет', '', 'Упадёт'])).toEqual(['Вырастет', 'Упадёт']);
    expect(answerOptions(['Одно'])).toEqual([]);
  });
  it('подсветка — только того, что есть в показаниях тренажёра', () => {
    const screen = 'Масса, кг: 2\nСкорость: 3,1 м/с';
    expect(pointOf({ target: 'Скорость', note: 'следи за ней' }, screen)).toEqual({ target: 'Скорость', note: 'следи за ней' });
    expect(pointOf({ target: 'Импульс', note: '' }, screen)).toBeNull();
    expect(pointOf({ target: 'Скорость' }, '')).toBeNull();
  });
});

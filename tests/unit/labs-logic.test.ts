import { describe, it, expect } from 'vitest';
// Логика сцен лежит в public/labs как ES-модули без DOM — их можно гонять без браузера.
import { REAGENTS, FLAME_SALTS, react, mixState } from '../../public/labs/chemistry/reactions.js';
import { bubbleSortSteps, quickSortSteps, insertionSortSteps, selectionSortSteps, SORTS, applySteps, bfsWaves, dfsSteps, bstInsert, bstSearch, bstLayout } from '../../public/labs/informatics/algorithms.js';
import { refract, reflect, indexFor } from '../../public/labs/physics/optics.js';

describe('химия: таблица реакций', () => {
  it('у каждого реагента есть имя, цвет и формула', () => {
    for (const r of REAGENTS) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.formula).toBeTruthy();
      expect(r.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('пероксид с иодидом даёт пену', () => {
    const state = mixState();
    react(state, 'h2o2');
    const out = react(state, 'ki');
    expect(out.effect).toBe('foam');
    expect(out.product).toContain('O');
  });
  it('индикатор в кислоте краснеет, в щёлочи синеет', () => {
    const a = mixState(); react(a, 'hcl'); expect(react(a, 'indicator').color).toBe('#e53935');
    const b = mixState(); react(b, 'naoh'); expect(react(b, 'indicator').color).toBe('#1e88e5');
  });
  it('нитрат серебра с соляной кислотой даёт осадок', () => {
    const s = mixState(); react(s, 'agno3');
    expect(react(s, 'hcl').effect).toBe('precipitate');
  });
  it('сода с кислотой даёт газ', () => {
    const s = mixState(); react(s, 'nahco3');
    expect(react(s, 'hcl').effect).toBe('gas');
  });
  it('без пары реакции — просто раствор без эффекта', () => {
    const s = mixState();
    expect(react(s, 'naoh').effect).toBe('none');
  });
  it('соли для пламени окрашены по-разному', () => {
    const colors = new Set(FLAME_SALTS.map((s) => s.flame));
    expect(colors.size).toBe(FLAME_SALTS.length);
  });
});

describe('информатика: шаги сортировок', () => {
  const arr = [5, 2, 9, 1, 7, 3];
  it('пузырёк сортирует через записанные шаги', () => {
    const steps = bubbleSortSteps(arr);
    expect(steps.some((s) => s.type === 'compare')).toBe(true);
    expect(applySteps(arr, steps)).toEqual([1, 2, 3, 5, 7, 9]);
  });
  it('быстрая сортировка сортирует и делает меньше сравнений на большом массиве', () => {
    const big = Array.from({ length: 40 }, (_, i) => (i * 17) % 41);
    const q = quickSortSteps(big);
    const b = bubbleSortSteps(big);
    expect(applySteps(big, q)).toEqual([...big].sort((x, y) => x - y));
    expect(q.filter((s) => s.type === 'compare').length)
      .toBeLessThan(b.filter((s) => s.type === 'compare').length);
  });
  it('исходный массив не меняется', () => {
    bubbleSortSteps(arr);
    expect(arr).toEqual([5, 2, 9, 1, 7, 3]);
  });
  it('BFS раздаёт волны по расстоянию от старта', () => {
    const edges = [[0, 1], [1, 2], [0, 3], [3, 4], [5, 6]];
    const waves = bfsWaves(7, edges, 0);
    expect(waves).toEqual([[0], [1, 3], [2, 4]]);
  });
});

describe('физика: преломление', () => {
  const up = [0, 1];
  it('нормальное падение проходит без отклонения', () => {
    const r = refract([0, -1], up, 1, 1.5)!;
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(-1);
  });
  it('закон Снеллиуса: sin θ1 = n sin θ2', () => {
    const th1 = 0.5;
    const d = [Math.sin(th1), -Math.cos(th1)];
    const r = refract(d, up, 1, 1.5)!;
    expect(Math.asin(r[0])).toBeCloseTo(Math.asin(Math.sin(th1) / 1.5), 6);
  });
  it('полное внутреннее отражение возвращает null', () => {
    const th = 1.2; // > критического для n=1.5 (≈0.73)
    expect(refract([Math.sin(th), -Math.cos(th)], up, 1.5, 1)).toBeNull();
  });
  it('отражение переворачивает нормальную составляющую', () => {
    const r = reflect([0.6, -0.8], up);
    expect(r[0]).toBeCloseTo(0.6);
    expect(r[1]).toBeCloseTo(0.8);
  });
  it('дисперсия: синий преломляется сильнее красного', () => {
    expect(indexFor(450)).toBeGreaterThan(indexFor(650));
  });
});

describe('информатика: остальные алгоритмы', () => {
  const arr = [5, 2, 9, 1, 7, 3, 3];
  it('вставки и выбор сортируют', () => {
    expect(applySteps(arr, insertionSortSteps(arr))).toEqual([1, 2, 3, 3, 5, 7, 9]);
    expect(applySteps(arr, selectionSortSteps(arr))).toEqual([1, 2, 3, 3, 5, 7, 9]);
  });
  it('SORTS перечисляет четыре алгоритма с именами', () => {
    expect(Object.keys(SORTS)).toEqual(['bubble', 'insertion', 'selection', 'quick']);
    for (const s of Object.values(SORTS)) expect(applySteps(arr, s.steps(arr))).toEqual([1, 2, 3, 3, 5, 7, 9]);
  });
  it('DFS обходит все достижимые вершины и возвращается по каждому ребру дерева', () => {
    const edges = [[0, 1], [1, 2], [0, 3], [3, 4], [5, 6]];
    const steps = dfsSteps(7, edges, 0);
    const visited = new Set([0, ...steps.filter((s) => !s.back).map((s) => s.to)]);
    expect([...visited].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(steps.filter((s) => s.back).length).toBe(4);
    expect(steps[0]).toEqual({ from: 0, to: 1 });
  });
  it('дерево поиска: вставка, поиск, дубликаты, раскладка', () => {
    const nodes: { value: number; left: number; right: number }[] = [];
    bstInsert(nodes, 50); bstInsert(nodes, 30); bstInsert(nodes, 70); const r = bstInsert(nodes, 40);
    expect(r.path).toEqual([0, 1]);
    expect(nodes[1].right).toBe(3);
    expect(bstInsert(nodes, 30).duplicate).toBe(true);
    expect(bstSearch(nodes, 40)).toEqual({ path: [0, 1, 3], found: true });
    expect(bstSearch(nodes, 60).found).toBe(false);
    const lay = bstLayout(nodes);
    expect(lay.map((l: { col: number }) => l.col)).toEqual([2, 0, 3, 1]);
    expect(lay[0].depth).toBe(0); expect(lay[3].depth).toBe(2);
  });
});

/**
 * Пошаговые записи алгоритмов для «Зала алгоритмов». Шаг — {type:'compare'|'swap', i, j}
 * (для quicksort ещё {type:'pivot', i}). Сцена проигрывает шаги по одному с подсветкой.
 */
export function bubbleSortSteps(input) {
  const a = [...input];
  const steps = [];
  for (let n = a.length; n > 1; n--) {
    for (let i = 0; i < n - 1; i++) {
      steps.push({ type: 'compare', i, j: i + 1 });
      if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; steps.push({ type: 'swap', i, j: i + 1 }); }
    }
  }
  return steps;
}

export function quickSortSteps(input) {
  const a = [...input];
  const steps = [];
  function part(lo, hi) {
    if (lo >= hi) return;
    const p = a[hi];
    steps.push({ type: 'pivot', i: hi });
    let k = lo;
    for (let i = lo; i < hi; i++) {
      steps.push({ type: 'compare', i, j: hi });
      if (a[i] < p) {
        if (i !== k) { [a[i], a[k]] = [a[k], a[i]]; steps.push({ type: 'swap', i, j: k }); }
        k++;
      }
    }
    if (k !== hi) { [a[k], a[hi]] = [a[hi], a[k]]; steps.push({ type: 'swap', i: k, j: hi }); }
    part(lo, k - 1);
    part(k + 1, hi);
  }
  part(0, a.length - 1);
  return steps;
}

export function applySteps(input, steps) {
  const a = [...input];
  for (const s of steps) if (s.type === 'swap') [a[s.i], a[s.j]] = [a[s.j], a[s.i]];
  return a;
}

/** Волны BFS: массив уровней, каждый — список вершин на этом расстоянии от start. */
export function bfsWaves(n, edges, start) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
  const dist = new Array(n).fill(-1);
  dist[start] = 0;
  const waves = [[start]];
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const u of frontier) for (const v of adj[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; next.push(v); }
    if (next.length) waves.push(next);
    frontier = next;
  }
  return waves;
}

export function shuffled(n, seed = Date.now()) {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function insertionSortSteps(input) {
  const a = [...input];
  const steps = [];
  for (let i = 1; i < a.length; i++) {
    let j = i;
    while (j > 0) {
      steps.push({ type: 'compare', i: j - 1, j });
      if (a[j - 1] <= a[j]) break;
      [a[j - 1], a[j]] = [a[j], a[j - 1]];
      steps.push({ type: 'swap', i: j - 1, j });
      j--;
    }
  }
  return steps;
}

export function selectionSortSteps(input) {
  const a = [...input];
  const steps = [];
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    steps.push({ type: 'pivot', i });
    for (let j = i + 1; j < a.length; j++) {
      steps.push({ type: 'compare', i: min, j });
      if (a[j] < a[min]) min = j;
    }
    if (min !== i) { [a[i], a[min]] = [a[min], a[i]]; steps.push({ type: 'swap', i, j: min }); }
  }
  return steps;
}

export const SORTS = {
  bubble: { name: 'Пузырёк', steps: bubbleSortSteps, note: 'Соседи сравниваются и меняются местами, крупные «всплывают» вправо. O(n²).' },
  insertion: { name: 'Вставки', steps: insertionSortSteps, note: 'Каждый новый элемент сдвигается влево до своего места. O(n²), быстро на почти отсортированном.' },
  selection: { name: 'Выбор', steps: selectionSortSteps, note: 'Ищем минимум в остатке и ставим его в начало. Всегда n²/2 сравнений, зато мало обменов.' },
  quick: { name: 'Быстрая', steps: quickSortSteps, note: 'Опорный элемент делит массив на меньшие и большие, потом каждая часть отдельно. O(n log n).' },
};

/** Обход в глубину: список рёбер в порядке прохода, ходы назад помечены back:true. */
export function dfsSteps(n, edges, start) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
  for (const l of adj) l.sort((a, b) => a - b);
  const seen = new Array(n).fill(false);
  const steps = [];
  (function go(u) {
    seen[u] = true;
    for (const v of adj[u]) {
      if (seen[v]) continue;
      steps.push({ from: u, to: v });
      go(v);
      steps.push({ from: v, to: u, back: true });
    }
  })(start);
  return steps;
}

/** Двоичное дерево поиска на массиве узлов {value, left, right}; корень — индекс 0. */
export function bstInsert(nodes, value) {
  const path = [];
  if (!nodes.length) { nodes.push({ value, left: -1, right: -1 }); return { path, index: 0 }; }
  let i = 0;
  for (;;) {
    path.push(i);
    if (value === nodes[i].value) return { path, index: i, duplicate: true };
    const side = value < nodes[i].value ? 'left' : 'right';
    if (nodes[i][side] < 0) {
      nodes.push({ value, left: -1, right: -1 });
      nodes[i][side] = nodes.length - 1;
      return { path, index: nodes.length - 1 };
    }
    i = nodes[i][side];
  }
}

export function bstSearch(nodes, value) {
  const path = [];
  let i = nodes.length ? 0 : -1;
  while (i >= 0) {
    path.push(i);
    if (nodes[i].value === value) return { path, found: true };
    i = value < nodes[i].value ? nodes[i].left : nodes[i].right;
  }
  return { path, found: false };
}

/** Раскладка дерева: x по порядку обхода in-order, y по глубине. */
export function bstLayout(nodes) {
  const out = nodes.map(() => ({ col: 0, depth: 0 }));
  let col = 0;
  (function walk(i, depth) {
    if (i < 0) return;
    walk(nodes[i].left, depth + 1);
    out[i] = { col: col++, depth };
    walk(nodes[i].right, depth + 1);
  })(nodes.length ? 0 : -1, 0);
  return out;
}

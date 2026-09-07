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

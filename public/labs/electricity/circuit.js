/**
 * Расчёт цепи на макетной плате — чистые функции, без three.js.
 * Плата — сетка узлов cols × rows; гнёзда (slots) — рёбра между соседними узлами.
 * Метод узловых потенциалов: батарейка с внутренним сопротивлением заменяется
 * эквивалентом Нортона (источник тока E/r ‖ проводимость 1/r), поэтому хватает
 * одной матрицы проводимостей. Висящие узлы держит крошечная утечка на землю.
 */

/** Гнёзда сетки: горизонтальные 'h r c' (узел (c,r) → (c+1,r)) и вертикальные 'v c r'. */
export function makeGrid(cols, rows) {
  const node = (c, r) => r * cols + c;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) slots.push({ key: `h ${r} ${c}`, a: node(c, r), b: node(c + 1, r), horiz: true, c, r });
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) slots.push({ key: `v ${c} ${r}`, a: node(c, r), b: node(c, r + 1), horiz: false, c, r });
  }
  return { cols, rows, nodes: cols * rows, slots, node };
}

/**
 * els: [{ id, a, b, kind: 'R', R, short? } | { id, a, b, kind: 'E', E, r }]
 * Для источника b — плюс: ЭДС гонит ток внутри от a к b.
 * Возвращает потенциалы узлов V и для каждого элемента ток I (от a к b через элемент),
 * напряжение U = V[a] − V[b] (для источника — V[b] − V[a]) и мощность P = |U·I|.
 */
export function solve(n, els, gmin = 1e-9) {
  const G = Array.from({ length: n }, () => new Float64Array(n));
  const J = new Float64Array(n);
  const stamp = (a, b, g) => { G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g; };
  for (let i = 0; i < n; i++) G[i][i] += gmin;
  for (const e of els) {
    if (e.a === e.b) continue;
    if (e.kind === 'R') stamp(e.a, e.b, 1 / e.R);
    else { const g = 1 / e.r; stamp(e.a, e.b, g); J[e.b] += e.E * g; J[e.a] -= e.E * g; }
  }
  const V = gauss(G, J);
  const out = new Map();
  for (const e of els) {
    if (e.kind === 'R') {
      const U = V[e.a] - V[e.b];
      const I = U / e.R;
      out.set(e.id, { I, U, P: Math.abs(U * I) });
    } else {
      const U = V[e.b] - V[e.a];
      const I = (e.E - U) / e.r;
      out.set(e.id, { I, U, P: Math.abs(U * I) });
    }
  }
  return { V, el: out };
}

function gauss(A, b) {
  const n = b.length;
  const M = A.map((row, i) => { const r = Array.from(row); r.push(b[i]); return r; });
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    const d = M[k][k] || 1e-18;
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / d;
      if (!f) continue;
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / (M[i][i] || 1e-18);
  }
  return x;
}

/**
 * Как соединены нагрузки (лампы, резисторы), через которые идёт ток.
 * Узлы, связанные проводами и замкнутыми ключами, склеиваются; две нагрузки
 * параллельны, если сидят на одной паре склеенных узлов; последовательны, если
 * не параллельны и ток в них одинаков.
 */
export function classify(n, els, res) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const e of els) if (e.short) parent[find(e.a)] = find(e.b);
  const loads = els.filter((e) => e.kind === 'R' && !e.short && Math.abs(res.el.get(e.id).I) > 1e-3);
  if (loads.length === 0) return 'none';
  if (loads.length === 1) return 'single';
  const key = (e) => [find(e.a), find(e.b)].sort((x, y) => x - y).join('-');
  let allPar = true, allSer = true;
  for (let i = 0; i < loads.length; i++) {
    for (let j = i + 1; j < loads.length; j++) {
      const par = key(loads[i]) === key(loads[j]);
      const Ii = Math.abs(res.el.get(loads[i].id).I), Ij = Math.abs(res.el.get(loads[j].id).I);
      const same = Math.abs(Ii - Ij) <= 0.02 * Math.max(Ii, Ij);
      if (!par) allPar = false;
      if (par || !same) allSer = false;
    }
  }
  return allPar ? 'parallel' : allSer ? 'series' : 'mixed';
}

import { createLab, makeLabel, placeLabel, tr } from '../common.js';
import { SORTS, bfsWaves, dfsSteps, shuffled, bstInsert, bstSearch, bstLayout } from './algorithms.js';

const ST_SORT = tr('Сортировки', 'Сұрыптау', 'Sorting');
const ST_GRAPH = tr('Обход графа', 'Графты аралау', 'Graph traversal');
const ST_TREE = tr('Дерево поиска', 'Іздеу ағашы', 'Search tree');
const TITLE = tr('Зал алгоритмов', 'Алгоритмдер залы', 'Algorithm hall');
document.title = TITLE + ' — Tesseract';
// Подписи сортировок: algorithms.js остаётся без зависимостей (его гоняют юнит-тесты).
const SORT_TEXT = {
  bubble: { name: tr('Пузырёк', 'Көпіршік', 'Bubble'), note: tr('Соседи сравниваются и меняются местами, крупные «всплывают» вправо. O(n²).', 'Көршілес элементтер салыстырылып, орын ауыстырады, ірілері оңға «қалқып шығады». O(n²).', 'Neighbours are compared and swapped; the large ones “bubble up” to the right. O(n²).') },
  insertion: { name: tr('Вставки', 'Кірістіру', 'Insertion'), note: tr('Каждый новый элемент сдвигается влево до своего места. O(n²), быстро на почти отсортированном.', 'Әрбір жаңа элемент өз орнына дейін солға жылжиды. O(n²), бірақ сұрыпталуға жақын массивте жылдам.', 'Each new element shifts left until it reaches its place. O(n²), fast on nearly sorted data.') },
  selection: { name: tr('Выбор', 'Таңдау', 'Selection'), note: tr('Ищем минимум в остатке и ставим его в начало. Всегда n²/2 сравнений, зато мало обменов.', 'Қалған бөліктен минимумды тауып, басына қоямыз. Әрдайым n²/2 салыстыру, есесіне алмасу аз.', 'Find the minimum of the rest and put it at the front. Always n²/2 comparisons, but few swaps.') },
  quick: { name: tr('Быстрая', 'Жылдам', 'Quick'), note: tr('Опорный элемент делит массив на меньшие и большие, потом каждая часть отдельно. O(n log n).', 'Тірек элемент массивті кішілер мен үлкендерге бөледі, содан кейін әр бөлік жеке сұрыпталады. O(n log n).', 'A pivot splits the array into smaller and larger elements, then each part is sorted separately. O(n log n).') },
};
const lab = createLab({
  title: TITLE,
  hint: tr('Столбики переставляются руками. Кнопки запускают сортировку по шагам; «Гонка» ставит пузырёк против быстрой. В графе коснитесь вершины.',
    'Бағаналарды қолмен ауыстыруға болады. Батырмалар сұрыптауды қадамдап іске қосады; «Жарыс» көпіршікті жылдам сұрыптаумен жарыстырады. Графта төбені түртіңіз.',
    'The bars can be rearranged by hand. Buttons run a sort step by step; “Race” pits bubble sort against quicksort. In the graph, touch a vertex.'),
  stations: [
    { name: ST_SORT, at: [0, 3.4, 4.6], look: [0, 0.7, -2] },
    { name: ST_GRAPH, at: [22, 1.6, 3.5], look: [22, 1.8, -1] },
    { name: ST_TREE, at: [44, 1.7, 4.2], look: [44, 1.9, -1] },
  ],
});
const ZERO = tr('Сравнений 0 · Обменов 0', 'Салыстыру 0 · Алмасу 0', 'Comparisons 0 · Swaps 0');
const DRAG_HINT = tr('Перетащите столбики или выберите алгоритм', 'Бағаналарды сүйреңіз немесе алгоритм таңдаңыз', 'Drag the bars or pick an algorithm');
const SPEED = tr('Скорость', 'Жылдамдық', 'Speed');
const BFS_HINT = tr('Коснитесь вершины — от неё пойдёт поиск в ширину', 'Төбені түртіңіз — одан ендік бойынша іздеу басталады', 'Touch a vertex to start a breadth-first search from it');
const DFS_HINT = tr('Коснитесь вершины — от неё пойдёт поиск в глубину', 'Төбені түртіңіз — одан тереңдік бойынша іздеу басталады', 'Touch a vertex to start a depth-first search from it');
const MODE_BFS = tr('Режим: в ширину', 'Режим: ендік бойынша', 'Mode: breadth-first');
const MODE_DFS = tr('Режим: в глубину', 'Режим: тереңдік бойынша', 'Mode: depth-first');
const TREE_EMPTY = tr('Дерево пусто. «Вставить» добавит случайное число', 'Ағаш бос. «Кірістіру» кездейсоқ сан қосады', 'The tree is empty. “Insert” adds a random number');
const INSERT = tr('Вставить', 'Кірістіру', 'Insert');
const FIND = tr('Найти', 'Табу', 'Find');
const CLEAR = tr('Очистить', 'Тазарту', 'Clear');
const { THREE, scene } = lab;

// =====================================================================
// Станция 1: сортировки. Два ряда: передний — интерактивный, задний — для гонки.
// =====================================================================
const N = 12, GAP = 0.42;
const slotX = (i) => (i - (N - 1) / 2) * GAP;
const HL = 0xffd54f, PV = 0xff5252, DONE = 0x69f0ae;

class SortRow {
  constructor(z, values, interactive) {
    this.z = z; this.bars = []; this.running = false; this.steps = []; this.cursor = 0;
    this.timer = 0; this.compares = 0; this.swaps = 0; this.lit = []; this.speed = 1; this.kind = null;
    this.group = new THREE.Group(); scene.add(this.group);
    for (let i = 0; i < N; i++) {
      const v = values[i];
      const h = 0.18 + v * 0.16;
      const geo = new THREE.BoxGeometry(0.3, h, 0.3); geo.translate(0, h / 2, 0);
      const hue = 0.58 - v * 0.02;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.7, 0.55),
        emissive: new THREE.Color().setHSL(hue, 0.7, 0.3), emissiveIntensity: 0.4, roughness: 0.35 }));
      m.position.set(slotX(i), 0, z);
      m.userData.value = v; m.userData.baseEmissive = m.material.emissive.clone(); m.userData.row = this;
      const lbl = makeLabel(String(v), { scale: 0.0015, bg: 'rgba(0,0,0,0)' }); lbl.position.y = h + 0.14; m.add(lbl);
      scene.add(m); this.bars.push(m);
      lab.hover(m, () => tr(`Значение ${m.userData.value}`, `Мәні ${m.userData.value}`, `Value ${m.userData.value}`));
      if (interactive) lab.grab(m, {
        onGrab: () => { if (this.running) this.stop(); },
        onRelease: (o) => {
          const p = new THREE.Vector3(); o.getWorldPosition(p);
          const to = Math.max(0, Math.min(N - 1, Math.round(p.x / GAP + (N - 1) / 2)));
          const from = this.bars.indexOf(o);
          this.bars.splice(from, 1); this.bars.splice(to, 0, o);
          o.position.y = 0; o.rotation.set(0, 0, 0);
          this.settle();
        },
      });
    }
    const by = interactive ? 2.45 : 3.4;
    this.title = lab.board(' ', [0, by + 0.3, z - 0.5], { scale: 0.0026 });
    this.counter = lab.board(' ', [0, by, z - 0.5], { scale: 0.0032 });
    this.settle();
    this.setVisible(interactive);
  }
  get values() { return this.bars.map((b) => b.userData.value); }
  setVisible(v) { this.visible = v; for (const b of this.bars) b.visible = v; this.title.sprite.visible = v; this.counter.sprite.visible = v; }
  settle() { this.bars.forEach((b, i) => { b.userData.tx = slotX(i); }); }
  setValues(values) {
    this.stop();
    this.bars.sort((a, b) => values.indexOf(a.userData.value) - values.indexOf(b.userData.value));
    this.settle();
  }
  light(idx, color) { const b = this.bars[idx]; b.material.emissive.set(color); b.material.emissiveIntensity = 1.4; this.lit.push(b); }
  unlight() { for (const b of this.lit) { b.material.emissiveIntensity = 0.4; b.material.emissive.copy(b.userData.baseEmissive); } this.lit = []; }
  start(kind) {
    this.stop();
    this.kind = kind;
    this.steps = SORTS[kind].steps(this.values);
    this.title.set(`${SORT_TEXT[kind].name}: ${SORT_TEXT[kind].note}`);
    this.cursor = 0; this.compares = 0; this.swaps = 0; this.running = true; this.timer = 0; this.t0 = performance.now();
    this.counter.set(ZERO);
  }
  stop() { this.running = false; this.unlight(); }
  tick(dt) {
    if (!this.running) return;
    this.timer -= dt * this.speed;
    if (this.timer > 0) return;
    this.unlight();
    if (this.cursor >= this.steps.length) {
      this.running = false;
      const sec = ((performance.now() - this.t0) / 1000).toFixed(1);
      this.counter.set(tr(`Готово за ${sec} с: ${this.compares} сравнений, ${this.swaps} обменов`, `${sec} с ішінде дайын: ${this.compares} салыстыру, ${this.swaps} алмасу`, `Done in ${sec} s: ${this.compares} comparisons, ${this.swaps} swaps`));
      for (const b of this.bars) { b.material.emissive.set(DONE); b.material.emissiveIntensity = 1; this.lit.push(b); }
      setTimeout(() => this.unlight(), 1500);
      this.onDone?.(this);
      return;
    }
    const s = this.steps[this.cursor++];
    if (s.type === 'compare') {
      this.light(s.i, HL); this.light(s.j, HL); this.compares++; this.timer = 0.22;
      this.counter.set(tr(`Сравниваем ${this.bars[s.i].userData.value} и ${this.bars[s.j].userData.value} · сравнений ${this.compares} · обменов ${this.swaps}`, `${this.bars[s.i].userData.value} және ${this.bars[s.j].userData.value} салыстырылады · салыстыру ${this.compares} · алмасу ${this.swaps}`, `Comparing ${this.bars[s.i].userData.value} and ${this.bars[s.j].userData.value} · comparisons ${this.compares} · swaps ${this.swaps}`));
    } else if (s.type === 'pivot') {
      this.light(s.i, PV); this.timer = 0.35;
      this.counter.set(tr(`Опорный элемент ${this.bars[s.i].userData.value} · сравнений ${this.compares} · обменов ${this.swaps}`, `Тірек элемент ${this.bars[s.i].userData.value} · салыстыру ${this.compares} · алмасу ${this.swaps}`, `Pivot ${this.bars[s.i].userData.value} · comparisons ${this.compares} · swaps ${this.swaps}`));
    } else {
      [this.bars[s.i], this.bars[s.j]] = [this.bars[s.j], this.bars[s.i]];
      this.settle(); this.light(s.i, HL); this.light(s.j, HL); this.swaps++; this.timer = 0.32;
      this.counter.set(tr(`Меняем местами · сравнений ${this.compares} · обменов ${this.swaps}`, `Орындарын ауыстырамыз · салыстыру ${this.compares} · алмасу ${this.swaps}`, `Swapping · comparisons ${this.compares} · swaps ${this.swaps}`));
    }
  }
  update(dt) {
    this.tick(dt);
    for (const b of this.bars) {
      if (b.userData.heldBy) continue;
      b.position.x += (b.userData.tx - b.position.x) * Math.min(1, dt * 10);
      b.position.z += (this.z - b.position.z) * Math.min(1, dt * 10);
    }
  }
}

const initial = shuffled(N, 7);
const front = new SortRow(-1, initial, true);
const back = new SortRow(-3.8, initial, false);
front.title.set(DRAG_HINT);
front.counter.set(ZERO);
let speed = 1;
function setSpeed(s) { speed = s; front.speed = s; back.speed = s; speedBtn.setText(`${SPEED} ×${s}`); speedHud.textContent = `${SPEED} ×${s}`; }
function run(kind) { back.setVisible(false); front.start(kind); }
function shuffle() { const v = shuffled(N); front.setValues(v); back.setValues(v); back.setVisible(false);
  front.title.set(DRAG_HINT); front.counter.set(ZERO); }
function race() {
  const v = front.values;
  back.setValues(v); back.setVisible(true);
  front.start('bubble'); back.start('quick');
  front.title.set(tr('Пузырёк (спереди) против быстрой (сзади) на одном массиве', 'Көпіршік (алдыңғы) пен жылдам (артқы) сұрыптау бір массивте жарысады', 'Bubble (front) vs quick (back) on the same array'));
  back.title.set(tr('Быстрая сортировка', 'Жылдам сұрыптау', 'Quicksort'));
  const finish = (row) => { row.title.set(`${SORT_TEXT[row.kind].name} — ${row === front && back.running || row === back && front.running ? tr('финиш первой!', 'бірінші болып мәреге жетті!', 'finished first!') : tr('финиш', 'мәре', 'finished')}`); };
  front.onDone = finish; back.onDone = finish;
}
function stopAll() { front.stop(); back.stop(); front.onDone = null; back.onDone = null; }

// Пульт: 3D-кнопки на подставке перед рядами
const stand = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x1f2735, roughness: 0.8 }));
stand.position.set(0, 0.42, 0.6); scene.add(stand);
const kinds = Object.keys(SORTS);
kinds.forEach((k, i) => lab.button3d(SORT_TEXT[k].name, [-1.9 + i * 0.62, 0.5, 0.6], () => run(k), { width: 0.56, color: [0x1a73e8, 0x00897b, 0x7e57c2, 0xd81b60][i] }));
lab.button3d(tr('Гонка', 'Жарыс', 'Race'), [0.75, 0.5, 0.6], race, { width: 0.5, color: 0xf9a825 });
lab.button3d(tr('Перемешать', 'Араластыру', 'Shuffle'), [1.42, 0.5, 0.6], shuffle, { width: 0.7, color: 0x546e7a });
const speedBtn = lab.button3d(`${SPEED} ×1`, [2.15, 0.5, 0.6], () => setSpeed(speed === 1 ? 3 : speed === 3 ? 6 : 1), { width: 0.66, color: 0x455a64 });
const S1 = ST_SORT;
for (const k of kinds) lab.hud.action(SORT_TEXT[k].name, () => run(k), S1);
lab.hud.action(tr('Гонка', 'Жарыс', 'Race'), race, S1);
lab.hud.action(tr('Перемешать', 'Араластыру', 'Shuffle'), shuffle, S1);
const speedHud = lab.hud.action(`${SPEED} ×1`, () => setSpeed(speed === 1 ? 3 : speed === 3 ? 6 : 1), S1);
lab.hud.action(tr('Стоп', 'Тоқтату', 'Stop'), stopAll, S1);

// =====================================================================
// Станция 2: граф — BFS волнами или DFS шагами
// =====================================================================
const G = new THREE.Group(); G.position.set(22, 0, -1.5); scene.add(G);
const NODES = 20;
const nodes = [];
const nodeGeo = new THREE.SphereGeometry(0.14, 24, 18);
for (let i = 0; i < NODES; i++) {
  const m = new THREE.Mesh(nodeGeo, new THREE.MeshStandardMaterial({ color: 0x90a4ae, emissive: 0x37474f, emissiveIntensity: 0.5 }));
  const a = (i / NODES) * Math.PI * 2 + (i % 2) * 0.3;
  const r = 1.4 + (i % 3) * 0.7;
  m.position.set(Math.cos(a) * r, 1.2 + ((i * 7) % 5) * 0.35, Math.sin(a) * r * 0.6);
  m.userData.id = i;
  const tag = makeLabel(String(i), { scale: 0.0012, bg: 'rgba(0,0,0,0)' }); tag.position.y = 0.22; m.add(tag);
  const dist = makeLabel(' ', { scale: 0.0013 }); dist.position.y = -0.24; dist.visible = false; m.add(dist); m.userData.dist = dist;
  G.add(m); nodes.push(m);
  lab.hover(m, () => tr(`Вершина ${i}`, `Төбе ${i}`, `Vertex ${i}`));
  lab.click(m, () => (mode === 'bfs' ? runBfs(i) : runDfs(i)));
}
const edges = [];
for (let i = 0; i < NODES; i++) {
  edges.push([i, (i + 1) % NODES]);
  if (i % 3 === 0) edges.push([i, (i + 5) % NODES]);
  if (i % 4 === 1) edges.push([i, (i + 9) % NODES]);
}
const edgeMeshes = edges.map(([u, v]) => {
  const p = nodes[u].position, q = nodes[v].position;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x455a64, emissive: 0x263238, emissiveIntensity: 0.4 }));
  m.position.lerpVectors(p, q, 0.5); m.scale.y = p.distanceTo(q); m.lookAt(q); m.rotateX(Math.PI / 2);
  G.add(m);
  return { m, u, v };
});
const edgeOf = (a, b) => edgeMeshes.find((e) => (e.u === a && e.v === b) || (e.u === b && e.v === a));
const waveBoard = lab.board(BFS_HINT, [22, 3.4, -1.5], { scale: 0.0026 });
let mode = 'bfs';
let timers = [];
const walker = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 1.5 }));
walker.visible = false; G.add(walker);
let walk = null;
function resetGraph() {
  for (const t of timers) clearTimeout(t); timers = []; walk = null; walker.visible = false;
  for (const n of nodes) { n.material.emissive.set(0x37474f); n.material.emissiveIntensity = 0.5; n.scale.setScalar(1); n.userData.dist.visible = false; }
  for (const e of edgeMeshes) { e.m.material.emissive.set(0x263238); e.m.material.emissiveIntensity = 0.4; }
}
function setDist(id, text) {
  const n = nodes[id]; const fresh = makeLabel(text, { scale: 0.0013 });
  n.userData.dist.material.map = fresh.material.map; n.userData.dist.material.needsUpdate = true; n.userData.dist.scale.copy(fresh.scale); n.userData.dist.visible = true;
}
function runBfs(start) {
  resetGraph();
  const waves = bfsWaves(NODES, edges, start);
  const seen = new Set();
  waves.forEach((wave, k) => {
    timers.push(setTimeout(() => {
      const col = new THREE.Color().setHSL(0.55 - k * 0.09, 0.9, 0.55);
      for (const id of wave) {
        const n = nodes[id];
        n.material.emissive.copy(col); n.material.emissiveIntensity = 1.6; n.scale.setScalar(1.5);
        for (const e of edgeMeshes) if ((e.u === id && seen.has(e.v)) || (e.v === id && seen.has(e.u))) { e.m.material.emissive.copy(col); e.m.material.emissiveIntensity = 1.2; }
        seen.add(id);
        setDist(id, `d=${k}`);
      }
      for (const id of wave) setTimeout(() => nodes[id].scale.setScalar(1.15), 400);
      waveBoard.set(tr(`Поиск в ширину · волна ${k}: ${wave.length} ${plural(wave.length)} на расстоянии ${k}`, `Ендік бойынша іздеу · ${k}-толқын: ${k} қашықтықта ${wave.length} төбе`, `Breadth-first search · wave ${k}: ${wave.length} ${wave.length === 1 ? 'vertex' : 'vertices'} at distance ${k}`));
    }, 700 * k));
  });
}
function runDfs(start) {
  resetGraph();
  const steps = dfsSteps(NODES, edges, start);
  nodes[start].material.emissive.set(0xffd54f); nodes[start].material.emissiveIntensity = 1.6;
  walker.position.copy(nodes[start].position); walker.visible = true;
  let order = 1;
  setDist(start, '#0');
  walk = { steps, i: 0, t: 0, order };
  waveBoard.set(tr('Поиск в глубину: идём как можно дальше, потом возвращаемся', 'Тереңдік бойынша іздеу: мүмкіндігінше алысқа барып, сосын кері қайтамыз', 'Depth-first search: go as far as possible, then backtrack'));
}
function updateWalk(dt) {
  if (!walk) return;
  if (walk.i >= walk.steps.length) { walk = null; waveBoard.set(tr('Поиск в глубину завершён: номера — порядок посещения', 'Тереңдік бойынша іздеу аяқталды: нөмірлер — төбелерге бару реті', 'Depth-first search complete: the numbers show the visiting order')); return; }
  const s = walk.steps[walk.i];
  walk.t += dt * (s.back ? 3.2 : 2.2);
  const a = nodes[s.from].position, b = nodes[s.to].position;
  walker.position.lerpVectors(a, b, Math.min(1, walk.t));
  const e = edgeOf(s.from, s.to);
  if (!s.back) { e.m.material.emissive.set(0xffd54f); e.m.material.emissiveIntensity = 1.2; }
  if (walk.t >= 1) {
    walk.t = 0; walk.i++;
    if (!s.back) {
      const n = nodes[s.to];
      n.material.emissive.set(0xffd54f); n.material.emissiveIntensity = 1.6; n.scale.setScalar(1.3);
      setDist(s.to, `#${walk.order++}`);
    } else { e.m.material.emissive.set(0x8d6e63); }
  }
}
function toggleMode() {
  mode = mode === 'bfs' ? 'dfs' : 'bfs';
  modeBtn.setText(mode === 'bfs' ? MODE_BFS : MODE_DFS);
  modeHud.textContent = mode === 'bfs' ? MODE_BFS : MODE_DFS;
  resetGraph();
  waveBoard.set(mode === 'bfs' ? BFS_HINT : DFS_HINT);
}
const modeBtn = lab.button3d(MODE_BFS, [22, 0.5, 1.2], toggleMode, { width: 0.9, color: 0x5c6bc0 });
const modeHud = lab.hud.action(MODE_BFS, toggleMode, ST_GRAPH);
function plural(n) { return n === 1 ? 'вершина' : n < 5 ? 'вершины' : 'вершин'; }

// =====================================================================
// Станция 3: двоичное дерево поиска
// =====================================================================
const T = new THREE.Group(); T.position.set(44, 0, -1.5); scene.add(T);
const tree = []; const treeMeshes = []; const treeLinks = [];
const treeBoard = lab.board(TREE_EMPTY, [44, 3.6, -1.5], { scale: 0.0028 });
let busy = false;
function treePos(i) { const l = bstLayout(tree)[i]; const n = tree.length; return new THREE.Vector3((l.col - (n - 1) / 2) * 0.42, 3.0 - l.depth * 0.6, 0); }
function relayout() {
  const lay = bstLayout(tree); const n = tree.length;
  lay.forEach((l, i) => { treeMeshes[i].userData.target = new THREE.Vector3((l.col - (n - 1) / 2) * 0.42, 3.0 - l.depth * 0.6, 0); });
}
function makeTreeNode(value) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 18), new THREE.MeshStandardMaterial({ color: 0x80cbc4, emissive: 0x00695c, emissiveIntensity: 0.5 }));
  const tag = makeLabel(String(value), { scale: 0.0016, bg: 'rgba(0,0,0,0)' }); tag.position.z = 0.17; m.add(tag);
  m.userData.value = value; m.userData.target = new THREE.Vector3(0, 3.8, 0); m.position.copy(m.userData.target);
  T.add(m); treeMeshes.push(m);
  lab.hover(m, () => tr(`Узел ${value}: слева меньше, справа больше`, `${value} түйіні: сол жақта кішілері, оң жақта үлкендері`, `Node ${value}: smaller on the left, larger on the right`));
  return m;
}
function linkFor(i) {
  const node = tree[i];
  for (const side of ['left', 'right']) {
    const c = node[side];
    if (c >= 0 && !treeLinks[c]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), new THREE.MeshStandardMaterial({ color: 0x546e7a, emissive: 0x263238, emissiveIntensity: 0.4 }));
      T.add(l); treeLinks[c] = { m: l, parent: i };
    }
  }
}
function flash(i, color, ms = 350) {
  return new Promise((res) => { const m = treeMeshes[i]; m.material.emissive.set(color); m.material.emissiveIntensity = 1.6; m.scale.setScalar(1.35);
    setTimeout(() => { m.material.emissive.set(0x00695c); m.material.emissiveIntensity = 0.5; m.scale.setScalar(1); res(); }, ms); });
}
async function insertRandom() {
  if (busy || tree.length >= 15) { if (tree.length >= 15) treeBoard.set(tr('15 узлов — хватит. «Очистить» начнёт заново', '15 түйін — жеткілікті. «Тазарту» басынан бастайды', '15 nodes is enough. “Clear” starts over')); return; }
  busy = true;
  let v; do { v = 1 + Math.floor(Math.random() * 99); } while (tree.some((n) => n.value === v));
  const r = bstInsert(tree, v);
  const m = makeTreeNode(v);
  treeBoard.set(tr(`Вставляем ${v}`, `${v} кірістіріледі`, `Inserting ${v}`));
  for (const i of r.path) {
    treeBoard.set(tr(`Вставляем ${v}: ${v < tree[i].value ? `${v} < ${tree[i].value}, идём влево` : `${v} > ${tree[i].value}, идём вправо`}`,
      `${v} кірістіріледі: ${v < tree[i].value ? `${v} < ${tree[i].value}, солға барамыз` : `${v} > ${tree[i].value}, оңға барамыз`}`,
      `Inserting ${v}: ${v < tree[i].value ? `${v} < ${tree[i].value}, go left` : `${v} > ${tree[i].value}, go right`}`));
    m.userData.target = treeMeshes[i].userData.target.clone().add(new THREE.Vector3(v < tree[i].value ? -0.35 : 0.35, -0.35, 0.3));
    await flash(i, 0xffd54f, 550);
  }
  for (let i = 0; i < tree.length; i++) linkFor(i);
  relayout();
  const depth = Math.max(...bstLayout(tree).map((l) => l.depth)) + 1;
  treeBoard.set(tr(`${v} на месте · узлов ${tree.length}, глубина ${depth}`, `${v} орнында · түйін саны ${tree.length}, тереңдігі ${depth}`, `${v} is in place · ${tree.length} nodes, depth ${depth}`));
  await flash(tree.length - 1, 0x69f0ae, 500);
  busy = false;
}
async function searchRandom() {
  if (busy || !tree.length) return;
  busy = true;
  const pick = Math.random() < 0.7 ? tree[Math.floor(Math.random() * tree.length)].value : 1 + Math.floor(Math.random() * 99);
  const r = bstSearch(tree, pick);
  treeBoard.set(tr(`Ищем ${pick}`, `${pick} ізделуде`, `Searching for ${pick}`));
  for (const i of r.path) {
    const nv = tree[i].value;
    treeBoard.set(tr(`Ищем ${pick}: ${pick === nv ? 'нашли!' : pick < nv ? `${pick} < ${nv}, влево` : `${pick} > ${nv}, вправо`}`,
      `${pick} ізделуде: ${pick === nv ? 'табылды!' : pick < nv ? `${pick} < ${nv}, солға` : `${pick} > ${nv}, оңға`}`,
      `Searching for ${pick}: ${pick === nv ? 'found!' : pick < nv ? `${pick} < ${nv}, left` : `${pick} > ${nv}, right`}`));
    await flash(i, pick === nv ? 0x69f0ae : 0xffd54f, 550);
  }
  const steps = r.path.length === 1 ? 'step' : 'steps';
  if (r.found) treeBoard.set(tr(`${pick} найден за ${r.path.length} ${r.path.length === 1 ? 'шаг' : r.path.length < 5 ? 'шага' : 'шагов'} из ${tree.length} узлов`, `${pick} ${tree.length} түйіннің ішінен ${r.path.length} қадамда табылды`, `${pick} found in ${r.path.length} ${steps} among ${tree.length} nodes`));
  else { treeBoard.set(tr(`${pick} нет в дереве: дошли до листа за ${r.path.length} ${r.path.length < 5 ? 'шага' : 'шагов'}`, `${pick} ағашта жоқ: ${r.path.length} қадамда жапыраққа жеттік`, `${pick} is not in the tree: reached a leaf in ${r.path.length} ${steps}`)); if (r.path.length) await flash(r.path[r.path.length - 1], 0xff5252, 500); }
  busy = false;
}
function clearTree() {
  if (busy) return;
  for (const m of treeMeshes) T.remove(m); for (const l of treeLinks) if (l) T.remove(l.m);
  tree.length = 0; treeMeshes.length = 0; treeLinks.length = 0;
  treeBoard.set(TREE_EMPTY);
}
lab.button3d(INSERT, [43.2, 0.5, 1.2], insertRandom, { width: 0.6, color: 0x00897b });
lab.button3d(FIND, [43.9, 0.5, 1.2], searchRandom, { width: 0.5, color: 0x1a73e8 });
lab.button3d(CLEAR, [44.6, 0.5, 1.2], clearTree, { width: 0.6, color: 0x546e7a });
lab.hud.action(INSERT, insertRandom, ST_TREE);
lab.hud.action(FIND, searchRandom, ST_TREE);
lab.hud.action(CLEAR, clearTree, ST_TREE);
scene.add(placeLabel(makeLabel(tr('Каждый шаг отсекает половину: поиск за log₂ n сравнений', 'Әр қадам жартысын қиып тастайды: іздеу log₂ n салыстыруда аяқталады', 'Each step cuts off half: a search takes log₂ n comparisons'), { scale: 0.0022 }), 44, 0.9, -2.4));
let treeSeeded = false;

lab.setFrame((dt, t) => {
  front.update(dt); back.update(dt);
  updateWalk(dt);
  G.rotation.y = Math.sin(t * 0.15) * 0.15;
  for (let i = 0; i < treeMeshes.length; i++) {
    const m = treeMeshes[i];
    m.position.lerp(m.userData.target, Math.min(1, dt * 6));
    const l = treeLinks[i];
    if (l) { const p = treeMeshes[l.parent].position, q = m.position; l.m.position.lerpVectors(p, q, 0.5); l.m.scale.y = Math.max(0.01, p.distanceTo(q)); l.m.lookAt(q.clone().add(T.position)); l.m.rotateX(Math.PI / 2); }
  }
  if (!treeSeeded && lab.hud.current?.name === ST_TREE) { treeSeeded = true; (async () => { for (let i = 0; i < 5; i++) await insertRandom(); })(); }
});

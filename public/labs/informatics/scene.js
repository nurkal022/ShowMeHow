import { createLab, makeLabel } from '../common.js';
import { bubbleSortSteps, quickSortSteps, bfsWaves, shuffled } from './algorithms.js';

const lab = createLab({
  title: 'Зал алгоритмов',
  hint: 'Столбики можно переставлять руками: перетащите и отпустите на новое место. Кнопки запускают сортировку по шагам.',
  stations: [
    { name: 'Сортировки', at: [0, 2.1, 3.6], look: [0, 0.9, -1] },
    { name: 'Обход графа', at: [22, 1.6, 3.5], look: [22, 1.8, -1] },
  ],
});
const { THREE, scene } = lab;

// ---------- Станция 1: сортировки ----------
const N = 12, GAP = 0.42, Z = -1;
let values = shuffled(N, 7);
const bars = [];
const barMat = (h) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.58 - h * 0.02, 0.7, 0.55),
  emissive: new THREE.Color().setHSL(0.58 - h * 0.02, 0.7, 0.3), emissiveIntensity: 0.4, roughness: 0.35 });
const slotX = (i) => (i - (N - 1) / 2) * GAP;
for (let i = 0; i < N; i++) {
  const v = values[i];
  const h = 0.18 + v * 0.16;
  const geo = new THREE.BoxGeometry(0.3, h, 0.3);
  geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, barMat(v));
  m.position.set(slotX(i), 0, Z);
  m.userData.value = v;
  const lbl = makeLabel(String(v), { scale: 0.0015, bg: 'rgba(0,0,0,0)' });
  lbl.position.y = h + 0.14;
  m.add(lbl);
  scene.add(m);
  bars.push(m);
  lab.hover(m, () => `Значение ${m.userData.value}`);
  lab.grab(m, {
    onGrab: () => { if (running) stop(); },
    onRelease: (o) => {
      // Ставим в ближайший слот и сдвигаем остальные.
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      const to = Math.max(0, Math.min(N - 1, Math.round(p.x / GAP + (N - 1) / 2)));
      const from = bars.indexOf(o);
      bars.splice(from, 1); bars.splice(to, 0, o);
      values = bars.map((b) => b.userData.value);
      o.position.y = 0; o.rotation.set(0, 0, 0);
      settle();
    },
  });
}
function settle() {
  bars.forEach((b, i) => { b.userData.tx = slotX(i); b.userData.tz = Z; });
}
settle();

const counter = lab.board('Сравнений 0 · Обменов 0', [0, 2.6, Z - 0.4], { scale: 0.0034 });
const algoName = lab.board('Перетащите столбики или запустите сортировку', [0, 2.95, Z - 0.4], { scale: 0.0024 });
let steps = [], cursor = 0, running = false, timer = 0, compares = 0, swaps = 0;
const HL = 0xffd54f, PV = 0xff5252;
let lit = [];
function unlight() { for (const b of lit) b.material.emissiveIntensity = 0.4, b.material.emissive.copy(b.userData.baseEmissive); lit = []; }
for (const b of bars) b.userData.baseEmissive = b.material.emissive.clone();
function light(idx, color) {
  const b = bars[idx];
  b.material.emissive.set(color); b.material.emissiveIntensity = 1.4; lit.push(b);
}
function start(kind) {
  stop();
  steps = kind === 'bubble' ? bubbleSortSteps(values) : quickSortSteps(values);
  algoName.set(kind === 'bubble' ? 'Пузырьковая сортировка: соседи меняются местами' : 'Быстрая сортировка: опорный элемент делит массив');
  cursor = 0; compares = 0; swaps = 0; running = true; timer = 0;
  counter.set('Сравнений 0 · Обменов 0');
}
function stop() { running = false; unlight(); }
function tick(dt) {
  if (!running) return;
  timer -= dt;
  if (timer > 0) return;
  unlight();
  if (cursor >= steps.length) {
    running = false;
    algoName.set(`Готово: ${compares} сравнений, ${swaps} обменов`);
    for (const b of bars) { b.material.emissive.set(0x69f0ae); b.material.emissiveIntensity = 1; lit.push(b); }
    setTimeout(unlight, 1200);
    return;
  }
  const s = steps[cursor++];
  if (s.type === 'compare') { light(s.i, HL); light(s.j, HL); compares++; timer = 0.22; }
  else if (s.type === 'pivot') { light(s.i, PV); timer = 0.35; }
  else {
    [bars[s.i], bars[s.j]] = [bars[s.j], bars[s.i]];
    values = bars.map((b) => b.userData.value);
    settle(); light(s.i, HL); light(s.j, HL); swaps++; timer = 0.32;
  }
  counter.set(`Сравнений ${compares} · Обменов ${swaps}`);
}
function shuffle() {
  stop();
  values = shuffled(N);
  bars.sort((a, b) => values.indexOf(a.userData.value) - values.indexOf(b.userData.value));
  settle();
  algoName.set('Перетащите столбики или запустите сортировку');
  counter.set('Сравнений 0 · Обменов 0');
}
lab.button3d('Пузырёк', [-1.4, 0.5, 0.4], () => start('bubble'), { width: 0.55 });
lab.button3d('Быстрая', [-0.7, 0.5, 0.4], () => start('quick'), { width: 0.55, color: 0x7e57c2 });
lab.button3d('Перемешать', [0.1, 0.5, 0.4], shuffle, { width: 0.7, color: 0x546e7a });
lab.button3d('Стоп', [0.9, 0.5, 0.4], stop, { width: 0.45, color: 0x8d6e63 });
lab.hud.action('Пузырёк', () => start('bubble'));
lab.hud.action('Быстрая', () => start('quick'));
lab.hud.action('Перемешать', shuffle);
lab.hud.action('Стоп', stop);
// Подставка под кнопками
const stand = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x1f2735, roughness: 0.8 }));
stand.position.set(-0.3, 0.42, 0.4);
scene.add(stand);

// ---------- Станция 2: граф ----------
const G = new THREE.Group();
G.position.set(22, 0, -1.5);
scene.add(G);
const NODES = 20;
const nodes = [];
const nodeGeo = new THREE.SphereGeometry(0.14, 24, 18);
for (let i = 0; i < NODES; i++) {
  const m = new THREE.Mesh(nodeGeo, new THREE.MeshStandardMaterial({ color: 0x90a4ae, emissive: 0x37474f, emissiveIntensity: 0.5 }));
  const a = (i / NODES) * Math.PI * 2 + (i % 2) * 0.3;
  const r = 1.4 + (i % 3) * 0.7;
  m.position.set(Math.cos(a) * r, 1.2 + ((i * 7) % 5) * 0.35, Math.sin(a) * r * 0.6);
  m.userData.id = i;
  G.add(m);
  nodes.push(m);
  lab.hover(m, () => `Вершина ${i}`);
  lab.click(m, () => runBfs(i));
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
  m.position.lerpVectors(p, q, 0.5);
  m.scale.y = p.distanceTo(q);
  m.lookAt(q); m.rotateX(Math.PI / 2);
  G.add(m);
  return { m, u, v };
});
const waveBoard = lab.board('Коснитесь вершины — от неё пойдёт поиск в ширину', [22, 3.4, -1.5], { scale: 0.0026 });
let bfsTimers = [];
function runBfs(start) {
  for (const t of bfsTimers) clearTimeout(t);
  bfsTimers = [];
  for (const n of nodes) { n.material.emissive.set(0x37474f); n.material.emissiveIntensity = 0.5; n.scale.setScalar(1); }
  for (const e of edgeMeshes) { e.m.material.emissive.set(0x263238); e.m.material.emissiveIntensity = 0.4; }
  const waves = bfsWaves(NODES, edges, start);
  const seen = new Set();
  waves.forEach((wave, k) => {
    bfsTimers.push(setTimeout(() => {
      const col = new THREE.Color().setHSL(0.55 - k * 0.09, 0.9, 0.55);
      for (const id of wave) {
        const n = nodes[id];
        n.material.emissive.copy(col); n.material.emissiveIntensity = 1.6; n.scale.setScalar(1.5);
        for (const e of edgeMeshes) {
          if ((e.u === id && seen.has(e.v)) || (e.v === id && seen.has(e.u))) {
            e.m.material.emissive.copy(col); e.m.material.emissiveIntensity = 1.2;
          }
        }
        seen.add(id);
      }
      for (const id of wave) setTimeout(() => nodes[id].scale.setScalar(1.15), 400);
      waveBoard.set(`Волна ${k}: ${wave.length} ${plural(wave.length)} на расстоянии ${k}`);
    }, 700 * k));
  });
}
function plural(n) { return n === 1 ? 'вершина' : n < 5 ? 'вершины' : 'вершин'; }

lab.setFrame((dt, t) => {
  tick(dt);
  for (const b of bars) {
    if (b.userData.heldBy) continue;
    if (b.userData.tx === undefined) continue;
    b.position.x += (b.userData.tx - b.position.x) * Math.min(1, dt * 10);
    b.position.z += (b.userData.tz - b.position.z) * Math.min(1, dt * 10);
  }
  G.rotation.y = Math.sin(t * 0.15) * 0.15;
});

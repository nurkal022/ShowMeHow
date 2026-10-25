import { createLab, makeLabel, pulse, tr } from '../common.js';

// Единицы измерения на табло и приборах.
const uV = tr('В', 'В', 'V'), uA = tr('А', 'А', 'A'), uOhm = tr('Ом', 'Ом', 'Ω'), uW = tr('Вт', 'Вт', 'W'), uMWb = tr('мВб', 'мВб', 'mWb');
const MAG_STOP = tr('Магнит: стоп', 'Магнит: тоқтату', 'Magnet: stop');
const MAG_SWING = tr('Магнит: качать', 'Магнит: тербелту', 'Magnet: swing');
const MAG_FLIP = tr('Перевернуть магнит', 'Магнитті аудару', 'Flip magnet');
import { makeGrid, solve, classify } from './circuit.js';
import { coilFlux, fieldLines } from './induction.js';
import { canvasPanel, glowTexture } from './panel.js';

const ST1 = tr('Электрический стол', 'Электр үстелі', 'Electric bench');
const ST2 = tr('Индукция', 'Индукция', 'Induction');
const lab = createLab({
  title: tr('Электрический стол', 'Электр үстелі', 'Electric bench'),
  hint: tr('Берите детали с подноса и кладите в гнёзда платы — цепь считается сразу, лампы горят по мощности. Щелчок по рычажку — ключ. Мультиметр показывает деталь, которую вы трогали последней. На второй станции проведите магнит сквозь катушку.',
    'Науадан бөлшектерді алып, тақтаның ұяларына салыңыз — тізбек бірден есептеледі, шамдар қуатына қарай жанады. Тұтқаны басу — кілт. Мультиметр сіз соңғы ұстаған бөлшекті көрсетеді. Екінші станцияда магнитті катушка арқылы өткізіңіз.',
    'Take parts from the tray and place them in the board sockets — the circuit is solved instantly and bulbs glow by their power. Click the lever to toggle the switch. The multimeter shows the last part you touched. At the second station, pass the magnet through the coil.'),
  stations: [
    { name: ST1, at: [-0.15, 1.55, 1.1], look: [-0.2, 0.95, -0.35] },
    { name: ST2, at: [22, 1.5, 1.05], look: [22.05, 1.15, -0.4] },
  ],
});
const { THREE, scene } = lab;
const V3 = THREE.Vector3;
const TY = 0.9;

function table(x) {
  const t = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 1.35), new THREE.MeshStandardMaterial({ color: 0x1c2433, roughness: 0.7 }));
  t.position.set(x, TY - 0.04, -0.2);
  scene.add(t);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.012, 1.37), new THREE.MeshStandardMaterial({ color: 0x8ab4f8, emissive: 0x1a73e8, emissiveIntensity: 0.6 }));
  edge.position.set(x, TY - 0.075, -0.2);
  scene.add(edge);
  for (const [dx, dz] of [[-1.28, -0.8], [1.28, -0.8], [-1.28, 0.4], [1.28, 0.4]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, TY, 8), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
    leg.position.set(x + dx, TY / 2, dz);
    scene.add(leg);
  }
}
table(0); table(22);

const metal = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.85, roughness: 0.3 });
const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.35 });
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const glowTex = glowTexture();

// =====================================================================
// Станция 1: макетная плата
// =====================================================================
const COLS = 4, ROWS = 3, S = 0.34, X0 = -1.08, Z0 = -0.62;
const BY = TY + 0.02; // верх платы
const grid = makeGrid(COLS, ROWS);
const nodePos = (i) => new V3(X0 + (i % COLS) * S, BY, Z0 + Math.floor(i / COLS) * S);
for (const s of grid.slots) {
  s.center = nodePos(s.a).add(nodePos(s.b)).multiplyScalar(0.5);
  s.yaw = s.horiz ? 0 : -Math.PI / 2;
  s.occupant = null;
}
const slotByKey = Object.fromEntries(grid.slots.map((s) => [s.key, s]));

{
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.02, 0.92), new THREE.MeshStandardMaterial({ color: 0x0e3b2c, roughness: 0.55, metalness: 0.1 }));
  plate.position.set(X0 + 1.5 * S, TY + 0.01, Z0 + S);
  scene.add(plate);
  const g = new THREE.GridHelper(1.2, 30, 0x1b5e45, 0x16503b);
  g.scale.z = 0.9 / 1.2;
  g.position.set(X0 + 1.5 * S, BY + 0.0008, Z0 + S);
  scene.add(g);
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x2e7d5b, emissive: 0x1b5e45, emissiveIntensity: 0.4 });
  for (const s of grid.slots) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(S - 0.05, 0.003, 0.01), trackMat);
    tr.position.copy(s.center).setY(BY + 0.0015);
    tr.rotation.y = s.yaw;
    scene.add(tr);
  }
  const lbl = makeLabel(tr('Макетная плата · 12 узлов, 17 гнёзд', 'Макеттік тақта · 12 түйін, 17 ұя', 'Breadboard · 12 nodes, 17 sockets'), { scale: 0.0011 });
  lbl.position.set(X0 + 1.5 * S, BY + 0.03, Z0 - 0.2);
  scene.add(lbl);
}
// Узлы: латунные стойки, шляпка светится по потенциалу (синий — минус, красный — плюс).
const nodeCaps = [];
for (let i = 0; i < grid.nodes; i++) {
  const p = nodePos(i);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.03, 14), brass);
  post.position.copy(p).setY(BY + 0.015);
  scene.add(post);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 18),
    new THREE.MeshStandardMaterial({ color: 0x455a64, emissive: 0x000000, roughness: 0.4 }));
  cap.position.copy(p).setY(BY + 0.034);
  scene.add(cap);
  nodeCaps.push(cap);
}
const slotGlow = new THREE.Mesh(new THREE.BoxGeometry(S, 0.006, 0.06),
  new THREE.MeshBasicMaterial({ color: 0x8ab4f8, transparent: true, opacity: 0.55, depthWrite: false }));
slotGlow.visible = false;
scene.add(slotGlow);

// Поднос
const TRAY = { x: [0.36, 0.74, 1.12], z: [-0.72, -0.52, -0.32, -0.12, 0.08] };
{
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.012, 1.08), new THREE.MeshStandardMaterial({ color: 0x232c3d, roughness: 0.9 }));
  tray.position.set(0.74, TY + 0.006, -0.32);
  scene.add(tray);
  const lbl = makeLabel(tr('Детали', 'Бөлшектер', 'Parts'), { scale: 0.0009 });
  lbl.position.set(0.74, TY + 0.03, 0.24);
  scene.add(lbl);
}

// ---------- Детали ----------
function lead(g, x0, x1, y = 0.01) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, Math.abs(x1 - x0), 6), metal);
  m.rotation.z = Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, 0);
  g.add(m);
}
function hitBox(g, h = 0.1) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, h, 0.09), hitMat);
  b.position.y = h / 2;
  g.add(b);
}
const BUILD = {
  battery(p) {
    const g = new THREE.Group();
    const plus = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4, metalness: 0.3, emissive: 0xff1744, emissiveIntensity: 0 }));
    plus.rotation.z = Math.PI / 2; plus.position.set(0.05, 0.04, 0);
    const minus = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.4, metalness: 0.3 }));
    minus.rotation.z = Math.PI / 2; minus.position.set(-0.05, 0.04, 0);
    const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.016, 12), metal);
    nub.rotation.z = Math.PI / 2; nub.position.set(0.107, 0.04, 0);
    g.add(plus, minus, nub);
    const mk = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.007), mk); h1.position.set(0.05, 0.081, 0);
    const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.004, 0.03), mk); v1.position.set(0.05, 0.081, 0);
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.007), mk); h2.position.set(-0.05, 0.081, 0);
    g.add(h1, v1, h2);
    lead(g, 0.115, 0.17); lead(g, -0.1, -0.17);
    p.body = plus;
    return g;
  },
  bulb(p) {
    const g = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 16), metal);
    sock.position.y = 0.025;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.048, 24, 16), new THREE.MeshStandardMaterial({
      color: 0xfff8e1, transparent: true, opacity: 0.35, roughness: 0.1, emissive: 0xffc46b, emissiveIntensity: 0, depthWrite: false }));
    glass.position.y = 0.098;
    const fil = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0025, 6, 18, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: 0x5d4037, emissive: 0xffb74d, emissiveIntensity: 0 }));
    fil.position.y = 0.094;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd180, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.y = 0.098;
    g.add(sock, glass, fil, halo);
    lead(g, 0.026, 0.17); lead(g, -0.026, -0.17);
    Object.assign(p, { glass, fil, halo });
    return g;
  },
  resistor(p) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 18), new THREE.MeshStandardMaterial({ color: 0xd7c39b, roughness: 0.6 }));
    body.rotation.z = Math.PI / 2; body.position.y = 0.022;
    g.add(body);
    const bands = p.R === 10 ? [0x6d4c41, 0x111111, 0x111111, 0xd4af37] : [0xe53935, 0xe53935, 0x111111, 0xd4af37];
    bands.forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0212, 0.0212, 0.009, 18), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
      b.rotation.z = Math.PI / 2; b.position.set(-0.042 + i * 0.024 + (i === 3 ? 0.012 : 0), 0.022, 0);
      g.add(b);
    });
    lead(g, 0.065, 0.17); lead(g, -0.065, -0.17);
    return g;
  },
  switch(p) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.07), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6 }));
    base.position.y = 0.01;
    g.add(base);
    for (const x of [-0.07, 0.07]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10), brass);
      post.position.set(x, 0.03, 0);
      g.add(post);
    }
    const pivot = new THREE.Group();
    pivot.position.set(-0.07, 0.044, 0);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.022), metal);
    lever.position.x = 0.08;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 }));
    knob.position.set(0.16, 0.01, 0);
    pivot.add(lever, knob);
    g.add(pivot);
    // Рычажок ловит клик выше и шире корпуса, чтобы щелчок не превращался в «взять».
    const leverHit = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.07), hitMat);
    leverHit.position.set(0.1, 0.02, 0);
    pivot.add(leverHit);
    lead(g, 0.1, 0.17); lead(g, -0.1, -0.17);
    p.pivot = pivot;
    lab.click(leverHit, () => { p.closed = !p.closed; dirty = true; selected = p; });
    lab.hover(leverHit, () => (p.closed ? tr('Ключ замкнут\nЩёлкните — разомкнуть', 'Кілт тұйықталған\nАжырату үшін басыңыз', 'Switch closed\nClick to open') : tr('Ключ разомкнут\nЩёлкните — замкнуть', 'Кілт ажыратылған\nТұйықтау үшін басыңыз', 'Switch open\nClick to close')));
    return g;
  },
  wire(p) {
    const g = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(new V3(-0.17, 0.008, 0), new V3(0, 0.07, 0), new V3(0.17, 0.008, 0));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.0065, 8), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.45 }));
    g.add(tube);
    for (const x of [-0.17, 0.17]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), metal);
      tip.position.set(x, 0.008, 0);
      g.add(tip);
    }
    return g;
  },
};
const SPEC = {
  battery: { name: tr('Батарейка', 'Батарея', 'Battery'), E: 6, r: 0.3, path: [0.088, 0] },
  bulb: { name: tr('Лампа', 'Шам', 'Bulb'), R: 6, Pnom: 5, path: [0.012, 0.085] },
  resistor: { name: tr('Резистор', 'Резистор', 'Resistor'), path: [0.048, 0] },
  switch: { name: tr('Ключ', 'Кілт', 'Switch'), path: [0.062, 0] },
  wire: { name: tr('Провод', 'Сым', 'Wire'), path: [0.012, 0.03] },
};

const parts = [];
let dirty = true;
let selected = null;
const WIRE_COLORS = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xfb8c00, 0x8e24aa, 0xeceff1];
const inventory = [
  ['battery'], ['bulb', 1], ['bulb', 2], ['bulb', 3], ['resistor', 10], ['resistor', 22], ['switch'],
  ...WIRE_COLORS.map((c) => ['wire', c]),
];
inventory.forEach(([type, arg], i) => {
  const p = { type, slot: null, flip: false, closed: true };
  if (type === 'bulb') p.label = `${tr('Лампа', 'Шам', 'Bulb')} ${arg}`;
  else if (type === 'resistor') { p.R = arg; p.label = `${tr('Резистор', 'Резистор', 'Resistor')} ${arg} ${uOhm}`; }
  else if (type === 'wire') { p.color = arg; p.label = tr('Провод', 'Сым', 'Wire'); }
  else p.label = SPEC[type].name;
  const g = BUILD[type](p);
  hitBox(g, type === 'bulb' ? 0.15 : type === 'switch' ? 0.035 : 0.1);
  p.g = g;
  p.home = new V3(TRAY.x[i % 3], TY + 0.012, TRAY.z[Math.floor(i / 3)]);
  g.position.copy(p.home);
  scene.add(g);
  parts.push(p);
  lab.grab(g, {
    onGrab: () => { unslot(p); selected = p; dirty = true; },
    onMove: (o) => {
      if (o.userData.heldBy === 'mouse') {
        o.position.y = BY + 0.05;
        o.position.x = Math.max(-1.3, Math.min(1.3, o.position.x));
        o.position.z = Math.max(-0.85, Math.min(0.45, o.position.z));
      }
      const s = candidateSlot(o);
      slotGlow.visible = !!s;
      if (s) { slotGlow.position.copy(s.center).setY(BY + 0.004); slotGlow.rotation.y = s.yaw; }
    },
    onRelease: (o) => { slotGlow.visible = false; drop(p, o); },
  });
  lab.hover(g, () => partLabel(p));
});

const tmpV = new V3(), tmpQ = new THREE.Quaternion();
function candidateSlot(o) {
  o.getWorldPosition(tmpV);
  if (tmpV.y > BY + 0.4) return null;
  let best = null, bd = 0.13;
  for (const s of grid.slots) {
    if (s.occupant) continue;
    const d = Math.hypot(s.center.x - tmpV.x, s.center.z - tmpV.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function unslot(p) { if (p.slot) { p.slot.occupant = null; p.slot = null; dirty = true; } }
function place(p, s, flip) {
  unslot(p);
  s.occupant = p; p.slot = s; p.flip = flip;
  p.g.position.copy(s.center);
  p.g.rotation.set(0, s.yaw + (flip ? Math.PI : 0), 0);
  dirty = true;
}
function goHome(p) { unslot(p); p.flip = false; p.g.position.copy(p.home); p.g.rotation.set(0, 0, 0); }
function drop(p, o) {
  const s = candidateSlot(o);
  if (s) {
    o.getWorldQuaternion(tmpQ);
    const ax = new V3(1, 0, 0).applyQuaternion(tmpQ);
    const dir = s.horiz ? new V3(1, 0, 0) : new V3(0, 0, 1);
    place(p, s, ax.dot(dir) < -0.05);
    return;
  }
  o.getWorldPosition(tmpV);
  if (Math.abs(tmpV.x) < 1.3 && tmpV.z > -0.85 && tmpV.z < 0.45 && tmpV.y < TY + 0.8) {
    o.getWorldQuaternion(tmpQ);
    const ax = new V3(1, 0, 0).applyQuaternion(tmpQ);
    o.position.set(tmpV.x, TY + 0.012, tmpV.z);
    o.rotation.set(0, Math.atan2(-ax.z, ax.x), 0);
  } else goHome(p);
  dirty = true;
}

// ---------- Пресеты ----------
const PRESETS = {
  parallel: [['v 0 0', 'battery'], ['h 0 0', 'wire'], ['v 1 0', 'bulb'], ['h 1 0', 'wire'], ['h 0 1', 'switch'], ['v 2 0', 'bulb'], ['h 1 1', 'wire'], ['h 0 2', 'wire'], ['v 3 0', 'bulb'], ['h 1 2', 'wire']],
  series: [['v 0 0', 'battery'], ['h 0 0', 'bulb'], ['h 0 1', 'bulb'], ['h 0 2', 'switch'], ['v 3 0', 'wire'], ['h 1 2', 'wire'], ['h 1 1', 'wire'], ['h 1 0', 'wire']],
  mixed: [['v 0 0', 'battery'], ['h 0 0', 'resistor'], ['v 1 0', 'bulb'], ['h 1 0', 'wire'], ['h 0 1', 'wire'], ['v 2 0', 'bulb'], ['h 1 1', 'wire']],
};
function applyPreset(name) {
  parts.forEach(goHome);
  const used = new Set();
  for (const [key, type] of PRESETS[name] ?? []) {
    const p = parts.find((x) => x.type === type && !used.has(x));
    if (!p) continue;
    used.add(p);
    p.closed = true;
    place(p, slotByKey[key], false);
  }
  selected = parts.find((x) => x.type === 'bulb' && x.slot) ?? null;
  dirty = true;
}
function flipBattery() {
  const b = parts.find((x) => x.type === 'battery');
  if (b.slot) place(b, b.slot, !b.flip);
  selected = b;
}
const PRESET_BTNS = [
  [tr('Последовательно', 'Тізбектей', 'Series'), () => applyPreset('series')], [tr('Параллельно', 'Параллель', 'Parallel'), () => applyPreset('parallel')],
  [tr('Смешанно', 'Аралас', 'Mixed'), () => applyPreset('mixed')], [tr('Убрать всё', 'Бәрін алу', 'Clear all'), () => applyPreset('none')],
  [tr('Перевернуть батарейку', 'Батареяны аудару', 'Flip battery'), flipBattery],
];
PRESET_BTNS.forEach(([t, fn], i) => {
  lab.hud.action(t, fn, ST1);
  lab.button3d(t, [i === 4 ? 0.74 : 0.44 + (i % 2) * 0.6, TY + 0.14 + Math.floor(i / 2) * 0.2, -0.95], fn, { width: i === 4 ? 0.9 : 0.56, color: i === 3 ? 0x546e7a : 0x1a73e8 });
});

// ---------- Ток: электроны, свет, потенциалы ----------
const DPS = 6;
const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0085, 8, 6), new THREE.MeshBasicMaterial({ color: 0x84ffff }), grid.slots.length * DPS);
dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
dots.frustumCulled = false;
scene.add(dots);
const phase = new Float32Array(grid.slots.length);
const boardLight = new THREE.PointLight(0xffc46b, 0, 2.6, 1.6);
boardLight.position.set(X0 + 1.5 * S, BY + 0.35, Z0 + S);
scene.add(boardLight);

let circuit = { els: [], res: null, kind: 'none', bat: null, short: false };
function recompute() {
  const els = [];
  for (const s of grid.slots) {
    const p = s.occupant;
    if (!p) continue;
    if (p.type === 'switch' && !p.closed) { p.ea = p.eb = null; continue; }
    const a = p.flip ? s.b : s.a, b = p.flip ? s.a : s.b;
    p.ea = a; p.eb = b;
    if (p.type === 'battery') els.push({ id: p, a, b, kind: 'E', E: SPEC.battery.E, r: SPEC.battery.r });
    else if (p.type === 'bulb') els.push({ id: p, a, b, kind: 'R', R: SPEC.bulb.R });
    else if (p.type === 'resistor') els.push({ id: p, a, b, kind: 'R', R: p.R });
    else els.push({ id: p, a, b, kind: 'R', R: 0.005, short: true });
  }
  const res = solve(grid.nodes, els);
  const bat = parts.find((x) => x.type === 'battery');
  const batR = res.el.get(bat);
  circuit = { els, res, kind: classify(grid.nodes, els, res), bat: batR ?? null, short: !!batR && Math.abs(batR.I) > 8 };
  // Потенциалы узлов
  const used = new Set(els.flatMap((e) => [e.a, e.b]));
  let vmin = Infinity;
  used.forEach((i) => { vmin = Math.min(vmin, res.V[i]); });
  nodeCaps.forEach((cap, i) => {
    if (!used.has(i) || !batR) { cap.material.emissive.setHex(0x000000); cap.material.color.setHex(0x455a64); return; }
    const t = Math.max(0, Math.min(1, (res.V[i] - vmin) / SPEC.battery.E));
    cap.material.color.setRGB(0.16 + 0.84 * t, 0.35 - 0.1 * t, 1 - 0.75 * t);
    cap.material.emissive.copy(cap.material.color).multiplyScalar(0.6);
  });
  // Лампы
  let light = 0;
  for (const p of parts) {
    if (p.type !== 'bulb') continue;
    const r = p.slot ? res.el.get(p) : null;
    const k = r ? Math.min(1.6, r.P / SPEC.bulb.Pnom) : 0;
    p.bright = k;
    light += k;
    p.fil.material.emissiveIntensity = k * 6;
    p.fil.material.emissive.setRGB(1, 0.45 + 0.4 * Math.min(1, k), 0.15 + 0.6 * Math.min(1, k) * Math.min(1, k));
    p.glass.material.emissiveIntensity = k * 1.4;
    p.halo.material.opacity = Math.min(1, k) * 0.95;
    const sc = 0.08 + 0.32 * Math.sqrt(k);
    p.halo.scale.set(sc, sc, 1);
  }
  boardLight.intensity = Math.min(3, light) * 1.4;
  drawSchematic();
  drawMeter();
}

function partLabel(p) {
  const r = p.slot && circuit.res ? circuit.res.el.get(p) : null;
  if (!r) return `${p.label}\n${p.slot ? (p.type === 'switch' ? tr('разомкнут', 'ажыратылған', 'open') : tr('тока нет', 'ток жоқ', 'no current')) : tr('не в цепи', 'тізбекте емес', 'not in circuit')}`;
  if (p.type === 'wire' || p.type === 'switch') return `${p.label}\nI = ${fmt(Math.abs(r.I))} ${uA}`;
  return `${p.label}\nU = ${fmt(Math.abs(r.U))} ${uV}\nI = ${fmt(Math.abs(r.I))} ${uA}`;
}
function fmt(x) { return x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3); }

const _m = new THREE.Matrix4(), _p = new V3(), _a = new V3(), _b = new V3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
function updateDots(dt) {
  grid.slots.forEach((s, si) => {
    const p = s.occupant;
    const r = p && p.ea != null && circuit.res ? circuit.res.el.get(p) : null;
    const I = r ? r.I : 0;
    if (Math.abs(I) < 0.003) { for (let k = 0; k < DPS; k++) dots.setMatrixAt(si * DPS + k, HIDE); return; }
    // Электроны идут против условного тока: от eb к ea, если I > 0.
    const sp = Math.min(1.4, 0.12 + Math.abs(I) * 0.45);
    phase[si] = (phase[si] + dt * sp) % 1;
    const from = I > 0 ? p.eb : p.ea, to = I > 0 ? p.ea : p.eb;
    _a.copy(nodePos(from)); _b.copy(nodePos(to));
    const [base, arc] = SPEC[p.type].path;
    for (let k = 0; k < DPS; k++) {
      const t = (phase[si] + k / DPS) % 1;
      _p.lerpVectors(_a, _b, t);
      _p.y = BY + base + arc * Math.sin(Math.PI * t);
      _m.makeTranslation(_p.x, _p.y, _p.z);
      dots.setMatrixAt(si * DPS + k, _m);
    }
  });
  dots.instanceMatrix.needsUpdate = true;
}

// ---------- Схема на стене ----------
const schem = canvasPanel(1.5, 0.88, 1024);
schem.mesh.position.set(-0.55, 1.56, -1.05);
scene.add(schem.mesh);
{
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.94, 0.03), new THREE.MeshStandardMaterial({ color: 0x263247, roughness: 0.6 }));
  frame.position.set(-0.55, 1.56, -1.067);
  scene.add(frame);
  for (const dx of [-0.6, 0.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
    leg.position.set(-0.55 + dx, 0.6, -1.08);
    scene.add(leg);
  }
}
const KIND = {
  none: tr('ток не идёт', 'ток жүрмейді', 'no current'),
  single: tr('одна нагрузка', 'бір жүктеме', 'single load'),
  series: tr('последовательное', 'тізбектей', 'series'),
  parallel: tr('параллельное', 'параллель', 'parallel'),
  mixed: tr('смешанное', 'аралас', 'mixed'),
};
function drawSchematic() {
  schem.draw((c, W, H) => {
    c.fillStyle = '#0f1622'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#1d2a3f'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.fillStyle = '#8ab4f8'; c.font = '600 30px Inter, system-ui, sans-serif';
    c.fillText(tr('Схема собирается сама', 'Сұлба өздігінен құрастырылады', 'The diagram draws itself'), 28, 44);
    const np = (i) => [190 + (i % COLS) * 220, 120 + Math.floor(i / COLS) * 150];
    for (const s of grid.slots) {
      const p = s.occupant;
      if (!p) continue;
      const a = p.flip ? s.b : s.a, b = p.flip ? s.a : s.b;
      const [x1, y1] = np(a), [x2, y2] = np(b);
      const r = circuit.res?.el.get(p);
      const live = r && Math.abs(r.I) > 0.003;
      c.save();
      c.translate((x1 + x2) / 2, (y1 + y2) / 2);
      c.rotate(Math.atan2(y2 - y1, x2 - x1));
      const L = Math.hypot(x2 - x1, y2 - y1) / 2;
      c.strokeStyle = live ? '#84ffff' : '#90a4ae'; c.lineWidth = 4; c.lineCap = 'round';
      const line = (u0, u1) => { c.beginPath(); c.moveTo(u0, 0); c.lineTo(u1, 0); c.stroke(); };
      if (p.type === 'wire') line(-L, L);
      else if (p.type === 'battery') {
        line(-L, -9); line(9, L);
        c.strokeStyle = circuit.short ? '#ff5252' : '#eef2f7';
        c.lineWidth = 9; c.beginPath(); c.moveTo(-9, -16); c.lineTo(-9, 16); c.stroke();
        c.lineWidth = 4; c.beginPath(); c.moveTo(9, -32); c.lineTo(9, 32); c.stroke();
      } else if (p.type === 'bulb') {
        line(-L, -30); line(30, L);
        const k = Math.min(1, p.bright ?? 0);
        c.fillStyle = `rgba(255, 200, 90, ${k})`; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill();
        c.stroke();
        c.beginPath(); c.moveTo(-21, -21); c.lineTo(21, 21); c.moveTo(21, -21); c.lineTo(-21, 21); c.stroke();
      } else if (p.type === 'resistor') {
        line(-L, -40); line(40, L);
        c.strokeRect(-40, -15, 80, 30);
      } else if (p.type === 'switch') {
        line(-L, -30); line(30, L);
        c.beginPath(); c.moveTo(-30, 0); c.lineTo(28, p.closed ? 0 : -30); c.stroke();
      }
      c.restore();
      // Подпись — по нормали к элементу, без поворота текста.
      if (p.type !== 'wire') {
        const sx = s.horiz ? 0 : 1, sy = s.horiz ? -1 : 0;
        const tx = (x1 + x2) / 2 + sx * 50, ty = (y1 + y2) / 2 + sy * 50;
        c.font = '500 22px Inter, system-ui, sans-serif';
        c.textAlign = s.horiz ? 'center' : 'left';
        c.fillStyle = '#b7c0cf';
        const name = p.type === 'battery' ? `6 ${uV}` : p.type === 'bulb' ? `${tr('Л', 'Ш', 'L')}${p.label.slice(-1)}` : p.type === 'resistor' ? `${p.R} ${uOhm}` : 'K';
        c.fillText(name, tx, ty - 6);
        if (live && p.type !== 'switch') { c.fillStyle = '#84ffff'; c.fillText(`${fmt(Math.abs(r.I))} ${uA}`, tx, ty + 20); }
        c.textAlign = 'left';
      }
    }
    for (let i = 0; i < grid.nodes; i++) {
      const [x, y] = np(i);
      c.fillStyle = '#c9a227'; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
    }
    // Итог
    c.fillStyle = 'rgba(14,18,28,.9)'; c.fillRect(0, H - 130, W, 130);
    c.font = '500 28px Inter, system-ui, sans-serif';
    const b = circuit.bat;
    if (!b) { c.fillStyle = '#b7c0cf'; c.fillText(tr('Положите батарейку в гнездо платы', 'Батареяны тақтаның ұясына салыңыз', 'Put the battery into a board socket'), 28, H - 78); return; }
    if (circuit.short) {
      c.fillStyle = '#ff5252';
      c.fillText(tr(`Короткое замыкание! I = ${fmt(Math.abs(b.I))} А — ток ограничивает только r = 0,3 Ом`, `Қысқа тұйықталу! I = ${fmt(Math.abs(b.I))} А — токты тек r = 0,3 Ом шектейді`, `Short circuit! I = ${fmt(Math.abs(b.I))} A — only r = 0.3 Ω limits the current`), 28, H - 78);
      c.fillStyle = '#b7c0cf';
      c.fillText(tr('Уберите провод, идущий в обход нагрузки', 'Жүктемені айналып өтетін сымды алыңыз', 'Remove the wire that bypasses the load'), 28, H - 32);
      return;
    }
    const I = Math.abs(b.I);
    const R = I > 1e-3 ? Math.abs(b.U) / I : Infinity;
    c.fillStyle = '#eef2f7';
    c.fillText(`E = 6 ${uV} · r = ${tr('0,3', '0,3', '0.3')} ${uOhm} · I = ${fmt(I)} ${uA} · U = ${fmt(Math.abs(b.U))} ${uV} · R = ${R === Infinity ? '∞' : fmt(R)} ${uOhm}`, 28, H - 78);
    c.fillStyle = '#ffd180';
    c.fillText(tr(`Соединение: ${KIND[circuit.kind]}   ·   закон Ома: I = E / (R + r)`, `Жалғау: ${KIND[circuit.kind]}   ·   Ом заңы: I = E / (R + r)`, `Connection: ${KIND[circuit.kind]}   ·   Ohm\'s law: I = E / (R + r)`), 28, H - 32);
  });
}

// ---------- Мультиметр ----------
const meter = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.17), new THREE.MeshStandardMaterial({ color: 0xf9a825, roughness: 0.55 }));
  body.position.y = 0.0225;
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.004, 0.15), new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.7 }));
  face.position.y = 0.046;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 20), new THREE.MeshStandardMaterial({ color: 0x424242 }));
  knob.position.set(0.075, 0.054, 0.02);
  meter.add(body, face, knob);
  for (const [x, col] of [[0.06, 0xe53935], [0.095, 0x111111]]) {
    const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.01, 10), new THREE.MeshStandardMaterial({ color: col }));
    jack.position.set(x, 0.05, 0.06);
    meter.add(jack);
  }
  meter.position.set(-0.55, TY, 0.3);
  meter.rotation.x = 0;
  scene.add(meter);
  lab.hover(body, tr('Мультиметр\nпоследняя деталь', 'Мультиметр\nсоңғы бөлшек', 'Multimeter\nlast part touched'));
  // Щупы — декоративные провода к краю платы.
  for (const [x, col] of [[0.06, 0xe53935], [0.095, 0x212121]]) {
    const pts = [new V3(-0.55 + x, TY + 0.05, 0.36), new V3(-0.55 + x + 0.05, TY + 0.03, 0.42), new V3(-0.2 + x, TY + 0.012, 0.36), new V3(-0.1 + x * 2, TY + 0.012, 0.22)];
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.004, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
    scene.add(t);
  }
}
const lcd = canvasPanel(0.15, 0.085, 384);
lcd.mesh.rotation.x = -Math.PI / 2;
lcd.mesh.position.set(-0.025, 0.0485, -0.01);
meter.add(lcd.mesh);
function drawMeter() {
  lcd.draw((c, W, H) => {
    c.fillStyle = '#a7c4a0'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1b2a1b';
    const p = selected;
    const r = p && p.slot && circuit.res ? circuit.res.el.get(p) : null;
    c.font = '600 28px Inter, system-ui, sans-serif';
    c.fillText(p ? p.label : tr('Мультиметр', 'Мультиметр', 'Multimeter'), 14, 34);
    c.font = '700 40px ui-monospace, Menlo, monospace';
    if (!r) { c.fillText(`U ---- ${uV}`, 14, 96); c.fillText(`I ---- ${uA}`, 14, 150); }
    else {
      c.fillText(`U ${fmt(Math.abs(r.U)).padStart(6)} ${uV}`, 14, 96);
      c.fillText(`I ${fmt(Math.abs(r.I)).padStart(6)} ${uA}`, 14, 150);
      c.font = '600 26px Inter, system-ui, sans-serif';
      c.fillText(`P = ${fmt(r.P)} ${uW}`, 14, 196);
    }
  });
}

// =====================================================================
// Станция 2: индукция
// =====================================================================
const X2 = 22;
const COIL = { center: [X2 - 0.15, 1.12, -0.25], axis: [1, 0, 0], radius: 0.085, length: 0.32, turns: 200 };
const C = new V3(...COIL.center);
const copper = new THREE.MeshStandardMaterial({ color: 0xc8793f, metalness: 0.8, roughness: 0.32, emissive: 0xff7a2f, emissiveIntensity: 0 });
{
  class Helix extends THREE.Curve {
    getPoint(t, out = new V3()) {
      const a = 2 * Math.PI * 16 * t;
      return out.set(C.x - COIL.length / 2 + COIL.length * t, C.y + (COIL.radius) * Math.cos(a), C.z + COIL.radius * Math.sin(a));
    }
  }
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 640, 0.0065, 6), copper));
  const former = new THREE.Mesh(new THREE.CylinderGeometry(COIL.radius - 0.008, COIL.radius - 0.008, COIL.length + 0.05, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x9ecbff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  former.rotation.z = Math.PI / 2; former.position.copy(C);
  scene.add(former);
  for (const dx of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.TorusGeometry(COIL.radius + 0.004, 0.012, 8, 40), new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.6 }));
    fl.rotation.y = Math.PI / 2; fl.position.set(C.x + dx * (COIL.length / 2 + 0.02), C.y, C.z);
    scene.add(fl);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.03, C.y - COIL.radius - TY, 0.1), new THREE.MeshStandardMaterial({ color: 0x37474f }));
    stand.position.set(C.x + dx * (COIL.length / 2 + 0.02), TY + (C.y - COIL.radius - TY) / 2, C.z);
    scene.add(stand);
  }
  const lbl = makeLabel(tr('Катушка · N = 200 витков', 'Катушка · N = 200 орам', 'Coil · N = 200 turns'), { scale: 0.0011 });
  lbl.position.set(C.x, C.y + 0.42, C.z - 0.1);
  scene.add(lbl);
  // Направляющие для магнита
  for (const dz of [-0.022, 0.022]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.7, 6), new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.7, roughness: 0.3, transparent: true, opacity: 0.6 }));
    rail.rotation.z = Math.PI / 2; rail.position.set(C.x - 0.1, C.y - 0.03, C.z + dz);
    scene.add(rail);
  }
  for (const dx of [-0.95, 0.75]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, C.y - 0.03 - TY, 6), new THREE.MeshStandardMaterial({ color: 0x546e7a }));
    post.position.set(C.x + dx, TY + (C.y - 0.03 - TY) / 2, C.z);
    scene.add(post);
  }
}

// Гальванометр
const galv = new THREE.Group();
galv.position.set(X2 + 0.66, TY, -0.5);
galv.rotation.y = -0.35;
scene.add(galv);
const needle = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.12), new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.5, metalness: 0.2 }));
  body.position.y = 0.17;
  galv.add(body);
  lab.hover(body, () => `${tr('Гальванометр', 'Гальванометр', 'Galvanometer')}\nε = ${emf.toFixed(3)} ${uV}`);
  const dial = canvasPanel(0.36, 0.22, 512);
  dial.mesh.position.set(0, 0.2, 0.061);
  galv.add(dial.mesh);
  dial.draw((c, W, H) => {
    c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H - 30, R = H - 70;
    c.strokeStyle = '#263238'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85); c.stroke();
    c.font = '600 22px Inter, system-ui, sans-serif'; c.fillStyle = '#263238'; c.textAlign = 'center';
    for (let i = -10; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * 0.85;
      const big = i % 5 === 0;
      c.lineWidth = big ? 3 : 1.5;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      c.lineTo(cx + Math.cos(a) * (R - (big ? 22 : 12)), cy + Math.sin(a) * (R - (big ? 22 : 12))); c.stroke();
      if (big) c.fillText(['−1', '−0,5', '0', '+0,5', '+1'][(i + 10) / 5], cx + Math.cos(a) * (R - 44), cy + Math.sin(a) * (R - 44) + 8);
    }
    c.fillStyle = '#c62828'; c.fillRect(cx - 3, cy - R - 4, 6, 14);
    c.font = '600 20px Inter, system-ui, sans-serif'; c.fillStyle = '#546e7a';
    c.fillText(tr('ЭДС, В', 'ЭҚК, В', 'EMF, V'), cx, cy - 34);
  });
  // Ось стрелки совпадает с центром шкалы: 30 px от низа canvas высотой 313 px.
  needle.position.set(0, 0.2 - 0.11 + (30 / 313) * 0.22, 0.066);
  const n = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.13, 0.003), new THREE.MeshBasicMaterial({ color: 0xc62828 }));
  n.position.y = 0.065;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), new THREE.MeshStandardMaterial({ color: 0x263238 }));
  hub.rotation.x = Math.PI / 2;
  needle.add(n, hub);
  galv.add(needle);
  for (const [x, col] of [[-0.1, 0xe53935], [0.1, 0x212121]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }));
    post.position.set(x, 0.36, 0.02);
    galv.add(post);
  }
}
const readout = canvasPanel(0.3, 0.05, 384);
readout.mesh.position.set(0, 0.045, 0.061);
galv.add(readout.mesh);
// Провода от катушки к гальванометру
{
  scene.updateMatrixWorld(true);
  const tA = galv.localToWorld(new V3(-0.1, 0.37, 0.02)), tB = galv.localToWorld(new V3(0.1, 0.37, 0.02));
  const ends = [new V3(C.x - COIL.length / 2, C.y + COIL.radius, C.z), new V3(C.x + COIL.length / 2, C.y + COIL.radius, C.z)];
  const mk = (from, to, col, lift) => {
    const mid = from.clone().lerp(to, 0.5); mid.y += lift; mid.z -= 0.15;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, from.clone().add(new V3(0, 0.12, -0.04)), mid, to.clone().add(new V3(0, 0.1, 0)), to]), 40, 0.006, 6),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
    scene.add(tube);
  };
  mk(ends[0], tA, 0xe53935, 0.25);
  mk(ends[1], tB, 0x263238, 0.18);
}

// Магнит
const magnet = new THREE.Group();
{
  const n = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4, metalness: 0.2 }));
  n.position.x = 0.06;
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x1e88e5, roughness: 0.4, metalness: 0.2 }));
  s.position.x = -0.06;
  magnet.add(n, s);
  const ln = makeLabel('N', { scale: 0.0011, bg: 'rgba(0,0,0,0)' }); ln.position.set(0.07, 0.05, 0);
  const ls = makeLabel('S', { scale: 0.0011, bg: 'rgba(0,0,0,0)' }); ls.position.set(-0.07, 0.05, 0);
  magnet.add(ln, ls);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), hitMat);
  magnet.add(hit);
  // Силовые линии: от N к S, цвет от красного к синему.
  const lines = fieldLines();
  const pos = [], col = [];
  const cN = new THREE.Color(0xff8a80), cS = new THREE.Color(0x82b1ff), tc = new THREE.Color();
  for (const l of lines) {
    for (let i = 0; i < l.length - 1; i++) {
      for (const j of [i, i + 1]) {
        pos.push(...l[j]);
        tc.lerpColors(cN, cS, j / (l.length - 1));
        col.push(tc.r, tc.g, tc.b);
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  magnet.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })));
  // Бегущие по линиям точки
  const flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe082 }), lines.length * 2);
  flow.frustumCulled = false;
  flow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  magnet.add(flow);
  magnet.userData.flow = { mesh: flow, lines: lines.map((l) => {
    const cum = [0];
    for (let i = 1; i < l.length; i++) cum.push(cum[i - 1] + Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1], l[i][2] - l[i - 1][2]));
    return { l, cum, len: cum[cum.length - 1] };
  }) };
}
const MAG_HOME_X = C.x - 0.6;
magnet.position.set(MAG_HOME_X, C.y, C.z);
scene.add(magnet);
let auto = true;
let magFlip = false;
lab.hover(magnet, () => `${tr('Полосовой магнит', 'Жолақ магнит', 'Bar magnet')}\nΦ = ${(flux * 1000).toFixed(1)} ${uMWb} · ε = ${emf.toFixed(2)} ${uV}`);
lab.grab(magnet, {
  onGrab: () => { setAuto(false); },
  onMove: (o) => {
    if (o.userData.heldBy !== 'mouse') return;
    o.position.y = C.y; o.position.z = C.z;
    o.position.x = Math.max(C.x - 0.95, Math.min(C.x + 0.55, o.position.x));
  },
  onRelease: (o) => {
    o.position.y = C.y; o.position.z = C.z;
    o.position.x = Math.max(C.x - 0.95, Math.min(C.x + 0.55, o.position.x));
    o.rotation.set(0, magFlip ? Math.PI : 0, 0);
  },
});
function setAuto(v) { auto = v; autoBtn.textContent = auto ? MAG_STOP : MAG_SWING; autoBtn3d.setText(auto ? MAG_STOP : MAG_SWING); }
function flipMagnet() { magFlip = !magFlip; magnet.rotation.set(0, magFlip ? Math.PI : 0, 0); }
const autoBtn = lab.hud.action(MAG_STOP, () => setAuto(!auto), ST2);
lab.hud.action(MAG_FLIP, flipMagnet, ST2);
const autoBtn3d = lab.button3d(MAG_STOP, [X2 - 1.0, TY + 0.36, -0.55], () => setAuto(!auto), { width: 0.6, rotY: 0.35 });
lab.button3d(MAG_FLIP, [X2 - 1.0, TY + 0.15, -0.55], flipMagnet, { width: 0.75, color: 0x546e7a, rotY: 0.35 });

// График ε(t) и Φ(t)
const plot = canvasPanel(1.5, 0.62, 768);
plot.mesh.position.set(X2, 1.82, -1.05);
scene.add(plot.mesh);
{
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.68, 0.03), new THREE.MeshStandardMaterial({ color: 0x263247, roughness: 0.6 }));
  frame.position.set(X2, 1.82, -1.067);
  scene.add(frame);
  for (const dx of [-0.6, 0.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
    leg.position.set(X2 + dx, 0.75, -1.08);
    scene.add(leg);
  }
}
const HIST = 300;
const histE = new Float32Array(HIST), histF = new Float32Array(HIST);
function drawPlot() {
  plot.draw((c, W, H) => {
    c.fillStyle = '#0f1622'; c.fillRect(0, 0, W, H);
    const top = 70, bot = H - 24, mid = (top + bot) / 2, half = (bot - top) / 2;
    c.strokeStyle = '#1d2a3f'; c.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const x = 20 + (i / 10) * (W - 40); c.beginPath(); c.moveTo(x, top); c.lineTo(x, bot); c.stroke(); }
    c.strokeStyle = '#3a4a66'; c.beginPath(); c.moveTo(20, mid); c.lineTo(W - 20, mid); c.stroke();
    const curve = (arr, scale, color) => {
      c.strokeStyle = color; c.lineWidth = 3; c.beginPath();
      for (let i = 0; i < HIST; i++) {
        const x = 20 + (i / (HIST - 1)) * (W - 40);
        const y = mid - Math.max(-1.05, Math.min(1.05, arr[(histI + i) % HIST] / scale)) * half;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    };
    curve(histF, 0.16, '#82b1ff');
    curve(histE, 1.2, '#ffab40');
    c.font = '600 24px Inter, system-ui, sans-serif';
    c.fillStyle = '#ffab40'; c.fillText(`ε = −N·ΔΦ/Δt = ${emf >= 0 ? '+' : '−'}${Math.abs(emf).toFixed(3)} ${uV}`, 20, 34);
    c.fillStyle = '#82b1ff'; c.fillText(`Φ = ${(flux * 1000).toFixed(1)} ${uMWb}`, 470, 34);
    c.fillStyle = '#7d8aa0'; c.font = '500 17px Inter, system-ui, sans-serif';
    c.fillText(tr('ЭДС есть, пока поток меняется: магнит стоит — стрелка на нуле', 'Ағын өзгергенде ғана ЭҚК бар: магнит тұрса — тіл нөлде', 'EMF exists only while the flux changes: magnet still — needle at zero'), 20, 60);
  });
  readout.draw((c, W, H) => {
    c.fillStyle = '#10161f'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffab40'; c.font = '700 34px ui-monospace, Menlo, monospace';
    c.textAlign = 'center'; c.fillText(`ε ${emf >= 0 ? '+' : '−'}${Math.abs(emf).toFixed(3)} ${uV}`, W / 2, H / 2 + 12);
  });
}
let histI = 0;

// ---------- Цикл ----------
let flux = 0, prevFlux = null, emf = 0, needleA = 0, needleV = 0, plotAcc = 0, autoT = 0;
const north = new V3(), south = new V3();
lab.setFrame((dt, t) => {
  // Станция 1
  if (dirty) { dirty = false; recompute(); }
  updateDots(dt);
  for (const p of parts) if (p.type === 'switch') p.pivot.rotation.z += ((p.closed ? 0 : 0.6) - p.pivot.rotation.z) * Math.min(1, dt * 14);
  const bat = parts[0];
  bat.body.material.emissiveIntensity = circuit.short ? pulse(t, 0.4, 0.2, 1.4) : 0;

  // Станция 2
  if (auto && !magnet.userData.heldBy) {
    autoT += dt;
    magnet.position.set(C.x - 0.1 + 0.55 * Math.sin((autoT * 2 * Math.PI) / 2.6), C.y, C.z);
  }
  magnet.localToWorld(north.set(0.1, 0, 0));
  magnet.localToWorld(south.set(-0.1, 0, 0));
  flux = coilFlux(north.toArray(), south.toArray(), COIL);
  if (prevFlux !== null && dt > 0) {
    const raw = -(flux - prevFlux) / dt;
    emf += (raw - emf) * Math.min(1, dt / 0.04);
  }
  prevFlux = flux;
  const target = -Math.max(-1.12, Math.min(1.12, emf)) * 0.85;
  needleV += (160 * (target - needleA) - 16 * needleV) * dt;
  needleA += needleV * dt;
  needle.rotation.z = needleA;
  copper.emissiveIntensity = Math.min(0.9, Math.abs(emf) * 0.8);
  // Бегущие точки на силовых линиях
  const fl = magnet.userData.flow;
  fl.lines.forEach((ln, i) => {
    for (let k = 0; k < 2; k++) {
      const d = ((t * 0.12 + k * 0.5 + i * 0.137) % 1) * ln.len;
      let j = 1;
      while (j < ln.cum.length - 1 && ln.cum[j] < d) j++;
      const f = (d - ln.cum[j - 1]) / ((ln.cum[j] - ln.cum[j - 1]) || 1);
      const a = ln.l[j - 1], b = ln.l[j];
      _m.makeTranslation(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
      fl.mesh.setMatrixAt(i * 2 + k, _m);
    }
  });
  fl.mesh.instanceMatrix.needsUpdate = true;
  plotAcc += dt;
  if (plotAcc > 1 / 30) {
    plotAcc = 0;
    histE[histI] = emf; histF[histI] = flux; histI = (histI + 1) % HIST;
    drawPlot();
  }
});

applyPreset('parallel');

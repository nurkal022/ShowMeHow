import { createLab, makeLabel, placeLabel, pulse, tr } from '../common.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { REAGENTS, FLAME_SALTS, REACTIONS, reactionKey, react, mixState } from './reactions.js';

// Переводы текстов из reactions.js: сам модуль остаётся без зависимостей (его гоняют юнит-тесты).
const L = {
  'Соляная кислота': tr('Соляная кислота', 'Тұз қышқылы', 'Hydrochloric acid'),
  'Гидроксид натрия': tr('Гидроксид натрия', 'Натрий гидроксиді', 'Sodium hydroxide'),
  'Лакмус': tr('Лакмус', 'Лакмус', 'Litmus'),
  'индикатор': tr('индикатор', 'индикатор', 'indicator'),
  'Фенолфталеин': tr('Фенолфталеин', 'Фенолфталеин', 'Phenolphthalein'),
  'фенолфт.': tr('фенолфт.', 'фенолфт.', 'phenolph.'),
  'Нитрат серебра': tr('Нитрат серебра', 'Күміс нитраты', 'Silver nitrate'),
  'Пищевая сода': tr('Пищевая сода', 'Ас содасы', 'Baking soda'),
  'Пероксид водорода': tr('Пероксид водорода', 'Сутек пероксиді', 'Hydrogen peroxide'),
  'Иодид калия': tr('Иодид калия', 'Калий иодиді', 'Potassium iodide'),
  'Медный купорос': tr('Медный купорос', 'Мыс купоросы', 'Copper sulfate'),
  'Хлорид железа(III)': tr('Хлорид железа(III)', 'Темір(III) хлориді', 'Iron(III) chloride'),
  'Роданид калия': tr('Роданид калия', 'Калий роданиді', 'Potassium thiocyanate'),
  'Нитрат свинца': tr('Нитрат свинца', 'Қорғасын нитраты', 'Lead nitrate'),
  'Цинк, гранулы': tr('Цинк, гранулы', 'Мырыш, түйіршіктер', 'Zinc granules'),
  'Хлорид натрия': tr('Хлорид натрия', 'Натрий хлориді', 'Sodium chloride'),
  'Хлорид меди': tr('Хлорид меди', 'Мыс хлориді', 'Copper chloride'),
  'Хлорид калия': tr('Хлорид калия', 'Калий хлориді', 'Potassium chloride'),
  'Хлорид лития': tr('Хлорид лития', 'Литий хлориді', 'Lithium chloride'),
  'Хлорид стронция': tr('Хлорид стронция', 'Стронций хлориді', 'Strontium chloride'),
  'жёлтое — 589 нм': tr('жёлтое — 589 нм', 'сары — 589 нм', 'yellow — 589 nm'),
  'зелёное': tr('зелёное', 'жасыл', 'green'),
  'фиолетовое': tr('фиолетовое', 'күлгін', 'violet'),
  'карминовое': tr('карминовое', 'карминді-қызыл', 'carmine red'),
  'малиновое': tr('малиновое', 'таңқурай түсті', 'crimson'),
  'Слоновья зубная паста': tr('Слоновья зубная паста', 'Піл тіс пастасы', 'Elephant toothpaste'),
  'Лакмус краснеет': tr('Лакмус краснеет', 'Лакмус қызарады', 'Litmus turns red'),
  'Лакмус синеет': tr('Лакмус синеет', 'Лакмус көгереді', 'Litmus turns blue'),
  'Фенолфталеин малиновеет': tr('Фенолфталеин малиновеет', 'Фенолфталеин таңқурай түске боялады', 'Phenolphthalein turns pink'),
  'Белый творожистый осадок': tr('Белый творожистый осадок', 'Ақ ірімшік тәрізді тұнба', 'White curdy precipitate'),
  'Выделяется углекислый газ': tr('Выделяется углекислый газ', 'Көмірқышқыл газы бөлінеді', 'Carbon dioxide is released'),
  'Голубой осадок гидроксида меди': tr('Голубой осадок гидроксида меди', 'Мыс гидроксидінің көгілдір тұнбасы', 'Blue precipitate of copper hydroxide'),
  'Нейтрализация': tr('Нейтрализация', 'Бейтараптану', 'Neutralisation'),
  'Кроваво-красный раствор': tr('Кроваво-красный раствор', 'Қан-қызыл ерітінді', 'Blood-red solution'),
  'Бурый осадок гидроксида железа': tr('Бурый осадок гидроксида железа', 'Темір гидроксидінің қоңыр тұнбасы', 'Brown precipitate of iron hydroxide'),
  'Золотой дождь': tr('Золотой дождь', 'Алтын жаңбыр', 'Golden rain'),
  'Выделяется водород': tr('Выделяется водород', 'Сутек бөлінеді', 'Hydrogen is released'),
  'кислая среда, pH < 7': tr('кислая среда, pH < 7', 'қышқылдық орта, pH < 7', 'acidic medium, pH < 7'),
  'щелочная среда, pH > 7': tr('щелочная среда, pH > 7', 'сілтілік орта, pH > 7', 'alkaline medium, pH > 7'),
  'щелочная среда, pH > 8,2': tr('щелочная среда, pH > 8,2', 'сілтілік орта, pH > 8,2', 'alkaline medium, pH > 8.2'),
  'Каталитическое разложение': tr('Каталитическое разложение', 'Каталитикалық ыдырау', 'Catalytic decomposition'),
  'Индикатор': tr('Индикатор', 'Индикатор', 'Indicator'),
  'Осаждение': tr('Осаждение', 'Тұнба түзілу', 'Precipitation'),
  'Газ': tr('Газ', 'Газ', 'Gas'),
  'Кислота + основание': tr('Кислота + основание', 'Қышқыл + негіз', 'Acid + base'),
  'Качественная реакция на Fe³⁺': tr('Качественная реакция на Fe³⁺', 'Fe³⁺ сапалық реакциясы', 'Qualitative test for Fe³⁺'),
  'Замещение': tr('Замещение', 'Орын басу', 'Displacement'),
};
const loc = (s) => L[s] ?? s;

const TITLE = tr('Стол реакций', 'Реакциялар үстелі', 'Reaction bench');
document.title = TITLE + ' — Tesseract';
const lab = createLab({
  title: TITLE,
  hint: tr('Возьмите бутылку с полки и отпустите над колбой — реагент выльется. Найдите все 12 реакций. Соли из чашек подносите к пламени.',
    'Сөреден бөтелкені алып, колбаның үстінде жіберіңіз — реагент құйылады. 12 реакцияның бәрін табыңыз. Тостағандардағы тұздарды жалынға жақындатыңыз.',
    'Take a bottle from the shelf and release it above the flask to pour it. Find all 12 reactions. Bring the salts from the dishes to the flame.'),
  sky: 0x161c28,
  stations: [
    { name: tr('Колба и реагенты', 'Колба және реагенттер', 'Flask and reagents'), at: [0, 1.55, 1.5], look: [0, 1.15, -0.55] },
    { name: tr('Пламя', 'Жалын', 'Flame'), at: [22, 1.55, 1.6], look: [22, 1.2, -0.35] },
  ],
});
const { THREE, scene, renderer } = lab;
const TABLE_Y = 0.92;

// Отражения для стекла и металла — без теней и прозрачного преломления, чтобы Quest тянул.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

// ---------- Комната: стена с кафелем, пол, лампы, тумба ----------
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}
const tileTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#8f9cad'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7b889a';
  for (let i = 0; i < 4; i++) { g.fillRect(0, i * 64, w, 3); g.fillRect(i * 64, 0, 3, h); }
}, [12, 5]);
const floorTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#39424f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#323a46';
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) g.fillRect(i * 128, j * 128, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let k = 0; k < 400; k++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
}, [8, 5]);

function room(x) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.35 }));
  wall.position.set(x, 1.6, -1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(x, 0.004, 1.2);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e2, emissiveIntensity: 0.9 });
  for (const dx of [-1.4, 1.4]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.32), lampMat);
    lamp.position.set(x + dx, 2.95, -0.6);
    scene.add(lamp);
  }
  const light = new THREE.PointLight(0xfff1dc, 6, 7, 1.4);
  light.position.set(x, 2.5, 0.1);
  scene.add(wall, floor, light);
}
function bench(x) {
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.05, 1.05),
    new THREE.MeshPhysicalMaterial({ color: 0x23282f, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  top.position.set(x, TABLE_Y - 0.025, -0.3);
  scene.add(top);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe6ebf0, roughness: 0.5 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.9, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.3, TABLE_Y - 0.12, 0.95), bodyMat);
  body.position.set(x, (TABLE_Y - 0.12) / 2 + 0.07, -0.32);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.9), new THREE.MeshStandardMaterial({ color: 0x2a3038 }));
  plinth.position.set(x, 0.035, -0.34);
  scene.add(body, plinth);
  // Ящики: щели и ручки на фасаде
  for (let i = 0; i < 4; i++) {
    const cx = x - 1.24 + i * 0.83;
    for (let j = 0; j < 3; j++) {
      const cy = 0.24 + j * 0.24;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.005, 0.005), new THREE.MeshStandardMaterial({ color: 0xa9b3bd }));
      seam.position.set(cx, cy + 0.11, 0.155);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), handleMat);
      h.rotation.z = Math.PI / 2; h.position.set(cx, cy + 0.02, 0.17);
      scene.add(seam, h);
    }
  }
}
room(0); room(22); bench(0); bench(22);

// ---------- Станция 1: колба ----------
const FLASK = new THREE.Vector3(0, TABLE_Y + 0.07, -0.15); // стоит на магнитной мешалке
const FH = 0.42, FR = 0.18, FN = 0.05, CONE = 0.62;
/** Внутренний радиус колбы на высоте y — по нему строится жидкость. */
const flaskR = (y) => (y < FH * CONE ? FR - (FR - FN) * (y / (FH * CONE)) : FN);
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xeef6ff, transparent: true, opacity: 0.22, roughness: 0.03, metalness: 0, clearcoat: 1, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false,
});
{
  const stirrer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.42), new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.45 }));
  stirrer.position.set(FLASK.x, TABLE_Y + 0.035, FLASK.z);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.006, 40), new THREE.MeshStandardMaterial({ color: 0xb0bac4, metalness: 0.8, roughness: 0.3 }));
  plate.position.set(FLASK.x, TABLE_Y + 0.072, FLASK.z);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x1a73e8 }));
  knob.rotation.x = Math.PI / 2; knob.position.set(FLASK.x + 0.12, TABLE_Y + 0.035, FLASK.z + 0.215);
  scene.add(stirrer, plate, knob);
  const pts = [];
  for (let i = 0; i <= 24; i++) { const y = (i / 24) * FH; pts.push(new THREE.Vector2(flaskR(y) + 0.004, y)); }
  pts.push(new THREE.Vector2(FN + 0.012, FH + 0.004)); // ободок
  const flask = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), glassMat);
  flask.position.copy(FLASK);
  flask.renderOrder = 2;
  scene.add(flask);
  const marks = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  for (let k = 1; k <= 3; k++) { // деления объёма
    const y = k * 0.06, r = flaskR(y) + 0.006;
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0012, 4, 48, 0.9), marks);
    m.rotation.x = Math.PI / 2; m.rotation.z = -0.45; m.position.set(FLASK.x, FLASK.y + y, FLASK.z);
    scene.add(m);
  }
  lab.hover(flask, tr('Колба Эрленмейера\nОтпустите бутылку над ней', 'Эрленмейер колбасы\nБөтелкені оның үстінде жіберіңіз', 'Erlenmeyer flask\nRelease a bottle above it'));
}
// Жидкость — геометрия по профилю колбы, пересобирается при смене объёма
const liquidMat = new THREE.MeshPhysicalMaterial({ color: 0x9ecfff, transparent: true, opacity: 0.72, roughness: 0.15, clearcoat: 0.6, emissive: 0x9ecfff, emissiveIntensity: 0.12, depthWrite: false });
const liquid = new THREE.Mesh(new THREE.BufferGeometry(), liquidMat);
liquid.position.copy(FLASK);
liquid.renderOrder = 1;
scene.add(liquid);
let liquidH = -1;
function setLiquid(h) {
  if (Math.abs(h - liquidH) < 0.0008) return;
  liquidH = h;
  const pts = [new THREE.Vector2(0, 0.002)];
  for (let i = 0; i <= 12; i++) { const y = 0.002 + (i / 12) * h; pts.push(new THREE.Vector2(flaskR(y) - 0.004, y)); }
  pts.push(new THREE.Vector2(0, h + 0.002));
  liquid.geometry.dispose();
  liquid.geometry = new THREE.LatheGeometry(pts, 48);
}
const surfaceY = () => FLASK.y + liquidH;
let level = 0.012, levelTarget = 0.012;
setLiquid(level);
const state = mixState();

// Табло: что произошло — справа, журнал опытов — слева
const productBoard = lab.board(tr('13 реагентов на полке.\nЧто смешаем?', 'Сөреде 13 реагент.\nНені араластырамыз?', '13 reagents on the shelf.\nWhat shall we mix?'), [1.95, 1.58, -1.05], { scale: 0.0019 });
const found = new Set();
const journal = lab.board('', [-2.15, 1.45, -1.05], { scale: 0.00125 });
function renderJournal() {
  const head = tr(`Журнал опытов: ${found.size} из ${REACTIONS.length}`, `Тәжірибелер журналы: ${found.size} / ${REACTIONS.length}`, `Lab journal: ${found.size} of ${REACTIONS.length}`);
  const lines = REACTIONS.map((r) => (found.has(reactionKey(r)) ? `✓ ${loc(r.title)}` : `○ ? — ${loc(r.kind)}`));
  journal.set([head, ...lines].join('\n'));
}
renderJournal();

// Полка: стойки и две стеклянные полки
const SHELF_Z = -0.95;
const TIERS = [TABLE_Y + 0.36, TABLE_Y + 0.74];
{
  const metal = new THREE.MeshStandardMaterial({ color: 0xb5bec8, metalness: 0.85, roughness: 0.3 });
  for (const dx of [-1.32, 1.32]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 10), metal);
    post.position.set(dx, TABLE_Y + 0.47, SHELF_Z);
    scene.add(post);
  }
  for (const y of TIERS) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.015, 0.26), new THREE.MeshPhysicalMaterial({ color: 0xdbeaff, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, envMapIntensity: 2 }));
    glass.position.set(0, y - 0.008, SHELF_Z);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.02, 0.01), metal);
    rail.position.set(0, y + 0.03, SHELF_Z + 0.13);
    scene.add(glass, rail);
  }
}
/** Бутылка: тело, плечики, горлышко — профилем, с жидкостью и этикеткой. */
function bottleMesh(r) {
  const g = new THREE.Group();
  if (r.id === 'zn') { // банка с гранулами
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 24), glassMat);
    jar.position.y = 0.065;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.063, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0x455a64 }));
    lid.position.y = 0.145;
    const granMat = new THREE.MeshStandardMaterial({ color: 0xa7b0b8, metalness: 0.9, roughness: 0.35 });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.014 + Math.random() * 0.006), granMat);
      s.position.set((Math.random() - 0.5) * 0.08, 0.015 + Math.random() * 0.05, (Math.random() - 0.5) * 0.08);
      g.add(s);
    }
    g.add(jar, lid);
    g.userData.glass = jar; g.userData.mouthY = 0.16;
    return g;
  }
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const y = (i / 14) * 0.22;
    const rad = y < 0.13 ? 0.048 : y < 0.17 ? 0.048 - (y - 0.13) * 0.75 : 0.018;
    prof.push(new THREE.Vector2(rad, y));
  }
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), glassMat);
  const fillProf = prof.filter((p) => p.y < 0.12).map((p) => new THREE.Vector2(p.x - 0.005, p.y + 0.004));
  fillProf.unshift(new THREE.Vector2(0, 0.004)); fillProf.push(new THREE.Vector2(0, 0.12));
  const fill = new THREE.Mesh(new THREE.LatheGeometry(fillProf, 24),
    new THREE.MeshPhysicalMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 0.18, transparent: true, opacity: 0.85, roughness: 0.2 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 16), new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5 }));
  cap.position.y = 0.235;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.049, 0.05, 24, 1, true, -0.9, 1.8), new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.8, side: THREE.DoubleSide }));
  label.position.y = 0.07;
  g.add(fill, glass, label, cap);
  g.userData.glass = glass; g.userData.mouthY = 0.23;
  return g;
}
const bottles = [];
REAGENTS.forEach((r, i) => {
  const tier = i < 7 ? 0 : 1, k = tier === 0 ? i : i - 7, n = tier === 0 ? 7 : 6;
  const g = bottleMesh(r);
  const tag = makeLabel(loc(r.formula), { scale: 0.00085 });
  tag.position.set(0, 0.3, 0.02);
  g.add(tag);
  const home = new THREE.Vector3(-1.08 + k * (2.16 / (n - 1)), TIERS[tier], SHELF_Z);
  g.position.copy(home);
  g.userData.home = home;
  g.userData.reagent = r;
  scene.add(g);
  bottles.push(g);
  lab.hover(g.userData.glass, `${loc(r.name)}\n${loc(r.formula)}`);
  lab.grab(g, {
    onRelease: (o) => {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      const near = Math.hypot(p.x - FLASK.x, p.z - FLASK.z) < 0.45 && p.y > TABLE_Y - 0.1 && p.y < TABLE_Y + 1.3;
      o.rotation.set(0, 0, 0);
      if (near && !pouring) pour(o); else o.userData.returning = true;
    },
  });
});

// ---------- Эффекты ----------
const rnd = (a, b) => a + Math.random() * (b - a);
// Струя
const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 10, 1, true),
  new THREE.MeshPhysicalMaterial({ color: 0x9ecfff, transparent: true, opacity: 0.75, roughness: 0.1, emissive: 0x9ecfff, emissiveIntensity: 0.2 }));
stream.visible = false;
scene.add(stream);
const splash = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.025, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
splash.rotation.x = -Math.PI / 2; splash.visible = false;
scene.add(splash);
let pouring = null;
function pour(bottle) {
  bottle.position.set(FLASK.x - 0.2, FLASK.y + FH + 0.32, FLASK.z);
  bottle.rotation.set(0, 0, -2.05);
  pouring = { bottle, t: 0 };
  const c = new THREE.Color(bottle.userData.reagent.color);
  stream.material.color.copy(c); stream.material.emissive.copy(c);
  if (bottle.userData.reagent.id === 'zn') dropGranules();
}
// Пузыри: один InstancedMesh на всё
const BUB = 160;
const bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
  new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1, envMapIntensity: 2 }), BUB);
bubbleMesh.frustumCulled = false;
scene.add(bubbleMesh);
const bubbles = Array.from({ length: BUB }, () => ({ live: false }));
let gasLeft = 0, gasFromBottom = false;
// Пена
const FOAM = 520;
const foamMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: 0xfff3b0, roughness: 0.95, emissive: 0xfff3b0, emissiveIntensity: 0.08 }), FOAM);
foamMesh.frustumCulled = false;
scene.add(foamMesh);
const foam = Array.from({ length: FOAM }, () => ({ live: false }));
let foamLeft = 0, foamAge = 0;
// Осадок: облако частиц, оседает в слой
const PRE = 700;
const preGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PRE * 3), 3));
const preMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.008, transparent: true, opacity: 0 });
const precipCloud = new THREE.Points(preGeo, preMat);
precipCloud.frustumCulled = false;
scene.add(precipCloud);
const preParts = Array.from({ length: PRE }, () => ({ r: Math.sqrt(Math.random()), a: Math.random() * Math.PI * 2, y: Math.random(), s: rnd(0.6, 1.4) }));
let precipT = -1;
const sediment = new THREE.Mesh(new THREE.CylinderGeometry(FR - 0.012, FR - 0.006, 1, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
sediment.position.set(FLASK.x, FLASK.y + 0.003, FLASK.z);
sediment.scale.y = 0.0001; sediment.visible = false;
scene.add(sediment);
let sedimentH = 0;
// Новый цвет расходится спиралью
const SW = 220;
const swirlGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SW * 3), 3));
const swirl = new THREE.Points(swirlGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.012, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
swirl.frustumCulled = false;
scene.add(swirl);
let swirlT = -1;
// Гранулы цинка на дне
const granules = new THREE.Group();
scene.add(granules);
function dropGranules() {
  const m = new THREE.MeshStandardMaterial({ color: 0xa7b0b8, metalness: 0.9, roughness: 0.35 });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.012, 0.018)), m);
    s.position.set(FLASK.x + rnd(-0.08, 0.08), FLASK.y + 0.012, FLASK.z + rnd(-0.08, 0.08));
    s.userData.fall = rnd(0.2, 0.5);
    s.position.y += 0.4;
    granules.add(s);
  }
}

function finishPour(bottle) {
  const out = react(state, bottle.userData.reagent.id);
  liquid.userData.targetColor = new THREE.Color(out.color);
  levelTarget = 0.012 + state.volume * 0.2;
  const text = `${loc(out.title)}\n${loc(out.product)}` + (out.kind ? `\n${loc(out.kind)}` : '');
  productBoard.set(text);
  if (out.key && !found.has(out.key)) { found.add(out.key); renderJournal(); }
  if (out.effect === 'gas') { gasLeft = 6; gasFromBottom = state.added.includes('zn'); }
  if (out.effect === 'foam') { foamLeft = 4.5; foamAge = 0; foamMesh.material.color.set(out.color); }
  if (out.effect === 'precipitate') {
    precipT = 0; preMat.color.set(out.color);
    sediment.material.color.set(out.color); sediment.visible = true;
  }
  if (out.effect !== 'none') { swirlT = 0; swirl.material.color.set(out.color); }
  showMolecule(out);
  bottle.userData.returning = true;
}

// Молекула продукта: шарики и палочки
const MOLS = {
  'O₂': [['O', 0, 0, 0], ['O', 0.12, 0, 0]],
  'H₂': [['H', 0, 0, 0], ['H', 0.08, 0, 0]],
  'CO₂': [['C', 0, 0, 0], ['O', -0.13, 0, 0], ['O', 0.13, 0, 0]],
  'H₂O': [['O', 0, 0, 0], ['H', -0.09, 0.07, 0], ['H', 0.09, 0.07, 0]],
  'AgCl': [['Ag', 0, 0, 0], ['Cl', 0.15, 0, 0]],
  'PbI₂': [['Pb', 0, 0, 0], ['I', -0.17, -0.04, 0], ['I', 0.17, -0.04, 0]],
  'NaCl': [['Na', 0, 0, 0], ['Cl', 0.15, 0, 0]],
  'Cu(OH)₂': [['Cu', 0, 0, 0], ['O', -0.13, 0.05, 0], ['H', -0.2, 0.12, 0], ['O', 0.13, 0.05, 0], ['H', 0.2, 0.12, 0]],
  'Fe(OH)₃': [['Fe', 0, 0, 0], ['O', -0.13, 0.05, 0], ['H', -0.2, 0.12, 0], ['O', 0.13, 0.05, 0], ['H', 0.2, 0.12, 0], ['O', 0, -0.13, 0.05], ['H', 0, -0.21, 0.1]],
};
const ATOM = { O: [0xef5350, 0.045], C: [0x546e7a, 0.045], H: [0xf5f5f5, 0.03], Ag: [0xcfd8dc, 0.055], Cl: [0x66bb6a, 0.05], Na: [0xab47bc, 0.05], Cu: [0xff8a65, 0.055], Pb: [0x78909c, 0.062], I: [0x8e24aa, 0.058], Fe: [0xb0643a, 0.056] };
let molecule = null;
function showMolecule(out) {
  if (molecule) { scene.remove(molecule); molecule = null; }
  const right = out.product.includes('→') ? out.product.split('→')[1] : out.product;
  const key = Object.keys(MOLS).sort((a, b) => b.length - a.length).find((k) => right.includes(k));
  if (!key) return;
  molecule = new THREE.Group();
  const atoms = MOLS[key];
  const centers = ['O', 'C', 'Ag', 'Na', 'Cu', 'Pb', 'Fe'];
  atoms.forEach(([el, x, y, z], i) => {
    const [color, r] = ATOM[el];
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.6, emissive: color, emissiveIntensity: 0.15 }));
    m.position.set(x, y, z);
    molecule.add(m);
    if (i > 0) {
      const anchor = el === 'H' ? atoms.slice(0, i).reverse().find((a) => a[0] === 'O') ?? atoms[0] : atoms.find((a) => centers.includes(a[0])) ?? atoms[0];
      if (anchor === atoms[i]) return;
      const p = new THREE.Vector3(anchor[1], anchor[2], anchor[3]), q = m.position;
      const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 8), new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.4 }));
      bond.position.lerpVectors(p, q, 0.5); bond.scale.y = p.distanceTo(q); bond.lookAt(q); bond.rotateX(Math.PI / 2);
      molecule.add(bond);
    }
  });
  const tag = makeLabel(key, { scale: 0.0016 });
  tag.position.y = 0.17;
  molecule.add(tag);
  molecule.position.set(FLASK.x + 0.55, FLASK.y + 0.28, FLASK.z + 0.1);
  molecule.scale.setScalar(0.01);
  molecule.userData.grow = 0;
  scene.add(molecule);
  lab.hover(molecule, tr(`Продукт: ${key}`, `Өнім: ${key}`, `Product: ${key}`));
}

function empty() {
  Object.assign(state, mixState());
  liquid.userData.targetColor = new THREE.Color(0x9ecfff);
  levelTarget = 0.012;
  productBoard.set(tr('Колба вылита. Что смешаем?', 'Колба босатылды. Нені араластырамыз?', 'Flask emptied. What shall we mix?'));
  gasLeft = 0; foamLeft = 0; precipT = -1; swirlT = -1;
  for (const b of bubbles) b.live = false;
  for (const f of foam) f.live = false;
  preMat.opacity = 0; sediment.visible = false; sedimentH = 0; sediment.scale.y = 0.0001;
  granules.clear();
  if (molecule) { scene.remove(molecule); molecule = null; }
}
lab.button3d(tr('Вылить', 'Төгу', 'Empty'), [1.15, TABLE_Y + 0.09, 0.08], empty, { width: 0.42, color: 0xc0392b });
lab.hud.action(tr('Вылить колбу', 'Колбаны төгу', 'Empty the flask'), empty);
scene.add(placeLabel(makeLabel(tr('Попробуйте: FeCl₃ + KSCN, Pb(NO₃)₂ + KI, H₂O₂ + KI, Zn + HCl', 'Байқап көріңіз: FeCl₃ + KSCN, Pb(NO₃)₂ + KI, H₂O₂ + KI, Zn + HCl', 'Try: FeCl₃ + KSCN, Pb(NO₃)₂ + KI, H₂O₂ + KI, Zn + HCl'), { scale: 0.0009 }), 0, TABLE_Y + 0.015, 0.3));

// ---------- Станция 2: пламя ----------
const BURNER = new THREE.Vector3(22, TABLE_Y, -0.3);
{
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab4bd, metalness: 0.9, roughness: 0.25 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.9, roughness: 0.3 });
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.025, 32), new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.5, roughness: 0.4 }));
  foot.position.copy(BURNER).add(new THREE.Vector3(0, 0.0125, 0));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 20), steel);
  barrel.position.copy(BURNER).add(new THREE.Vector3(0, 0.125, 0));
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.035, 20), brass);
  collar.position.copy(BURNER).add(new THREE.Vector3(0, 0.05, 0));
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.03, 0.04, 0), new THREE.Vector3(0.25, 0.02, 0.1), new THREE.Vector3(0.6, 0.01, 0.25), new THREE.Vector3(1.0, 0.01, -0.3),
  ]), 40, 0.009, 8), new THREE.MeshStandardMaterial({ color: 0xd84315, roughness: 0.6 }));
  hose.position.copy(BURNER);
  scene.add(foot, barrel, collar, hose);
  lab.hover(barrel, tr('Горелка Бунзена\nПоднесите соль к пламени', 'Бунзен жанарғысы\nТұзды жалынға жақындатыңыз', 'Bunsen burner\nBring a salt to the flame'));
}
// Пламя: внутренний голубой конус + внешний язык + искры
const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.09, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
flameInner.position.copy(BURNER).add(new THREE.Vector3(0, 0.27, 0));
const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x64b5f6, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
flameOuter.position.copy(BURNER).add(new THREE.Vector3(0, 0.37, 0));
scene.add(flameInner, flameOuter);
const FLAME_N = 220;
const flameGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(FLAME_N * 3).fill(0), 3));
const flameMat = new THREE.PointsMaterial({ color: 0x64b5f6, size: 0.028, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const flame = new THREE.Points(flameGeo, flameMat);
flame.frustumCulled = false;
scene.add(flame);
const flameLight = new THREE.PointLight(0x64b5f6, 2, 3);
flameLight.position.copy(BURNER).add(new THREE.Vector3(0, 0.4, 0));
scene.add(flameLight);
const flameParts = Array.from({ length: FLAME_N }, () => ({ t: Math.random() }));
const flameColor = new THREE.Color(0x64b5f6);
let flameTarget = new THREE.Color(0x64b5f6);
const flameBoard = lab.board(tr('Пламя без примесей — голубое', 'Қоспасыз жалын — көгілдір', 'A clean flame is blue'), [22, 1.85, -1.05], { scale: 0.0026 });
const salts = [];
FLAME_SALTS.forEach((s, i) => {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.045, 0.025, 28), new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, roughness: 0.35, clearcoat: 0.8 }));
  const powder = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 12), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 1 }));
  powder.scale.y = 0.35; powder.position.y = 0.018;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.067, 0.004, 6, 32), new THREE.MeshStandardMaterial({ color: s.flame, emissive: s.flame, emissiveIntensity: 0.6 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.013;
  const tag = makeLabel(s.formula, { scale: 0.001 });
  tag.position.y = 0.13;
  g.add(dish, powder, ring, tag);
  const home = new THREE.Vector3(21.1 + i * 0.45, TABLE_Y + 0.013, 0.05);
  g.position.copy(home);
  g.userData.home = home;
  scene.add(g);
  salts.push(g);
  lab.hover(dish, `${loc(s.name)}\n${s.formula}`);
  lab.grab(g, {
    onMove: (o) => {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      if (Math.hypot(p.x - BURNER.x, p.z - BURNER.z) < 0.22 && p.y > TABLE_Y + 0.15 && p.y < TABLE_Y + 0.8) ignite(s);
    },
    onRelease: (o) => { o.rotation.set(0, 0, 0); o.userData.returning = true; },
  });
});
let flameBoost = 0, flameTimer = null;
function ignite(s) {
  if (flameTarget.getHex() === new THREE.Color(s.flame).getHex()) return;
  flameTarget = new THREE.Color(s.flame);
  flameBoost = 1;
  const el = s.formula.replace(/Cl.*/, '');
  flameBoard.set(`${loc(s.name)} (${s.formula})\n` + tr(`Пламя ${s.note}: светятся атомы ${el}`, `Жалын ${loc(s.note)}: ${el} атомдары жарқырайды`, `The flame is ${loc(s.note)}: ${el} atoms glow`));
  clearTimeout(flameTimer);
  flameTimer = setTimeout(() => { flameTarget = new THREE.Color(0x64b5f6); flameBoard.set(tr('Пламя остывает — снова голубое', 'Жалын суып барады — қайтадан көгілдір', 'The flame cools down — blue again')); }, 6000);
}

// ---------- Цикл ----------
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3();
const hide = () => M.makeScale(0, 0, 0);
lab.setFrame((dt, t) => {
  dt = Math.max(0, Math.min(dt, 0.05));
  // Наливание: струя от горлышка к поверхности
  if (pouring) {
    pouring.t += dt;
    const b = pouring.bottle;
    const mouth = new THREE.Vector3(0, b.userData.mouthY, 0).applyMatrix4(b.matrixWorld);
    const end = new THREE.Vector3(FLASK.x + Math.sin(t * 7) * 0.004, surfaceY(), FLASK.z);
    const on = pouring.t > 0.15 && pouring.t < 1.35 && b.userData.reagent.id !== 'zn';
    stream.visible = on; splash.visible = on;
    if (on) {
      stream.position.lerpVectors(mouth, end, 0.5);
      stream.scale.set(1, mouth.distanceTo(end), 1);
      stream.lookAt(end); stream.rotateX(Math.PI / 2);
      splash.position.set(end.x, end.y + 0.002, end.z);
      splash.scale.setScalar(1 + 0.4 * Math.sin(t * 30));
      levelTarget = Math.max(levelTarget, level + dt * 0.02);
    }
    if (pouring.t > 1.5) { stream.visible = false; splash.visible = false; pouring = null; finishPour(b); }
  }
  // Бутылки и соли возвращаются на место
  for (const o of [...bottles, ...salts]) {
    if (o.userData.returning && !o.userData.heldBy) {
      o.position.lerp(o.userData.home, Math.min(1, dt * 6));
      o.rotation.z += (0 - o.rotation.z) * Math.min(1, dt * 6);
      if (o.position.distanceTo(o.userData.home) < 0.005) { o.position.copy(o.userData.home); o.rotation.z = 0; o.userData.returning = false; }
    }
  }
  // Жидкость
  level += (levelTarget - level) * Math.min(1, dt * 2.5);
  setLiquid(level);
  if (liquid.userData.targetColor) {
    liquidMat.color.lerp(liquid.userData.targetColor, Math.min(1, dt * 1.6));
    liquidMat.emissive.copy(liquidMat.color);
  }
  // Гранулы падают на дно
  for (const s of granules.children) if (s.position.y > FLASK.y + 0.014) s.position.y = Math.max(FLASK.y + 0.014, s.position.y - dt * 1.4);
  // Пузыри
  if (gasLeft > 0) {
    gasLeft -= dt;
    const rate = 40 * Math.min(1, gasLeft / 2);
    for (let k = 0; k < rate * dt * 3; k++) {
      const b = bubbles.find((x) => !x.live);
      if (!b) break;
      const g = gasFromBottom && granules.children.length ? granules.children[Math.floor(Math.random() * granules.children.length)].position : null;
      const a = Math.random() * Math.PI * 2, rr = Math.random() * (FR - 0.03);
      Object.assign(b, { live: true, x: g ? g.x : FLASK.x + Math.cos(a) * rr, z: g ? g.z : FLASK.z + Math.sin(a) * rr, y: FLASK.y + 0.015, vy: rnd(0.1, 0.22), s: rnd(0.003, 0.008), ph: Math.random() * 9 });
    }
  }
  bubbles.forEach((b, i) => {
    if (b.live) {
      b.y += b.vy * dt; b.vy += dt * 0.08;
      const lim = flaskR(b.y - FLASK.y) - 0.012;
      const dx = b.x - FLASK.x + Math.sin(t * 6 + b.ph) * 0.002, dz = b.z - FLASK.z;
      const d = Math.hypot(dx, dz);
      if (d > lim) { b.x = FLASK.x + dx * lim / d; b.z = FLASK.z + dz * lim / d; }
      if (b.y > surfaceY()) b.live = false;
    }
    if (b.live) M.compose(V.set(b.x, b.y, b.z), Q, SC.setScalar(b.s * (1 + (b.y - FLASK.y) * 2))); else hide();
    bubbleMesh.setMatrixAt(i, M);
  });
  bubbleMesh.instanceMatrix.needsUpdate = true;
  // Пена лезет из горлышка и стекает по колбе
  if (foamLeft > 0) {
    foamLeft -= dt; foamAge += dt;
    for (let k = 0; k < 120 * dt; k++) {
      const f = foam.find((x) => !x.live);
      if (!f) break;
      Object.assign(f, { live: true, x: FLASK.x + rnd(-0.02, 0.02), y: FLASK.y + FH, z: FLASK.z + rnd(-0.02, 0.02),
        vx: rnd(-0.12, 0.12), vy: rnd(0.28, 0.5) * (1 + foamAge * 0.08), vz: rnd(-0.12, 0.12), s: rnd(0.014, 0.026), life: rnd(7, 10) });
    }
  }
  foam.forEach((f, i) => {
    if (f.live) {
      f.vy -= 0.9 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      // стекает по стеклу: не проходит внутрь колбы ниже горлышка
      const h = f.y - FLASK.y;
      if (h < FH && h > 0) {
        const dx = f.x - FLASK.x, dz = f.z - FLASK.z, d = Math.hypot(dx, dz) || 1e-4, lim = flaskR(h) + f.s;
        if (d < lim) { f.x = FLASK.x + dx / d * lim; f.z = FLASK.z + dz / d * lim; f.vx *= 0.6; f.vz *= 0.6; f.vy = Math.max(f.vy, -0.12); }
      }
      const floor = TABLE_Y + 0.07 + f.s;
      if (f.y < floor) { f.y = floor; f.vy = 0; f.vx *= 0.9; f.vz *= 0.9; }
      f.s *= 1 + dt * 0.12;
      f.life -= dt;
      if (f.life < 0) f.live = false;
    }
    if (f.live) M.compose(V.set(f.x, f.y, f.z), Q, SC.setScalar(f.s * Math.min(1, f.life))); else hide();
    foamMesh.setMatrixAt(i, M);
  });
  foamMesh.instanceMatrix.needsUpdate = true;
  // Осадок: муть по всему объёму, потом оседает на дно
  if (precipT >= 0) {
    precipT += dt;
    const settle = Math.min(1, Math.max(0, (precipT - 1.6) / 4));
    preMat.opacity = Math.min(0.9, precipT * 1.2) * (1 - settle * 0.85);
    liquidMat.opacity = 0.72 + 0.2 * (1 - settle) * Math.min(1, precipT);
    const pos = preGeo.attributes.position;
    preParts.forEach((p, i) => {
      const yy = (p.y * (1 - settle) + 0.02 * settle * p.y) * Math.max(0.02, level);
      const r = p.r * (flaskR(yy) - 0.012);
      const a = p.a + t * 0.6 * p.s * (1 - settle);
      pos.setXYZ(i, FLASK.x + Math.cos(a) * r, FLASK.y + 0.006 + yy, FLASK.z + Math.sin(a) * r);
    });
    pos.needsUpdate = true;
    sedimentH = 0.018 * settle;
    sediment.scale.y = Math.max(0.0001, sedimentH);
    sediment.position.y = FLASK.y + 0.003 + sedimentH / 2;
  }
  // Спираль нового цвета
  if (swirlT >= 0) {
    swirlT += dt;
    const k = swirlT / 2;
    swirl.material.opacity = Math.max(0, Math.sin(Math.min(1, k) * Math.PI) * 0.8);
    const pos = swirlGeo.attributes.position;
    for (let i = 0; i < SW; i++) {
      const u = i / SW, yy = level * (1 - ((u + k) % 1));
      const r = (flaskR(yy) - 0.015) * (0.3 + 0.7 * u);
      const a = u * 18 + swirlT * 4;
      pos.setXYZ(i, FLASK.x + Math.cos(a) * r, FLASK.y + 0.005 + yy, FLASK.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    if (swirlT > 2.2) swirlT = -1;
  }
  if (molecule) {
    molecule.userData.grow = Math.min(1, molecule.userData.grow + dt * 1.5);
    const e = 1 - Math.pow(1 - molecule.userData.grow, 3);
    molecule.scale.setScalar(1.05 * e);
    molecule.rotation.y += dt * 0.8;
    molecule.position.y = FLASK.y + 0.28 + Math.sin(t * 1.5) * 0.015;
  }
  // Пламя
  flameColor.lerp(flameTarget, Math.min(1, dt * 2.5));
  flameMat.color.copy(flameColor); flameLight.color.copy(flameColor); flameOuter.material.color.copy(flameColor);
  flameBoost = Math.max(0, flameBoost - dt * 0.4);
  flameLight.intensity = 2 + flameBoost * 4 + pulse(t, 0.3, 0, 0.4);
  const fl = 1 + Math.sin(t * 23) * 0.04 + Math.sin(t * 37) * 0.03;
  flameOuter.scale.set(fl * (1 + flameBoost * 0.4), fl * (1 + flameBoost * 0.5), fl * (1 + flameBoost * 0.4));
  flameInner.scale.set(1, 1 + Math.sin(t * 29) * 0.06, 1);
  const pos = flameGeo.attributes.position;
  const h = 0.4 + flameBoost * 0.25;
  flameParts.forEach((p, i) => {
    p.t = (p.t + dt * (0.8 + (i % 7) * 0.08)) % 1;
    const r = (1 - p.t) * 0.035 * (1 + flameBoost * 0.6);
    const a = i * 2.4 + t * 3;
    pos.setXYZ(i, BURNER.x + Math.cos(a) * r + Math.sin(t * 9 + i) * 0.006, BURNER.y + 0.23 + p.t * h, BURNER.z + Math.sin(a) * r);
  });
  pos.needsUpdate = true;
});

// Для превью и автотестов: налить реагент по id без мыши (window.chemLab.pour('fecl3')).
window.chemLab = { pour: (id) => { const b = bottles.find((x) => x.userData.reagent.id === id); if (b && !pouring) pour(b); }, empty };

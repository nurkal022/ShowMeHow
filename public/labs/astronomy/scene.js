import { createLab, makeLabel, placeLabel, pulse, tr } from '../common.js';
import { bandsTexture, rockyTexture, earthTexture, sunTexture, glowTexture, ringTexture, ringGeometry } from './textures.js';
import { classify, unitCone } from './eclipse.js';

const ST_PLAN = tr('Планетарий', 'Планетарий', 'Planetarium');
const ST_ECL = tr('Затмения', 'Тұтылулар', 'Eclipses');
const PAUSE = tr('Пауза', 'Үзіліс', 'Pause');
const PLAY = tr('Пуск', 'Жүргізу', 'Play');
const SLOWER = tr('Медленнее', 'Баяуырақ', 'Slower');
const FASTER = tr('Быстрее', 'Жылдамырақ', 'Faster');
const MOON_STOP = tr('Луна: стоп', 'Ай: тоқтату', 'Moon: stop');
const MOON_AUTO = tr('Луна: сама', 'Ай: өздігінен', 'Moon: auto');
const TILT_BTN = tr('Наклон орбиты', 'Орбита көлбеулігі', 'Orbit tilt');
const NODES_BTN = tr('Повернуть узлы', 'Түйіндерді бұру', 'Turn nodes');

const lab = createLab({
  title: tr('Солнечная система', 'Күн жүйесі', 'Solar System'),
  hint: tr('Планеты на столе идут по орбитам с настоящими периодами (третий закон Кеплера). Возьмите планету — рядом появятся её данные; отпустите — она продолжит путь с нового места. Кнопки у края стола меняют скорость времени. На второй станции двигайте Луну и ищите затмения.',
    'Үстелдегі планеталар орбиталар бойымен нақты периодтарымен қозғалады (Кеплердің үшінші заңы). Планетаны алыңыз — жанында оның деректері шығады; жіберсеңіз — ол жаңа орнынан жолын жалғастырады. Үстел шетіндегі батырмалар уақыт жылдамдығын өзгертеді. Екінші станцияда Айды жылжытып, тұтылуларды іздеңіз.',
    'The planets on the table move along their orbits with their real periods (Kepler\'s third law). Pick up a planet to see its data; release it and it continues from the new spot. The buttons at the table edge change the speed of time. At the second station, move the Moon and look for eclipses.'),
  stations: [
    { name: ST_PLAN, at: [0, 1.75, 1.95], look: [0, 1.0, -0.3] },
    { name: ST_ECL, at: [7.0, 1.5, 0.95], look: [7.0, 1.18, -0.35] },
  ],
  sky: 0x03050b, fogFar: 46,
});
const { THREE, scene } = lab;

// Обсерватория тёмная: общий свет приглушаем, главным становится Солнце.
scene.children.forEach((o) => {
  if (o.isHemisphereLight) o.intensity = 0.32;
  if (o.isDirectionalLight) o.intensity = 0.25;
});

// ---------- Купол обсерватории и звёздное небо ----------
const DOME_C = new THREE.Vector3(3.6, 0, -0.3);
{
  const dome = new THREE.Mesh(new THREE.SphereGeometry(15, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x04070f, side: THREE.BackSide, fog: false }));
  dome.position.copy(DOME_C);
  scene.add(dome);

  // Звёзды на куполе: равномерный фон плюс плотная полоса Млечного Пути.
  const N = 4200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const v = new THREE.Vector3(), band = new THREE.Vector3(0.35, 0.25, 1).normalize();
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    v.randomDirection();
    if (i % 3 === 0) { v.addScaledVector(band, -v.dot(band) * (0.85 + Math.random() * 0.15)).normalize(); }
    if (v.y < 0.04) v.y = 0.04 + Math.random() * 0.3;
    v.normalize().multiplyScalar(14.6).add(DOME_C);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = Math.random();
    c.setHSL(t < 0.15 ? 0.08 : t < 0.3 ? 0.6 : 0.62, t < 0.3 ? 0.6 : 0.1, 0.55 + Math.random() * 0.45);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.95 })));

  // Кольцевая стена с синей подсветкой у пола — «зал» обсерватории.
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(14.9, 14.9, 1.2, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x0c1220, side: THREE.BackSide, roughness: 0.9 }));
  wall.position.set(DOME_C.x, 0.6, DOME_C.z);
  scene.add(wall);
  const strip = new THREE.Mesh(new THREE.TorusGeometry(14.8, 0.03, 6, 128), new THREE.MeshBasicMaterial({ color: 0x3d6bd9 }));
  strip.rotation.x = Math.PI / 2;
  strip.position.set(DOME_C.x, 1.2, DOME_C.z);
  scene.add(strip);
}

// ---------- Станция 1: планетарий (орерий) ----------
const TABLE_Y = 0.86;
const PLANE_Y = TABLE_Y + 0.14; // высота плоскости орбит
const SUN_C = new THREE.Vector3(0, PLANE_Y, -0.05);
{
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.05, 72),
    new THREE.MeshStandardMaterial({ color: 0x141b2b, roughness: 0.7, metalness: 0.15 }));
  top.position.set(SUN_C.x, TABLE_Y - 0.025, SUN_C.z);
  scene.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.018, 8, 96),
    new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.9, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(SUN_C.x, TABLE_Y, SUN_C.z);
  scene.add(rim);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.42, TABLE_Y - 0.05, 32),
    new THREE.MeshStandardMaterial({ color: 0x1b2333, roughness: 0.6, metalness: 0.4 }));
  foot.position.set(SUN_C.x, (TABLE_Y - 0.05) / 2, SUN_C.z);
  scene.add(foot);
  // Шкала зодиака по краю стола — 12 рисок.
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 6 ? 0.004 : 0.008, 0.002, i % 6 ? 0.03 : 0.06),
      new THREE.MeshBasicMaterial({ color: i % 6 ? 0x4a5a7a : 0xb08d57 }));
    tick.position.set(SUN_C.x + Math.cos(a) * 1.1, TABLE_Y + 0.001, SUN_C.z + Math.sin(a) * 1.1);
    tick.rotation.y = -a + Math.PI / 2;
    scene.add(tick);
  }
}

// Солнце: светящийся шар, корона-спрайт и точечный свет.
const sunTex = sunTexture();
const sun = new THREE.Mesh(new THREE.SphereGeometry(0.085, 40, 24), new THREE.MeshBasicMaterial({ map: sunTex }));
sun.position.copy(SUN_C);
scene.add(sun);
const glowTex = glowTexture();
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
sunGlow.scale.setScalar(0.62);
sunGlow.position.copy(SUN_C);
scene.add(sunGlow);
const sunGlow2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,240,200,0.9)', 'rgba(255,190,90,0.25)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
sunGlow2.scale.setScalar(0.28);
sunGlow2.position.copy(SUN_C);
scene.add(sunGlow2);
const sunLight = new THREE.PointLight(0xfff0d0, 3.2, 3.2, 0.6);
sunLight.position.copy(SUN_C);
scene.add(sunLight);
lab.hover(sun, tr('Солнце\nРадиус 696 000 км — в 109 раз больше Земли\nВ нём 99,86 % массы Солнечной системы',
  'Күн\nРадиусы 696 000 км — Жерден 109 есе үлкен\nКүн жүйесі массасының 99,86 %-ы осында',
  'Sun\nRadius 696,000 km — 109 times that of Earth\nHolds 99.86 % of the Solar System\'s mass'));

// Данные: радиус (км), период (лет), большая полуось (а.е.), сутки — для подписи.
const PLANETS = [
  { id: 'mercury', name: tr('Меркурий', 'Меркурий', 'Mercury'), r: 2440, T: 0.2408, a: 0.387, mkm: 57.9, size: 0.013, orbit: 0.2, color: 0x9e9a94, extra: tr('Сутки длиннее года: 176 земных суток', 'Тәулігі жылынан ұзақ: 176 жер тәулігі', 'A day is longer than its year: 176 Earth days') },
  { id: 'venus', name: tr('Венера', 'Шолпан', 'Venus'), r: 6052, T: 0.6152, a: 0.723, mkm: 108.2, size: 0.021, orbit: 0.28, color: 0xe3c58a, extra: tr('Самая горячая: +465 °C под облаками', 'Ең ыстық планета: бұлттар астында +465 °C', 'The hottest: +465 °C beneath the clouds') },
  { id: 'earth', name: tr('Земля', 'Жер', 'Earth'), r: 6371, T: 1.0, a: 1.0, mkm: 149.6, size: 0.022, orbit: 0.37, color: 0x3a78d0, extra: tr('Ось наклонена на 23,4° — поэтому есть времена года', 'Осі 23,4°-қа көлбеу — сондықтан жыл мезгілдері бар', 'Axis tilted 23.4° — that is why there are seasons') },
  { id: 'mars', name: tr('Марс', 'Марс', 'Mars'), r: 3390, T: 1.8808, a: 1.524, mkm: 227.9, size: 0.016, orbit: 0.46, color: 0xc1552e, extra: tr('Гора Олимп — 22 км в высоту', 'Олимп тауының биіктігі — 22 км', 'Olympus Mons is 22 km high') },
  { id: 'jupiter', name: tr('Юпитер', 'Юпитер', 'Jupiter'), r: 69911, T: 11.862, a: 5.203, mkm: 778.5, size: 0.052, orbit: 0.63, color: 0xd2b48c, extra: tr('Большое красное пятно — шторм больше Земли', 'Үлкен қызыл дақ — Жерден үлкен дауыл', 'The Great Red Spot is a storm larger than Earth') },
  { id: 'saturn', name: tr('Сатурн', 'Сатурн', 'Saturn'), r: 58232, T: 29.457, a: 9.537, mkm: 1432, size: 0.043, orbit: 0.79, color: 0xe6d3a3, extra: tr('Кольца — лёд и камни, толщина около 10 м', 'Сақиналары — мұз бен тас, қалыңдығы шамамен 10 м', 'Rings of ice and rock, about 10 m thick') },
  { id: 'uranus', name: tr('Уран', 'Уран', 'Uranus'), r: 25362, T: 84.011, a: 19.19, mkm: 2867, size: 0.03, orbit: 0.93, color: 0x9fd8e0, extra: tr('Лежит на боку: ось наклонена на 98°', 'Қырынан жатыр: осі 98°-қа көлбеу', 'Lies on its side: axis tilted 98°') },
  { id: 'neptune', name: tr('Нептун', 'Нептун', 'Neptune'), r: 24622, T: 164.79, a: 30.07, mkm: 4515, size: 0.029, orbit: 1.05, color: 0x3f63d8, extra: tr('Ветры до 2 100 км/ч — самые быстрые', 'Желдің жылдамдығы 2 100 км/сағ-қа дейін — ең жылдам', 'Winds up to 2,100 km/h — the fastest') },
];
const fmt = (x, d = 2) => x.toFixed(d).replace('.', ',');
const fmtInt = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function periodText(p) { return p.T < 2 ? `${fmtInt(p.T * 365.25)} ${tr('сут', 'тәул.', 'days')}` : `${fmt(p.T, 1)} ${tr('года', 'жыл', 'yr')}`; }
function factsText(p) {
  return tr(
    `${p.name}\nРадиус ${fmtInt(p.r)} км\nПериод ${periodText(p)}\nОрбита ${fmt(p.a)} а.е. = ${fmtInt(p.mkm)} млн км\nT² / a³ = ${fmt((p.T * p.T) / (p.a ** 3))}  (закон Кеплера)\n${p.extra}`,
    `${p.name}\nРадиусы ${fmtInt(p.r)} км\nПериоды ${periodText(p)}\nОрбитасы ${fmt(p.a)} а.б. = ${fmtInt(p.mkm)} млн км\nT² / a³ = ${fmt((p.T * p.T) / (p.a ** 3))}  (Кеплер заңы)\n${p.extra}`,
    `${p.name}\nRadius ${fmtInt(p.r)} km\nPeriod ${periodText(p)}\nOrbit ${fmt(p.a)} AU = ${fmtInt(p.mkm)} million km\nT² / a³ = ${fmt((p.T * p.T) / (p.a ** 3))}  (Kepler\'s law)\n${p.extra}`);
}

function texFor(p) {
  switch (p.id) {
    case 'mercury': return rockyTexture('#8f8a83', ['#6f6b66', '#b2ada6', '#5c5853'], 3);
    case 'venus': return bandsTexture(['#e8cf98', '#d9b877', '#f0dcae', '#cfa964'], 4);
    case 'earth': return earthTexture();
    case 'mars': return rockyTexture('#b5502b', ['#8a3a1f', '#d7774a', '#6e2d17', '#e8c8b0'], 6);
    case 'jupiter': return bandsTexture(['#d9b98c', '#b07f52', '#efe0c4', '#c89a6a', '#8e5e3a'], 8, '#b5482d');
    case 'saturn': return bandsTexture(['#e8d6a8', '#d4bc85', '#f2e6c4', '#c9ab72'], 9);
    case 'uranus': return bandsTexture(['#a6dde4', '#9bd4dc', '#b4e5ea'], 10);
    default: return bandsTexture(['#3f63d8', '#3557c4', '#5577e6', '#2c49a8'], 12);
  }
}

const orbitMatBase = { transparent: true, depthWrite: false };
let selected = null;
const rodMat = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.9, roughness: 0.35 });

for (const [i, p] of PLANETS.entries()) {
  // Орбита — тонкая окружность.
  const pts = [];
  for (let k = 0; k <= 160; k++) { const a = (k / 160) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit)); }
  const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x7ea2e8, opacity: 0.32, ...orbitMatBase }));
  orbit.position.copy(SUN_C);
  scene.add(orbit);
  p.orbitLine = orbit;

  // Планета: группа (её двигают по орбите и берут в руку) → сфера + латунный стержень вниз.
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(p.size, 32, 20),
    new THREE.MeshStandardMaterial({ map: texFor(p), roughness: 0.85, metalness: 0 }));
  const tiltDeg = { earth: 23.4, mars: 25.2, saturn: 26.7, uranus: 97.8, neptune: 28.3, jupiter: 3.1 }[p.id] ?? 0;
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(tiltDeg);
  tilt.add(body);
  g.add(tilt);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, PLANE_Y - TABLE_Y, 6), rodMat);
  rod.position.y = -(PLANE_Y - TABLE_Y) / 2;
  g.add(rod);
  if (p.id === 'saturn' || p.id === 'uranus') {
    const ring = new THREE.Mesh(ringGeometry(p.size * 1.25, p.size * (p.id === 'saturn' ? 2.3 : 1.6)),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: p.id === 'saturn' ? 1 : 0.35 }));
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }
  if (p.id === 'earth') {
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, p.size * 3.2, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    tilt.add(axis);
    // Луна: орбита вокруг Земли и сама Луна.
    const moonPivot = new THREE.Group();
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 16, 10), new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 1 }));
    moon.position.x = 0.05;
    moonPivot.add(moon);
    g.add(moonPivot);
    const mp = [];
    for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; mp.push(new THREE.Vector3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(mp), new THREE.LineBasicMaterial({ color: 0xaaaaaa, opacity: 0.35, ...orbitMatBase })));
    p.moonPivot = moonPivot;
  }
  scene.add(g);
  p.obj = g; p.body = body;
  p.angle = (i * 2.399) % (Math.PI * 2); // золотой угол — планеты не выстраиваются в линию
  placePlanet(p);

  lab.hover(g, () => tr(`${p.name}\nПериод ${periodText(p)} · ${fmt(p.a)} а.е.`, `${p.name}\nПериоды ${periodText(p)} · ${fmt(p.a)} а.б.`, `${p.name}\nPeriod ${periodText(p)} · ${fmt(p.a)} AU`));
  lab.grab(g, {
    onGrab: () => select(p),
    onMove: (o) => { if (o.userData.heldBy === 'mouse') o.position.y = PLANE_Y; },
    onRelease: (o) => {
      // Отпустили — планета встаёт на свою орбиту под тем углом, где её оставили.
      p.angle = Math.atan2(o.position.z - SUN_C.z, o.position.x - SUN_C.x);
      o.rotation.set(0, 0, 0);
      placePlanet(p);
    },
  });
}

// Пояс астероидов между Марсом и Юпитером.
const belt = (() => {
  const N = 700, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.52 + Math.random() * 0.06;
    pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.012, Math.sin(a) * r], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9a8f80, size: 0.006 }));
  pts.position.copy(SUN_C);
  scene.add(pts);
  return pts;
})();

function placePlanet(p) {
  p.obj.position.set(SUN_C.x + Math.cos(p.angle) * p.orbit, PLANE_Y, SUN_C.z + Math.sin(p.angle) * p.orbit);
}

// Табло с данными выбранной планеты — над дальним краем стола.
const DEFAULT_INFO = tr('Возьмите планету — здесь появятся её данные\nT² / a³ = 1 для всех планет: третий закон Кеплера\n(T — период в годах, a — орбита в а.е.)',
  'Планетаны алыңыз — мұнда оның деректері шығады\nБарлық планета үшін T² / a³ = 1: Кеплердің үшінші заңы\n(T — жылмен период, a — а.б.-мен орбита)',
  'Pick up a planet — its data will appear here\nT² / a³ = 1 for every planet: Kepler\'s third law\n(T — period in years, a — orbit in AU)');
const info = lab.board(DEFAULT_INFO, [SUN_C.x, 1.72, SUN_C.z - 1.45], { scale: 0.0022 });
function setBoard(b, text) {
  const old = b.sprite.material.map;
  b.set(text);
  if (old !== b.sprite.material.map) old.dispose();
}
function select(p) {
  if (selected) selected.orbitLine.material.opacity = 0.32, selected.orbitLine.material.color.set(0x7ea2e8);
  selected = p;
  p.orbitLine.material.opacity = 0.95;
  p.orbitLine.material.color.set(0xffd27a);
  setBoard(info, factsText(p));
}

// ---- Управление временем: 3D-кнопки у края стола и кнопки HUD ----
const SPEEDS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]; // лет в секунду
let speedIdx = 3, paused = false, simYears = 0;
// Пульт стоит за дальним краем стола, над ним табло: с места зрителя они видны поверх орерия.
const CON = new THREE.Vector3(SUN_C.x, 1.2, SUN_C.z - 1.4);
const conAt = (dx) => [CON.x + dx, CON.y, CON.z];
const timeBoard = lab.board('', [CON.x, CON.y + 0.18, CON.z], { scale: 0.0016 });
let timeText = '';
function speedText() {
  const s = SPEEDS[speedIdx];
  const year = 1 / s;
  const sp = fmt(s, s < 0.1 ? 2 : s < 1 ? 2 : 0), yr = fmt(year, year < 10 ? 1 : 0), past = fmt(simYears, 1);
  return tr(
    `${paused ? PAUSE : `Скорость: ${sp} года/с`}\nГод Земли = ${yr} с · прошло ${past} лет`,
    `${paused ? PAUSE : `Жылдамдық: ${sp} жыл/с`}\nЖер жылы = ${yr} с · өткені ${past} жыл`,
    `${paused ? PAUSE : `Speed: ${sp} yr/s`}\nEarth year = ${yr} s · elapsed ${past} yr`);
}
function refreshTime() {
  const t = speedText();
  if (t !== timeText) { timeText = t; setBoard(timeBoard, t); }
}
function slower() { paused = false; speedIdx = Math.max(0, speedIdx - 1); refreshTime(); }
function faster() { paused = false; speedIdx = Math.min(SPEEDS.length - 1, speedIdx + 1); refreshTime(); }
function togglePause() { paused = !paused; pauseBtn.setText(paused ? PLAY : PAUSE); refreshTime(); }
lab.button3d(SLOWER, conAt(-0.4), slower, { width: 0.36, color: 0x3949ab, });
const pauseBtn = lab.button3d(PAUSE, conAt(0), togglePause, { width: 0.36, color: 0xf9a825, });
lab.button3d(FASTER, conAt(0.4), faster, { width: 0.36, color: 0x3949ab, });
{
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.14), new THREE.MeshStandardMaterial({ color: 0x1b2333, metalness: 0.5, roughness: 0.5 }));
  stand.position.set(CON.x, CON.y - 0.1, CON.z - 0.01);
  scene.add(stand);
  for (const dx of [-0.6, 0.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, CON.y - 0.1, 12), stand.material);
    post.position.set(CON.x + dx, (CON.y - 0.1) / 2, CON.z - 0.02);
    scene.add(post);
  }
}
lab.hud.action(SLOWER, slower, ST_PLAN);
const pauseHud = lab.hud.action(PAUSE, () => { togglePause(); pauseHud.textContent = paused ? PLAY : PAUSE; }, ST_PLAN);
lab.hud.action(FASTER, faster, ST_PLAN);
refreshTime();

// ---------- Станция 2: затмения ----------
const EC = new THREE.Vector3(7.2, 1.1, -0.3); // центр стенда
const E_POS = new THREE.Vector3(EC.x + 0.62, EC.y, EC.z);
const S_POS = new THREE.Vector3(EC.x - 0.9, EC.y, EC.z);
const RS = 0.14, RE = 0.08, RM = 0.028, MOON_R = 0.34;
{
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.1), new THREE.MeshStandardMaterial({ color: 0x141b2b, roughness: 0.5, metalness: 0.4 }));
  top.position.set(EC.x, 0.84, EC.z);
  scene.add(top);
  for (const [dx, dz] of [[-1.2, -0.45], [1.2, -0.45], [-1.2, 0.45], [1.2, 0.45]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.81, 8), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
    leg.position.set(EC.x + dx, 0.405, EC.z + dz);
    scene.add(leg);
  }
  // Стойки под лампу и Землю.
  for (const p of [S_POS, E_POS]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, p.y - 0.87, 10), rodMat);
    post.position.set(p.x, (p.y + 0.87) / 2, p.z);
    scene.add(post);
  }
}
const lamp = new THREE.Mesh(new THREE.SphereGeometry(RS, 32, 20), new THREE.MeshBasicMaterial({ map: sunTex }));
lamp.position.copy(S_POS);
scene.add(lamp);
const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
lampGlow.scale.setScalar(1.2);
lampGlow.position.copy(S_POS);
scene.add(lampGlow);
const lampLight = new THREE.PointLight(0xfff0d0, 3.5, 3.4, 0.6);
lampLight.position.copy(S_POS);
scene.add(lampLight);
lab.hover(lamp, tr('Солнце-лампа\nВ модели размеры условные: настоящее Солнце\nв 400 раз больше Луны и в 400 раз дальше',
  'Күн-шам\nМодельде өлшемдер шартты: нақты Күн\nАйдан 400 есе үлкен және 400 есе алыс',
  'Sun lamp\nSizes in the model are not to scale: the real Sun\nis 400 times larger than the Moon and 400 times farther'));

const earth2 = new THREE.Mesh(new THREE.SphereGeometry(RE, 40, 24), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.8 }));
earth2.rotation.z = THREE.MathUtils.degToRad(23.4);
earth2.position.copy(E_POS);
scene.add(earth2);
lab.hover(earth2, tr('Земля\nДневная сторона смотрит на лампу', 'Жер\nКүндізгі жағы шамға қарап тұр', 'Earth\nThe day side faces the lamp'));

// Орбита Луны: группа в центре Земли; node — поворот линии узлов, tilt — наклон.
const nodeG = new THREE.Group();
nodeG.position.copy(E_POS);
scene.add(nodeG);
const tiltG = new THREE.Group();
nodeG.add(tiltG);
{
  const pts = [];
  for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * MOON_R, 0, Math.sin(a) * MOON_R)); }
  tiltG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x9fb4d8, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.7 })).computeLineDistances());
  // Линия Солнце — Земля — продолжение за Землю: вдоль неё и бывают затмения.
  const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([S_POS, new THREE.Vector3(E_POS.x + 0.6, E_POS.y, E_POS.z)]),
    new THREE.LineDashedMaterial({ color: 0xffd27a, dashSize: 0.03, gapSize: 0.03, transparent: true, opacity: 0.45 }));
  axis.computeLineDistances();
  scene.add(axis);
}
const moonMat = new THREE.MeshStandardMaterial({ color: 0xd6d6d6, roughness: 1, emissive: 0x000000 });
const moon2 = new THREE.Mesh(new THREE.SphereGeometry(RM, 24, 16), moonMat);
scene.add(moon2);
let moonAngle = Math.PI * 0.62; // старт — между новолунием и четвертью
let moonAuto = true;
const tmp = new THREE.Vector3();
function placeMoon() {
  tiltG.updateMatrixWorld(true);
  moon2.position.copy(tiltG.localToWorld(tmp.set(Math.cos(moonAngle) * MOON_R, 0, Math.sin(moonAngle) * MOON_R)));
}
function moonAngleFromWorld() {
  tiltG.updateMatrixWorld(true);
  const l = tiltG.worldToLocal(moon2.position.clone());
  return Math.atan2(l.z, l.x);
}
lab.hover(moon2, tr('Луна\nВозьмите и ведите по орбите', 'Ай\nАлып, орбита бойымен жүргізіңіз', 'Moon\nGrab it and move it along the orbit'));
lab.grab(moon2, {
  onGrab: () => { moonAuto = false; autoBtn.setText(MOON_AUTO); autoHud.textContent = MOON_AUTO; },
  onMove: (o) => { if (o.userData.heldBy === 'mouse') { moonAngle = moonAngleFromWorld(); placeMoon(); } },
  onRelease: () => { moonAngle = moonAngleFromWorld(); moon2.rotation.set(0, 0, 0); placeMoon(); },
});

// Конусы теней: умбра (тёмная, сходится) и полутень (светлая, расходится).
const umbraMat = new THREE.MeshBasicMaterial({ color: 0x6a5a8a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
const penMat = new THREE.MeshBasicMaterial({ color: 0x2a3d70, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
const UP = new THREE.Vector3(0, 1, 0);
function shadowSet(r, dist, penLen) {
  const umbraLen = (dist * r) / (RS - r);
  const umbra = new THREE.Mesh(unitCone(0), umbraMat);
  umbra.scale.set(r, umbraLen, r);
  const k = 1 + (penLen * (RS + r)) / (dist * r);
  const pen = new THREE.Mesh(unitCone(k), penMat);
  pen.scale.set(r, penLen, r);
  scene.add(umbra, pen);
  return { umbra, pen, r };
}
const earthShadow = shadowSet(RE, E_POS.distanceTo(S_POS), 0.62);
earthShadow.umbra.position.copy(E_POS); earthShadow.pen.position.copy(E_POS);
{
  const q = new THREE.Quaternion().setFromUnitVectors(UP, E_POS.clone().sub(S_POS).normalize());
  earthShadow.umbra.quaternion.copy(q); earthShadow.pen.quaternion.copy(q);
}
const moonShadow = shadowSet(RM, E_POS.distanceTo(S_POS) - MOON_R, 0.42);

// Пятно тени Луны на Земле при солнечном затмении: два сферических «колпачка».
const spotUmbra = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.012, 24, 6, 0, Math.PI * 2, 0, 0.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false }));
const spotPen = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.008, 24, 6, 0, Math.PI * 2, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
spotUmbra.position.copy(E_POS); spotPen.position.copy(E_POS);
scene.add(spotUmbra, spotPen);
let spotKeyU = -1, spotKeyP = -1;
function setCap(mesh, r, scaleR, key) {
  const theta = Math.min(Math.PI / 2, Math.asin(Math.min(1, r / RE)));
  const k = Math.round(theta * 60);
  if (k === key) return key;
  mesh.geometry.dispose();
  mesh.geometry = new THREE.SphereGeometry(RE * scaleR, 24, 6, 0, Math.PI * 2, 0, Math.max(0.02, k / 60));
  return k;
}

const ECL_TEXT = {
  none: tr('Затмения нет\nЛуна не на линии Солнце — Земля.\nВедите её к пунктирной линии.', 'Тұтылу жоқ\nАй Күн — Жер сызығында емес.\nОны пунктир сызыққа қарай жүргізіңіз.', 'No eclipse\nThe Moon is not on the Sun — Earth line.\nMove it toward the dashed line.'),
  'solar-total': tr('Полное солнечное затмение\nНоволуние: Луна между Солнцем и Землёй.\nТам, где чёрное пятно, Солнце закрыто целиком.', 'Күннің толық тұтылуы\nЖаңа ай: Ай Күн мен Жердің арасында.\nҚара дақ түскен жерде Күн толық жабылған.', 'Total solar eclipse\nNew moon: the Moon is between the Sun and Earth.\nWhere the black spot is, the Sun is fully covered.'),
  'solar-annular': tr('Кольцеобразное солнечное затмение\nКонус тени Луны не достаёт до Земли —\nвокруг Луны видно огненное кольцо Солнца.', 'Күннің сақиналы тұтылуы\nАй көлеңкесінің конусы Жерге жетпейді —\nАйды Күннің отты сақинасы қоршап тұрады.', 'Annular solar eclipse\nThe Moon\'s shadow cone does not reach Earth —\na fiery ring of the Sun shows around the Moon.'),
  'solar-partial': tr('Частное солнечное затмение\nНа Землю падает только полутень Луны —\nСолнце закрыто лишь частично.', 'Күннің жартылай тұтылуы\nЖерге Айдың тек жартылай көлеңкесі түседі —\nКүн ішінара ғана жабылған.', 'Partial solar eclipse\nOnly the Moon\'s penumbra falls on Earth —\nthe Sun is only partly covered.'),
  'lunar-total': tr('Полное лунное затмение\nПолнолуние: Земля между Солнцем и Луной.\nЛуна краснеет — атмосфера Земли пропускает к ней красный свет.', 'Айдың толық тұтылуы\nТолған ай: Жер Күн мен Айдың арасында.\nАй қызарады — Жер атмосферасы оған қызыл жарықты өткізеді.', 'Total lunar eclipse\nFull moon: Earth is between the Sun and the Moon.\nThe Moon turns red — Earth\'s atmosphere lets red light through to it.'),
  'lunar-partial': tr('Частное лунное затмение\nЛуна вошла в тень Земли только частью.', 'Айдың жартылай тұтылуы\nАй Жер көлеңкесіне тек бір бөлігімен кірді.', 'Partial lunar eclipse\nOnly part of the Moon has entered Earth\'s shadow.'),
  'lunar-penumbral': tr('Полутеневое лунное затмение\nЛуна в полутени Земли и темнеет едва заметно.', 'Айдың жартылай көлеңкелі тұтылуы\nАй Жердің жартылай көлеңкесінде, сәл ғана күңгірттенеді.', 'Penumbral lunar eclipse\nThe Moon is in Earth\'s penumbra and dims only slightly.'),
};
const eclBoard = lab.board(ECL_TEXT.none, [EC.x, 1.86, EC.z - 0.6], { scale: 0.0019 });
let eclKind = '';
let tilted = false;
const TILT_TEXT = tr('\nОрбита наклонена: Луна проходит выше или ниже тени,\nпоэтому затмения бывают не каждый месяц.', '\nОрбита көлбеу: Ай көлеңкенің үстінен не астынан өтеді,\nсондықтан тұтылу әр ай сайын бола бермейді.', '\nThe orbit is tilted: the Moon passes above or below the shadow,\nso eclipses do not happen every month.');

function toggleAuto() {
  moonAuto = !moonAuto;
  const t = moonAuto ? MOON_STOP : MOON_AUTO;
  autoBtn.setText(t); autoHud.textContent = t;
}
function toggleTilt() {
  tilted = !tilted;
  tiltG.rotation.x = tilted ? THREE.MathUtils.degToRad(18) : 0;
  nodeG.rotation.y = tilted ? Math.PI / 2 : 0;
  placeMoon(); eclKind = '';
}
function turnNodes() { if (!tilted) toggleTilt(); nodeG.rotation.y += Math.PI / 6; placeMoon(); eclKind = ''; }
const BX = EC.x - 0.66, BZ = EC.z - 0.5, BY = 1.52;
{
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x1b2333, metalness: 0.4, roughness: 0.6 }));
  panel.position.set(EC.x, BY, BZ - 0.04);
  scene.add(panel);
  for (const dx of [-1.0, 1.0]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, BY - 0.87, 8), rodMat);
    leg.position.set(EC.x + dx, (BY + 0.87) / 2 - 0.08, BZ - 0.06);
    scene.add(leg);
  }
}
const autoBtn = lab.button3d(MOON_STOP, [BX, BY, BZ], toggleAuto, { width: 0.56, color: 0x546e7a });
lab.button3d(TILT_BTN, [BX + 0.66, BY, BZ], toggleTilt, { width: 0.6, color: 0x3949ab });
lab.button3d(NODES_BTN, [BX + 1.32, BY, BZ], turnNodes, { width: 0.6, color: 0x3949ab });
const autoHud = lab.hud.action(MOON_STOP, toggleAuto, ST_ECL);
lab.hud.action(TILT_BTN, toggleTilt, ST_ECL);
lab.hud.action(NODES_BTN, turnNodes, ST_ECL);
scene.add(placeLabel(makeLabel(tr('Наклон орбиты Луны в модели увеличен (18° вместо 5°)', 'Модельде Ай орбитасының көлбеулігі үлкейтілген (5° орнына 18°)', 'The Moon\'s orbital tilt is exaggerated in the model (18° instead of 5°)'), { scale: 0.0011 }), EC.x, BY - 0.21, BZ));
placeMoon();
// Для автопроверки скриншотами: поставить Луну под нужным углом (π — новолуние, 0 — полнолуние).
window.__astro = { setMoon(a) { moonAuto = false; moonAngle = a; placeMoon(); } };

const qTmp = new THREE.Quaternion(), dirTmp = new THREE.Vector3(), red = new THREE.Color(0xb3471f), grey = new THREE.Color(0xd6d6d6);

// ---------- Кадр ----------
lab.setFrame((dt, t) => {
  // Станция 1: время, орбиты, вращение.
  const speed = paused ? 0 : SPEEDS[speedIdx];
  simYears += speed * dt;
  for (const p of PLANETS) {
    p.angle -= (speed * dt * Math.PI * 2) / p.T; // против часовой, если смотреть сверху
    if (!p.obj.userData.heldBy) placePlanet(p);
    p.body.rotation.y += dt * (speed > 0 ? 1.2 : 0.15);
    if (p.moonPivot) p.moonPivot.rotation.y -= (speed * dt * Math.PI * 2) / 0.0748;
  }
  belt.rotation.y -= speed * dt * 0.6;
  sun.rotation.y += dt * 0.08;
  sunGlow.scale.setScalar(0.62 * pulse(t, 3, 0.94, 1.06));
  sunGlow.material.rotation += dt * 0.05;
  if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) refreshTime();

  // Станция 2: Луна и затмения.
  if (moonAuto && !moon2.userData.heldBy) { moonAngle -= dt * 0.35; placeMoon(); }
  if (moon2.userData.heldBy && moon2.userData.heldBy !== 'mouse') moon2.getWorldPosition(moon2.userData.wp ??= new THREE.Vector3());
  const M = moon2.userData.heldBy && moon2.userData.heldBy !== 'mouse' ? moon2.userData.wp : moon2.position;
  earth2.rotation.y += dt * 0.25;
  lampGlow.scale.setScalar(1.2 * pulse(t, 2.6, 0.95, 1.05));

  dirTmp.subVectors(M, S_POS).normalize();
  qTmp.setFromUnitVectors(UP, dirTmp);
  const dSM = M.distanceTo(S_POS);
  moonShadow.umbra.position.copy(M); moonShadow.umbra.quaternion.copy(qTmp);
  moonShadow.umbra.scale.set(RM, (dSM * RM) / (RS - RM), RM);
  moonShadow.pen.position.copy(M); moonShadow.pen.quaternion.copy(qTmp);

  const ecl = classify(S_POS, RS, E_POS, RE, M, RM);
  const solar = ecl.kind.startsWith('solar');
  spotUmbra.visible = solar && ecl.kind !== 'solar-partial';
  spotPen.visible = solar;
  if (solar) {
    qTmp.setFromUnitVectors(UP, ecl.normal);
    spotUmbra.quaternion.copy(qTmp); spotPen.quaternion.copy(qTmp);
    spotKeyU = setCap(spotUmbra, Math.max(ecl.umbra, 0.006), 1.012, spotKeyU);
    spotKeyP = setCap(spotPen, ecl.penumbra, 1.008, spotKeyP);
    spotUmbra.material.color.set(ecl.kind === 'solar-annular' ? 0x3a2a10 : 0x000000);
  }
  const redK = ecl.kind === 'lunar-total' ? 1 : ecl.kind === 'lunar-partial' ? 0.5 * ecl.depth : 0;
  moonMat.color.copy(grey).lerp(red, redK);
  moonMat.color.multiplyScalar(ecl.kind === 'lunar-penumbral' ? 0.75 : 1);
  moonMat.emissive.setRGB(0.25 * redK, 0.06 * redK, 0.02 * redK);

  const kind = ecl.kind + (tilted ? '+t' : '');
  if (kind !== eclKind) {
    eclKind = kind;
    setBoard(eclBoard, ECL_TEXT[ecl.kind] + (tilted && ecl.kind === 'none' ? TILT_TEXT : ''));
  }
});

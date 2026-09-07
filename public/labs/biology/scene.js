import { createLab, makeLabel, placeLabel, pulse } from '../common.js';

const lab = createLab({
  title: 'Внутри клетки',
  hint: 'Наведите на органеллу — появится подпись. Мышь: вращать, колесо — ближе. В VR: луч контроллера, курок — телепорт по дискам.',
  stations: [
    { name: 'Клетка изнутри', at: [0, 1.6, 0], look: [0, 1.6, -4] },
    { name: 'Двойная спираль', at: [22, 1.6, 0], look: [22, 1.7, -3] },
  ],
  sky: 0x070b14, fogFar: 34,
});
const { THREE, scene } = lab;

// ---------- Станция 1: клетка ----------
const CELL_R = 10;
const membrane = new THREE.Mesh(new THREE.SphereGeometry(CELL_R, 64, 48),
  new THREE.MeshPhysicalMaterial({ color: 0x1b3f6b, transparent: true, opacity: 0.35, side: THREE.BackSide,
    roughness: 0.4, transmission: 0, emissive: 0x0d2f55, emissiveIntensity: 0.4 }));
membrane.position.y = 1;
scene.add(membrane);
lab.hover(membrane, 'Клеточная мембрана\nДвойной слой липидов, пропускает не всё');
// Белковые каналы на мембране
const chanGeo = new THREE.TorusGeometry(0.28, 0.09, 10, 20);
const chanMat = new THREE.MeshStandardMaterial({ color: 0x7fd3ff, emissive: 0x2a7bd4, emissiveIntensity: 0.6 });
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(chanGeo, chanMat);
  const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
  m.position.setFromSphericalCoords(CELL_R - 0.05, ph, th).add(membrane.position);
  if (m.position.y < 0.4) continue;
  m.lookAt(membrane.position);
  scene.add(m);
  lab.hover(m, 'Белковый канал\nПропускает ионы и воду через мембрану');
}

// Ядро
const nucleus = new THREE.Group();
nucleus.position.set(0, 2.4, -5.5);
const nucMesh = new THREE.Mesh(new THREE.SphereGeometry(2.1, 48, 36),
  new THREE.MeshPhysicalMaterial({ color: 0x6b3fa0, transparent: true, opacity: 0.55, roughness: 0.3,
    emissive: 0x4a2a80, emissiveIntensity: 0.5 }));
nucleus.add(nucMesh);
const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffb74d, emissive: 0xff8f00, emissiveIntensity: 0.9 }));
nucleolus.position.set(0.5, 0.2, 0.3);
nucleus.add(nucleolus);
// Хроматин — нитки внутри ядра
for (let i = 0; i < 6; i++) {
  const pts = [];
  for (let k = 0; k < 24; k++) pts.push(new THREE.Vector3().randomDirection().multiplyScalar(1.6 * Math.random()));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.04, 6, false),
    new THREE.MeshStandardMaterial({ color: 0xe1bee7, emissive: 0xba68c8, emissiveIntensity: 0.4 }));
  nucleus.add(tube);
}
// Поры
const poreGeo = new THREE.TorusGeometry(0.16, 0.05, 8, 16);
for (let i = 0; i < 30; i++) {
  const p = new THREE.Mesh(poreGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd1c4e9, emissiveIntensity: 0.6 }));
  p.position.randomDirection().multiplyScalar(2.1);
  p.lookAt(0, 0, 0);
  nucleus.add(p);
}
scene.add(nucleus);
lab.hover(nucMesh, 'Ядро\nХранит ДНК; через поры выходит мРНК');
lab.hover(nucleolus, 'Ядрышко\nЗдесь собираются рибосомы');

// Митохондрии
const mitoMat = new THREE.MeshStandardMaterial({ color: 0xff7043, emissive: 0xe64a19, emissiveIntensity: 0.6, roughness: 0.5 });
const mitos = [];
for (let i = 0; i < 7; i++) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.3, 8, 20), mitoMat.clone());
  g.add(body);
  // Кристы — складки внутри
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xffccbc, emissive: 0xff8a65, emissiveIntensity: 0.5 }));
    c.position.y = -0.6 + k * 0.3;
    c.rotation.x = Math.PI / 2;
    c.rotation.z = k % 2 ? 0 : Math.PI;
    g.add(c);
  }
  const a = (i / 7) * Math.PI * 2;
  g.position.set(Math.cos(a) * 6, 1.4 + Math.sin(i * 1.7) * 1.2, Math.sin(a) * 6 - 1);
  g.rotation.set(Math.random(), Math.random() * 3, Math.random());
  g.userData.phase = Math.random() * 6;
  scene.add(g);
  mitos.push(g);
  lab.hover(body, 'Митохондрия\nЭнергостанция: дыхание, синтез АТФ');
}

// ЭПР — лента вокруг ядра
{
  const pts = [];
  for (let k = 0; k <= 40; k++) {
    const a = (k / 40) * Math.PI * 2.4;
    pts.push(new THREE.Vector3(Math.cos(a) * (3.2 + Math.sin(k * 0.9) * 0.4), 2.4 + Math.sin(k * 0.5) * 0.9, -5.5 + Math.sin(a) * 3.2));
  }
  const er = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.16, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x0288d1, emissiveIntensity: 0.5, roughness: 0.35 }));
  scene.add(er);
  lab.hover(er, 'Эндоплазматическая сеть\nСобирает и переправляет белки');
  // Рибосомы на ЭПР
  const rib = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbbdefb, emissiveIntensity: 0.6 }), 260);
  const m = new THREE.Matrix4();
  const curve = new THREE.CatmullRomCurve3(pts);
  for (let i = 0; i < 260; i++) {
    const p = curve.getPoint(Math.random());
    p.add(new THREE.Vector3().randomDirection().multiplyScalar(0.2));
    m.makeTranslation(p.x, p.y, p.z);
    rib.setMatrixAt(i, m);
  }
  scene.add(rib);
  lab.hover(rib, 'Рибосомы\nЧитают мРНК и собирают белок');
}

// Аппарат Гольджи — стопка дисков
{
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(1.1 - k * 0.08, 32, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffa000, emissiveIntensity: 0.45 }));
    d.scale.y = 0.12;
    d.position.y = k * 0.24;
    g.add(d);
    lab.hover(d, 'Аппарат Гольджи\nУпаковывает белки в везикулы');
  }
  g.position.set(-5, 1.2, 1.5);
  g.rotation.z = 0.4;
  scene.add(g);
}

// Лизосомы и везикулы
const vesicles = [];
for (let i = 0; i < 14; i++) {
  const lyso = i < 5;
  const v = new THREE.Mesh(new THREE.SphereGeometry(lyso ? 0.32 : 0.18, 20, 14),
    new THREE.MeshPhysicalMaterial({ color: lyso ? 0x66bb6a : 0xffffff, transparent: true, opacity: 0.7,
      emissive: lyso ? 0x2e7d32 : 0x90caf9, emissiveIntensity: 0.5 }));
  v.position.set((Math.random() - 0.5) * 12, 0.8 + Math.random() * 3.5, (Math.random() - 0.5) * 12);
  v.userData.vel = new THREE.Vector3().randomDirection().multiplyScalar(0.15);
  scene.add(v);
  vesicles.push(v);
  lab.hover(v, lyso ? 'Лизосома\nПереваривает отработанное' : 'Везикула\nПузырёк-курьер с грузом');
}

// Цитоплазма — взвесь молекул
const dust = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
    Array.from({ length: 3000 }, () => (Math.random() - 0.5) * 18), 3)),
  new THREE.PointsMaterial({ color: 0x9ecfff, size: 0.03, transparent: true, opacity: 0.6 }));
dust.position.y = 3;
scene.add(dust);

// Табличка
scene.add(placeLabel(makeLabel('Вы уменьшены в 40 000 раз.\nКлетка — не мешок с жидкостью, а город.', { scale: 0.0026 }), 0, 2.6, -2.8));

// ---------- Станция 2: ДНК ----------
const DNA = new THREE.Group();
DNA.position.set(22, 0.2, -3);
scene.add(DNA);
const H = 3.2, TURNS = 3.2, N = 42, R = 0.42;
const BASES = { A: 0x66bb6a, T: 0xef5350, G: 0x42a5f5, C: 0xffee58 };
const NAMES = { A: 'аденин', T: 'тимин', G: 'гуанин', C: 'цитозин' };
const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
const rungs = [];
const strandA = [], strandB = [];
const bbMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, emissive: 0x546e7a, emissiveIntensity: 0.3, roughness: 0.4 });
const bbGeo = new THREE.SphereGeometry(0.075, 12, 10);
const rungGeo = new THREE.CylinderGeometry(0.035, 0.035, R, 8);
rungGeo.rotateZ(Math.PI / 2);
rungGeo.translate(R / 2, 0, 0);
for (let i = 0; i < N; i++) {
  const b1 = 'ATGC'[Math.floor(Math.random() * 4)], b2 = PAIR[b1];
  const a = new THREE.Mesh(bbGeo, bbMat), b = new THREE.Mesh(bbGeo, bbMat);
  const r1 = new THREE.Mesh(rungGeo, new THREE.MeshStandardMaterial({ color: BASES[b1], emissive: BASES[b1], emissiveIntensity: 0.5 }));
  const r2 = new THREE.Mesh(rungGeo, new THREE.MeshStandardMaterial({ color: BASES[b2], emissive: BASES[b2], emissiveIntensity: 0.5 }));
  DNA.add(a, b, r1, r2);
  strandA.push(a); strandB.push(b);
  rungs.push({ i, a, b, r1, r2, b1, b2 });
  const bonds = b1 === 'A' || b1 === 'T' ? 2 : 3;
  const txt = `${b1}–${b2}: ${NAMES[b1]}–${NAMES[b2]}\n${bonds} водородные связи`;
  lab.hover(r1, txt); lab.hover(r2, txt);
}
// Каркас между соседними «бусинами»
const bbLinks = [];
const linkGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
for (let i = 0; i < N - 1; i++) {
  const la = new THREE.Mesh(linkGeo, bbMat), lb = new THREE.Mesh(linkGeo, bbMat);
  DNA.add(la, lb);
  bbLinks.push([la, lb]);
}
let unzip = 0, unzipTarget = 0, spin = true;
function layoutDNA() {
  for (const r of rungs) {
    const t = r.i / (N - 1);
    const y = t * H;
    const ang = t * TURNS * Math.PI * 2;
    // Расстёгиваем сверху вниз: верхние пары расходятся первыми.
    const open = Math.max(0, Math.min(1, (t - (1 - unzip * 1.25)) / 0.25));
    const sep = open * 0.55;
    r.a.position.set(Math.cos(ang) * R + Math.cos(ang) * sep, y, Math.sin(ang) * R + Math.sin(ang) * sep);
    r.b.position.set(-Math.cos(ang) * R - Math.cos(ang) * sep, y, -Math.sin(ang) * R - Math.sin(ang) * sep);
    r.r1.position.copy(r.a.position);
    r.r1.rotation.y = -ang + Math.PI;
    r.r2.position.copy(r.b.position);
    r.r2.rotation.y = -ang;
  }
  for (let i = 0; i < N - 1; i++) {
    for (const [k, arr] of [[0, strandA], [1, strandB]]) {
      const m = bbLinks[i][k];
      const p = arr[i].position, q = arr[i + 1].position;
      m.position.lerpVectors(p, q, 0.5);
      m.scale.y = p.distanceTo(q);
      m.lookAt(q);
      m.rotateX(Math.PI / 2);
    }
  }
}
layoutDNA();
const legend = makeLabel('А аденин  Т тимин  Г гуанин  Ц цитозин\nА–Т двумя связями, Г–Ц тремя', { scale: 0.0022 });
legend.position.set(23.9, 2.7, -3);
scene.add(legend);
const unzipBtn = lab.button3d('Расплести', [21.0, 0.7, -2.4], toggleUnzip, { width: 0.6 });
lab.button3d('Вращение', [23.0, 0.7, -2.4], () => { spin = !spin; }, { width: 0.6, color: 0x5c6bc0 });
lab.hud.action('Расплести / собрать', toggleUnzip);
lab.hud.action('Вращение', () => { spin = !spin; });
function toggleUnzip() {
  unzipTarget = unzipTarget ? 0 : 1;
  unzipBtn.setText(unzipTarget ? 'Собрать' : 'Расплести');
}

// ---------- Цикл ----------
lab.setFrame((dt, t) => {
  for (const m of mitos) {
    const k = pulse(t + m.userData.phase, 1.8, 0.4, 1.1);
    m.children[0].material.emissiveIntensity = k;
    m.rotation.y += dt * 0.08;
    m.position.y += Math.sin(t * 0.6 + m.userData.phase) * dt * 0.05;
  }
  nucleolus.material.emissiveIntensity = pulse(t, 3, 0.6, 1.2);
  for (const v of vesicles) {
    v.position.addScaledVector(v.userData.vel, dt);
    if (v.position.length() > 8.5 || v.position.y < 0.5) v.userData.vel.negate();
  }
  dust.rotation.y += dt * 0.01;
  if (unzip !== unzipTarget) {
    unzip += Math.sign(unzipTarget - unzip) * dt * 0.35;
    unzip = Math.max(0, Math.min(1, unzip));
    layoutDNA();
  }
  if (spin) DNA.rotation.y += dt * 0.25;
});

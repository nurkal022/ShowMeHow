import { createLab, makeLabel, placeLabel, pulse } from '../common.js';

const lab = createLab({
  title: 'Внутри клетки',
  hint: 'Наведите на органеллу — подпись; нажмите — подлетите к ней. Следите за мРНК: она выходит из ядра, рибосома собирает белок, везикула уносит его к мембране.',
  stations: [
    { name: 'Клетка изнутри', at: [0, 1.7, 4.5], look: [0, 2.2, -4] },
    { name: 'Двойная спираль', at: [22, 1.6, 0.5], look: [22, 1.8, -3] },
  ],
  sky: 0x070b14, fogFar: 36,
});
const { THREE, scene } = lab;
const CENTER = new THREE.Vector3(0, 1, 0);
const CELL_R = 10;

// ---------- Мембрана: полупрозрачная сфера и липидный бислой из «головок» ----------
const membrane = new THREE.Mesh(new THREE.SphereGeometry(CELL_R, 64, 48),
  new THREE.MeshPhysicalMaterial({ color: 0x1b3f6b, transparent: true, opacity: 0.22, side: THREE.BackSide, roughness: 0.4, emissive: 0x0d2f55, emissiveIntensity: 0.35 }));
membrane.position.copy(CENTER);
scene.add(membrane);
lab.hover(membrane, 'Клеточная мембрана\nДва слоя липидов: головки наружу, хвосты внутрь');
{
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a90d9, emissive: 0x1e5fa8, emissiveIntensity: 0.25, transparent: true, opacity: 0.55 }), 2200);
  const m = new THREE.Matrix4(); const p = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < 20000 && k < 2200; i++) {
    p.randomDirection().multiplyScalar(CELL_R - 0.18).add(CENTER);
    if (p.y < 0.35) continue;
    m.makeTranslation(p.x, p.y, p.z); heads.setMatrixAt(k++, m);
  }
  heads.count = k;
  scene.add(heads);
  lab.hover(heads, 'Липидный бислой\nГидрофильные головки смотрят в воду, хвосты спрятаны');
}
// Белковые каналы
{
  const chanGeo = new THREE.TorusGeometry(0.3, 0.1, 10, 20);
  const chanMat = new THREE.MeshStandardMaterial({ color: 0x7fd3ff, emissive: 0x2a7bd4, emissiveIntensity: 0.7 });
  for (let i = 0; i < 36; i++) {
    const c = new THREE.Mesh(chanGeo, chanMat);
    c.position.randomDirection().multiplyScalar(CELL_R - 0.1).add(CENTER);
    if (c.position.y < 0.6) { i--; continue; }
    c.lookAt(CENTER); scene.add(c);
    lab.hover(c, 'Белковый канал\nПропускает ионы и воду сквозь мембрану');
  }
}

// ---------- Ядро ----------
const NUC = new THREE.Vector3(0, 2.6, -5.5);
const nucleus = new THREE.Group(); nucleus.position.copy(NUC); scene.add(nucleus);
const nucMesh = new THREE.Mesh(new THREE.SphereGeometry(2.1, 48, 36),
  new THREE.MeshPhysicalMaterial({ color: 0x6b3fa0, transparent: true, opacity: 0.5, roughness: 0.3, emissive: 0x4a2a80, emissiveIntensity: 0.5 }));
nucleus.add(nucMesh);
const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffb74d, emissive: 0xff8f00, emissiveIntensity: 0.9 }));
nucleolus.position.set(0.5, 0.2, 0.3); nucleus.add(nucleolus);
for (let i = 0; i < 6; i++) {
  const pts = []; for (let k = 0; k < 24; k++) pts.push(new THREE.Vector3().randomDirection().multiplyScalar(1.6 * Math.random()));
  nucleus.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.04, 6, false),
    new THREE.MeshStandardMaterial({ color: 0xe1bee7, emissive: 0xba68c8, emissiveIntensity: 0.4 })));
}
const pores = [];
{
  const poreGeo = new THREE.TorusGeometry(0.16, 0.05, 8, 16);
  for (let i = 0; i < 30; i++) {
    const p = new THREE.Mesh(poreGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd1c4e9, emissiveIntensity: 0.6 }));
    p.position.randomDirection().multiplyScalar(2.1); p.lookAt(0, 0, 0); nucleus.add(p);
    if (p.position.z > 0.5) pores.push(p);
    lab.hover(p, 'Ядерная пора\nЧерез неё мРНК выходит в цитоплазму');
  }
}

// ---------- ЭПР с рибосомами ----------
const erPts = [];
for (let k = 0; k <= 40; k++) {
  const a = (k / 40) * Math.PI * 2.4;
  erPts.push(new THREE.Vector3(Math.cos(a) * (3.4 + Math.sin(k * 0.9) * 0.4), 2.4 + Math.sin(k * 0.5) * 0.9, -5.5 + Math.sin(a) * 3.4));
}
const erCurve = new THREE.CatmullRomCurve3(erPts);
const er = new THREE.Mesh(new THREE.TubeGeometry(erCurve, 300, 0.16, 8, false),
  new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x0288d1, emissiveIntensity: 0.5, roughness: 0.35 }));
scene.add(er);
lab.hover(er, 'Шероховатая ЭПР\nМембранные каналы, усыпанные рибосомами');
{
  const rib = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbbdefb, emissiveIntensity: 0.6 }), 260);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 260; i++) { const p = erCurve.getPoint(Math.random()).add(new THREE.Vector3().randomDirection().multiplyScalar(0.2)); m.makeTranslation(p.x, p.y, p.z); rib.setMatrixAt(i, m); }
  scene.add(rib);
  lab.hover(rib, 'Рибосомы\nЧитают мРНК по три буквы и собирают белок');
}

// ---------- Митохондрии с искрами АТФ ----------
const mitos = [];
for (let i = 0; i < 7; i++) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.3, 8, 20), new THREE.MeshStandardMaterial({ color: 0xff7043, emissive: 0xe64a19, emissiveIntensity: 0.6, roughness: 0.5 }));
  g.add(body);
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffccbc, emissive: 0xff8a65, emissiveIntensity: 0.5 }));
    c.position.y = -0.6 + k * 0.3; c.rotation.x = Math.PI / 2; c.rotation.z = k % 2 ? 0 : Math.PI; g.add(c);
  }
  const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(90).fill(0), 3)),
    new THREE.PointsMaterial({ color: 0xffe082, size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.userData.parts = Array.from({ length: 30 }, () => ({ t: Math.random(), dir: new THREE.Vector3().randomDirection() }));
  g.add(sparks); g.userData.sparks = sparks;
  const a = (i / 7) * Math.PI * 2 + 0.4;
  g.position.set(Math.cos(a) * 6.2, 1.4 + Math.sin(i * 1.7) * 1.2, Math.sin(a) * 6.2 - 1);
  g.rotation.set(Math.random(), Math.random() * 3, Math.random());
  g.userData.phase = Math.random() * 6;
  scene.add(g); mitos.push(g);
  lab.hover(body, 'Митохондрия\nСжигает глюкозу и выпускает АТФ — искры энергии');
  lab.click(body, () => focus(g, 'Митохондрия', 'Внутренняя мембрана сложена в кристы: больше площадь — больше АТФ. У клетки их сотни.'));
}

// ---------- Аппарат Гольджи ----------
const GOLGI = new THREE.Vector3(-5, 1.6, 1.5);
const golgi = new THREE.Group(); golgi.position.copy(GOLGI); golgi.rotation.z = 0.4; scene.add(golgi);
for (let k = 0; k < 6; k++) {
  const d = new THREE.Mesh(new THREE.SphereGeometry(1.1 - k * 0.08, 32, 8), new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffa000, emissiveIntensity: 0.45 }));
  d.scale.y = 0.12; d.position.y = k * 0.24; golgi.add(d);
  lab.hover(d, 'Аппарат Гольджи\nСортирует белки и упаковывает в везикулы');
  lab.click(d, () => focus(golgi, 'Аппарат Гольджи', 'Стопка мембранных цистерн: белок из ЭПР доделывается, подписывается адресом и отправляется в везикуле.'));
}

// ---------- Лизосомы, везикулы, цитоскелет, взвесь ----------
const drifters = [];
for (let i = 0; i < 12; i++) {
  const lyso = i < 5;
  const v = new THREE.Mesh(new THREE.SphereGeometry(lyso ? 0.32 : 0.18, 20, 14),
    new THREE.MeshPhysicalMaterial({ color: lyso ? 0x66bb6a : 0xffffff, transparent: true, opacity: 0.7, emissive: lyso ? 0x2e7d32 : 0x90caf9, emissiveIntensity: 0.5 }));
  v.position.set((Math.random() - 0.5) * 12, 0.8 + Math.random() * 3.5, (Math.random() - 0.5) * 12);
  v.userData.vel = new THREE.Vector3().randomDirection().multiplyScalar(0.15);
  scene.add(v); drifters.push(v);
  lab.hover(v, lyso ? 'Лизосома\nКислый пузырёк с ферментами: переваривает отработанное' : 'Везикула\nПузырёк-курьер с грузом');
}
{
  const pts = [];
  for (let i = 0; i < 60; i++) {
    const a = new THREE.Vector3().randomDirection().multiplyScalar(CELL_R * 0.9).add(CENTER);
    const b = new THREE.Vector3().randomDirection().multiplyScalar(CELL_R * 0.9).add(CENTER);
    if (a.y < 0.3 || b.y < 0.3) { i--; continue; }
    pts.push(a, b);
  }
  const sk = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x5c6bc0, transparent: true, opacity: 0.18 }));
  scene.add(sk);
}
const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 3000 }, () => (Math.random() - 0.5) * 18), 3)),
  new THREE.PointsMaterial({ color: 0x9ecfff, size: 0.03, transparent: true, opacity: 0.6 }));
dust.position.y = 3; scene.add(dust);

// ---------- Фокус на органелле ----------
const infoBoard = lab.board('Клетка живёт: следите за красной нитью мРНК', [0, 4.6, -1.5], { scale: 0.0028 });
lab.hover(nucMesh, 'Ядро\nХранит ДНК; здесь пишется мРНК');
lab.click(nucMesh, () => focus(nucleus, 'Ядро', 'Внутри — два метра ДНК, смотанных в хроматин. Ядрышко собирает рибосомы, поры выпускают мРНК.'));
lab.hover(nucleolus, 'Ядрышко\nЗдесь собираются рибосомы');
lab.click(er, () => focus(er, 'Эндоплазматическая сеть', 'Лабиринт мембран: на шероховатой ЭПР рибосомы собирают белки, гладкая делает липиды.'));
function focus(obj, title, text) {
  const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); const r = box.getSize(new THREE.Vector3()).length();
  const dir = c.clone().sub(CENTER).setY(0).normalize().negate();
  const at = c.clone().addScaledVector(dir, r * 0.9 + 1.2); at.y = Math.max(1.2, c.y);
  lab.teleport({ name: title, at: [at.x, at.y, at.z], look: [c.x, c.y, c.z] });
  infoBoard.set(`${title}\n${text}`);
}

// ---------- Живой процесс: ядро → рибосома → Гольджи → мембрана ----------
const cargos = [];
function beadChain(n, color, r) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 })); b.position.x = (i - n / 2) * r * 1.9; g.add(b); }
  return g;
}
function spawnCargo() {
  const pore = pores[Math.floor(Math.random() * pores.length)];
  const start = pore.getWorldPosition(new THREE.Vector3());
  const ribo = erCurve.getPoint(Math.random()).add(new THREE.Vector3(0, 0.22, 0));
  const mrna = beadChain(9, 0xff5252, 0.07); mrna.position.copy(start); scene.add(mrna);
  lab.hover(mrna, 'мРНК\nКопия гена, идёт из ядра к рибосоме');
  cargos.push({ phase: 'mrna', t: 0, mrna, from: start, to: ribo, ribo });
}
function stepCargo(c, dt) {
  c.t += dt;
  if (c.phase === 'mrna') {
    const k = Math.min(1, c.t / 4);
    c.mrna.position.lerpVectors(c.from, c.to, k); c.mrna.position.y += Math.sin(k * Math.PI) * 0.6; c.mrna.rotation.y += dt;
    if (k >= 1) { c.phase = 'translate'; c.t = 0; c.protein = beadChain(0, 0x69f0ae, 0.08); c.protein.position.copy(c.ribo); scene.add(c.protein); lab.hover(c.protein, 'Белок\nЦепочка аминокислот, собранная по мРНК'); }
  } else if (c.phase === 'translate') {
    const want = Math.min(12, Math.floor(c.t / 0.3));
    while (c.protein.children.length < want) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0x69f0ae, emissive: 0x00c853, emissiveIntensity: 0.8 }));
      const i = c.protein.children.length; b.position.set(Math.sin(i * 0.9) * 0.16, i * 0.09, Math.cos(i * 0.9) * 0.16); c.protein.add(b);
    }
    c.mrna.rotation.y += dt * 2;
    if (c.t > 4) { c.phase = 'toGolgi'; c.t = 0; scene.remove(c.mrna); c.from = c.protein.position.clone(); }
  } else if (c.phase === 'toGolgi') {
    const k = Math.min(1, c.t / 4);
    c.protein.position.lerpVectors(c.from, GOLGI.clone().add(new THREE.Vector3(0, 0.9, 0)), k); c.protein.rotation.y += dt;
    if (k >= 1) {
      c.phase = 'vesicle'; c.t = 0; scene.remove(c.protein);
      c.ves = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0xfff59d, transparent: true, opacity: 0.75, emissive: 0xffd600, emissiveIntensity: 0.6 }));
      c.ves.add(beadChain(5, 0x69f0ae, 0.05)); c.ves.position.copy(GOLGI).add(new THREE.Vector3(0, 1.1, 0)); scene.add(c.ves);
      lab.hover(c.ves, 'Везикула с белком\nОтпочковалась от Гольджи, идёт к мембране');
      c.from = c.ves.position.clone(); c.to = new THREE.Vector3().randomDirection().setY(Math.abs(Math.random()) * 0.6 + 0.2).normalize().multiplyScalar(CELL_R - 0.5).add(CENTER);
    }
  } else if (c.phase === 'vesicle') {
    const k = Math.min(1, c.t / 5);
    c.ves.position.lerpVectors(c.from, c.to, k); c.ves.scale.setScalar(1 + Math.sin(c.t * 6) * 0.05);
    if (k >= 1) {
      c.phase = 'done';
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd600, transparent: true, opacity: 0.6 }));
      flash.position.copy(c.to); scene.add(flash); c.flash = flash; c.t = 0; scene.remove(c.ves);
    }
  } else if (c.phase === 'done') {
    c.flash.scale.setScalar(1 + c.t * 3); c.flash.material.opacity = Math.max(0, 0.6 - c.t);
    if (c.t > 0.7) { scene.remove(c.flash); return true; }
  }
  return false;
}
let spawnTimer = 1;

// ---------- Станция 2: ДНК + транскрипция ----------
const DNA = new THREE.Group(); DNA.position.set(22, 0.2, -3); scene.add(DNA);
const H = 3.2, TURNS = 3.2, N = 42, R = 0.42;
const BASES = { A: 0x66bb6a, T: 0xef5350, G: 0x42a5f5, C: 0xffee58, U: 0xff9800 };
const NAMES = { A: 'аденин', T: 'тимин', G: 'гуанин', C: 'цитозин' };
const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
const RNA = { A: 'U', T: 'A', G: 'C', C: 'G' };
const rungs = []; const strandA = []; const strandB = [];
const bbMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, emissive: 0x546e7a, emissiveIntensity: 0.3, roughness: 0.4 });
const bbGeo = new THREE.SphereGeometry(0.075, 12, 10);
const rungGeo = new THREE.CylinderGeometry(0.035, 0.035, R, 8); rungGeo.rotateZ(Math.PI / 2); rungGeo.translate(R / 2, 0, 0);
const seq = Array.from({ length: N }, () => 'ATGC'[Math.floor(Math.random() * 4)]);
for (let i = 0; i < N; i++) {
  const b1 = seq[i], b2 = PAIR[b1];
  const a = new THREE.Mesh(bbGeo, bbMat), b = new THREE.Mesh(bbGeo, bbMat);
  const r1 = new THREE.Mesh(rungGeo, new THREE.MeshStandardMaterial({ color: BASES[b1], emissive: BASES[b1], emissiveIntensity: 0.5 }));
  const r2 = new THREE.Mesh(rungGeo, new THREE.MeshStandardMaterial({ color: BASES[b2], emissive: BASES[b2], emissiveIntensity: 0.5 }));
  DNA.add(a, b, r1, r2); strandA.push(a); strandB.push(b);
  rungs.push({ i, a, b, r1, r2, b1, b2 });
  const bonds = b1 === 'A' || b1 === 'T' ? 2 : 3;
  const txt = `${b1}–${b2}: ${NAMES[b1]}–${NAMES[b2]}\n${bonds} водородные связи`;
  lab.hover(r1, txt); lab.hover(r2, txt);
}
const bbLinks = [];
const linkGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
for (let i = 0; i < N - 1; i++) { const la = new THREE.Mesh(linkGeo, bbMat), lb = new THREE.Mesh(linkGeo, bbMat); DNA.add(la, lb); bbLinks.push([la, lb]); }
let unzip = 0, unzipTarget = 0, spin = true;
function rungAngle(i) { return (i / (N - 1)) * TURNS * Math.PI * 2; }
function layoutDNA() {
  for (const r of rungs) {
    const t = r.i / (N - 1); const y = t * H; const ang = rungAngle(r.i);
    const open = Math.max(0, Math.min(1, (t - (1 - unzip * 1.25)) / 0.25));
    const sep = open * 0.55;
    r.a.position.set(Math.cos(ang) * (R + sep), y, Math.sin(ang) * (R + sep));
    r.b.position.set(-Math.cos(ang) * (R + sep), y, -Math.sin(ang) * (R + sep));
    r.r1.position.copy(r.a.position); r.r1.rotation.y = -ang + Math.PI;
    r.r2.position.copy(r.b.position); r.r2.rotation.y = -ang;
  }
  for (let i = 0; i < N - 1; i++) for (const [k, arr] of [[0, strandA], [1, strandB]]) {
    const m = bbLinks[i][k]; const p = arr[i].position, q = arr[i + 1].position;
    m.position.lerpVectors(p, q, 0.5); m.scale.y = p.distanceTo(q); m.lookAt(q.clone().add(DNA.position)); m.rotateX(Math.PI / 2);
  }
}
layoutDNA();
const legend = makeLabel('А аденин · Т тимин · Г гуанин · Ц цитозин\nА–Т двумя связями, Г–Ц тремя. В РНК вместо Т — урацил (U)', { scale: 0.002 });
legend.position.set(23.9, 2.9, -3); scene.add(legend);
const dnaBoard = lab.board('Расплетите спираль и запустите транскрипцию', [22, 3.9, -3], { scale: 0.0026 });
const unzipBtn = lab.button3d('Расплести', [20.9, 0.7, -2.2], toggleUnzip, { width: 0.6 });
lab.button3d('Транскрипция', [22, 0.7, -2.2], transcribe, { width: 0.8, color: 0xef6c00 });
lab.button3d('Вращение', [23.1, 0.7, -2.2], () => { spin = !spin; }, { width: 0.6, color: 0x5c6bc0 });
lab.hud.action('Расплести / собрать', toggleUnzip, 'Двойная спираль');
lab.hud.action('Транскрипция', transcribe, 'Двойная спираль');
lab.hud.action('Вращение', () => { spin = !spin; }, 'Двойная спираль');
function toggleUnzip() { unzipTarget = unzipTarget ? 0 : 1; unzipBtn.setText(unzipTarget ? 'Собрать' : 'Расплести'); }

// Полимераза ползёт по нити A сверху вниз и строит мРНК из комплементарных букв.
let tx = null;
const polymerase = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), new THREE.MeshPhysicalMaterial({ color: 0xce93d8, transparent: true, opacity: 0.7, emissive: 0x8e24aa, emissiveIntensity: 0.8 }));
polymerase.visible = false; DNA.add(polymerase);
lab.hover(polymerase, 'РНК-полимераза\nЧитает нить и подбирает комплементарные буквы');
let mrnaGroup = null;
function transcribe() {
  if (tx) return;
  if (unzipTarget !== 1) toggleUnzip();
  if (mrnaGroup) { scene.remove(mrnaGroup); mrnaGroup = null; }
  spin = false;
  mrnaGroup = new THREE.Group(); DNA.add(mrnaGroup);
  tx = { i: N - 1, t: 0, letters: [], waitUnzip: true };
  dnaBoard.set('Полимераза ждёт, пока нить раскроется…');
}
function stepTranscribe(dt) {
  if (!tx) return;
  if (tx.waitUnzip) { if (unzip < 0.98) return; tx.waitUnzip = false; polymerase.visible = true; }
  tx.t += dt;
  const r = rungs[tx.i];
  polymerase.position.copy(r.a.position).add(new THREE.Vector3(Math.cos(rungAngle(tx.i)) * 0.35, 0, Math.sin(rungAngle(tx.i)) * 0.35));
  if (tx.t > 0.18) {
    tx.t = 0;
    const letter = RNA[r.b1];
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: BASES[letter], emissive: BASES[letter], emissiveIntensity: 0.9 }));
    const ang = rangeAngle(tx.i);
    bead.position.set(Math.cos(ang) * (R + 0.55 + 0.3), r.a.position.y, Math.sin(ang) * (R + 0.55 + 0.3));
    mrnaGroup.add(bead); tx.letters.push(letter);
    dnaBoard.set(`Транскрипция: ${r.b1} → ${letter}\nмРНК: ${tx.letters.join('')}`);
    tx.i--;
    if (tx.i < 0) {
      polymerase.visible = false;
      dnaBoard.set(`Готово: мРНК из ${N} букв уходит к рибосомам\n${tx.letters.join('')}`);
      lab.hover(mrnaGroup, 'мРНК\nКопия гена: U вместо T');
      tx = null; mrnaGroup.userData.drift = 0;
    }
  }
}
function rangeAngle(i) { return rungAngle(i); }

// ---------- Цикл ----------
lab.setFrame((dt, t) => {
  for (const m of mitos) {
    m.children[0].material.emissiveIntensity = pulse(t + m.userData.phase, 1.8, 0.4, 1.1);
    m.rotation.y += dt * 0.08;
    const pos = m.userData.sparks.geometry.attributes.position;
    m.userData.sparks.userData.parts.forEach((p, i) => {
      p.t += dt * 0.5; if (p.t > 1) { p.t = 0; p.dir.randomDirection(); }
      pos.setXYZ(i, p.dir.x * p.t * 1.4, p.dir.y * p.t * 1.4, p.dir.z * p.t * 1.4);
    });
    pos.needsUpdate = true;
    m.userData.sparks.material.opacity = 0.9;
  }
  nucleolus.material.emissiveIntensity = pulse(t, 3, 0.6, 1.2);
  for (const v of drifters) { v.position.addScaledVector(v.userData.vel, dt); if (v.position.distanceTo(CENTER) > 8.5 || v.position.y < 0.5) v.userData.vel.negate(); }
  dust.rotation.y += dt * 0.01;
  spawnTimer -= dt;
  if (spawnTimer < 0 && cargos.length < 3) { spawnCargo(); spawnTimer = 6; }
  for (let i = cargos.length - 1; i >= 0; i--) if (stepCargo(cargos[i], dt)) cargos.splice(i, 1);
  if (unzip !== unzipTarget) { unzip += Math.sign(unzipTarget - unzip) * dt * 0.35; unzip = Math.max(0, Math.min(1, unzip)); layoutDNA(); }
  if (spin) DNA.rotation.y += dt * 0.25;
  stepTranscribe(dt);
  if (mrnaGroup && mrnaGroup.userData.drift !== undefined) { mrnaGroup.userData.drift += dt; mrnaGroup.position.y += dt * 0.15; mrnaGroup.position.x += dt * 0.25; mrnaGroup.rotation.y += dt * 0.3; }
});

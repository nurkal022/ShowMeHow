import { createLab, makeLabel, placeLabel, pulse } from '../common.js';
import { REAGENTS, FLAME_SALTS, react, mixState } from './reactions.js';

const lab = createLab({
  title: 'Стол реакций',
  hint: 'Возьмите бутылку с полки и отпустите над колбой — реагент выльется. Соли из чашек подносите к пламени.',
  stations: [
    { name: 'Колба и реагенты', at: [0, 1.65, 1.7], look: [0, 1.05, -0.3] },
    { name: 'Пламя', at: [22, 1.65, 1.6], look: [22, 1.2, -0.2] },
  ],
});
const { THREE, scene } = lab;
const TABLE_Y = 0.9;

function table(x) {
  const t = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 1.4), new THREE.MeshStandardMaterial({ color: 0x1c2433, roughness: 0.7 }));
  t.position.set(x, TABLE_Y - 0.04, -0.2);
  scene.add(t);
  for (const [dx, dz] of [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.4], [1.4, 0.4]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, TABLE_Y, 8), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
    leg.position.set(x + dx, TABLE_Y / 2, dz);
    scene.add(leg);
  }
}
table(0); table(22);

// ---------- Станция 1: колба ----------
const FLASK = new THREE.Vector3(0, TABLE_Y, -0.2);
{
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = t < 0.55 ? 0.16 - t * 0.12 : 0.045;
    pts.push(new THREE.Vector2(r, t * 0.36));
  }
  const flask = new THREE.Mesh(new THREE.LatheGeometry(pts, 40),
    new THREE.MeshPhysicalMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide }));
  flask.position.copy(FLASK);
  scene.add(flask);
  lab.hover(flask, 'Колба Эрленмейера\nОтпустите бутылку над ней');
}
const liquidPts = [];
for (let i = 0; i <= 8; i++) { const t = i / 8; liquidPts.push(new THREE.Vector2(0.155 - t * 0.11 * 0.55, t * 0.2)); }
const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidPts, 40),
  new THREE.MeshStandardMaterial({ color: 0x9ecfff, transparent: true, opacity: 0.8, roughness: 0.2, emissive: 0x9ecfff, emissiveIntensity: 0.15 }));
liquid.position.copy(FLASK).add(new THREE.Vector3(0, 0.003, 0));
liquid.scale.y = 0.05;
scene.add(liquid);
const state = mixState();
const productBoard = lab.board('Полка: 8 реагентов. Что смешаем?', [0, 1.95, -0.9], { scale: 0.0026 });

// Полка и бутылки
const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
shelf.position.set(0, TABLE_Y + 0.45, -0.85);
scene.add(shelf);
const bottles = [];
REAGENTS.forEach((r, i) => {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 20),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05 }));
  glass.position.y = 0.1;
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.14, 20),
    new THREE.MeshStandardMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }));
  fill.position.y = 0.075;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x37474f }));
  cap.position.y = 0.22;
  const tag = makeLabel(r.formula, { scale: 0.0011 });
  tag.position.set(0, 0.32, 0);
  g.add(glass, fill, cap, tag);
  const home = new THREE.Vector3(-1.3 + i * 0.37, TABLE_Y + 0.47, -0.85);
  g.position.copy(home);
  g.userData.home = home;
  g.userData.reagent = r;
  scene.add(g);
  bottles.push(g);
  lab.hover(glass, `${r.name}\n${r.formula}`);
  lab.grab(g, {
    onRelease: (o) => {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      const near = Math.hypot(p.x - FLASK.x, p.z - FLASK.z) < 0.4 && p.y > TABLE_Y - 0.1 && p.y < TABLE_Y + 1.2;
      o.rotation.set(0, 0, 0);
      if (near) pour(o); else o.userData.returning = true;
    },
  });
});

// Эффекты
let pouring = null;
const drops = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(90).fill(0), 3)),
  new THREE.PointsMaterial({ color: 0x9ecfff, size: 0.02, transparent: true, opacity: 0.9 }));
drops.visible = false;
scene.add(drops);
const bubbles = [];
const foam = [];
const precip = [];
let molecule = null;
function pour(bottle) {
  bottle.position.set(FLASK.x - 0.12, FLASK.y + 0.55, FLASK.z);
  bottle.rotation.z = 1.9;
  pouring = { bottle, t: 0 };
  drops.material.color.set(bottle.userData.reagent.color);
  drops.visible = true;
}
function finishPour(bottle) {
  const out = react(state, bottle.userData.reagent.id);
  liquid.userData.targetColor = new THREE.Color(out.color);
  liquid.userData.targetVol = 0.05 + state.volume * 0.95;
  productBoard.set(`${out.title}\n${out.product}`);
  if (out.effect === 'gas') for (let i = 0; i < 60; i++) spawnBubble(i * 0.05);
  if (out.effect === 'foam') for (let i = 0; i < 70; i++) spawnFoam(i * 0.03, out.color);
  if (out.effect === 'precipitate') for (let i = 0; i < 80; i++) spawnPrecip(i * 0.02, out.color);
  showMolecule(out);
  bottle.userData.returning = true;
}
function spawnBubble(delay) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.012 + Math.random() * 0.012, 8, 6),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  b.position.set(FLASK.x + (Math.random() - 0.5) * 0.16, FLASK.y + 0.02, FLASK.z + (Math.random() - 0.5) * 0.16);
  b.userData = { delay, vy: 0.25 + Math.random() * 0.2 };
  b.visible = false;
  scene.add(b); bubbles.push(b);
}
function spawnFoam(delay, color) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 10, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.9 }));
  b.position.set(FLASK.x, FLASK.y + 0.34, FLASK.z);
  b.userData = { delay, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), life: 3.5 };
  b.visible = false;
  scene.add(b); foam.push(b);
}
function spawnPrecip(delay, color) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }));
  b.position.set(FLASK.x + (Math.random() - 0.5) * 0.2, FLASK.y + 0.18, FLASK.z + (Math.random() - 0.5) * 0.2);
  b.userData = { delay, floor: FLASK.y + 0.01 + Math.random() * 0.02 };
  b.visible = false;
  scene.add(b); precip.push(b);
}
// Молекула продукта: шарики и палочки по простой таблице
const MOLS = {
  'O₂': [['O', 0, 0, 0], ['O', 0.12, 0, 0]],
  'CO₂': [['C', 0, 0, 0], ['O', -0.13, 0, 0], ['O', 0.13, 0, 0]],
  'H₂O': [['O', 0, 0, 0], ['H', -0.09, 0.07, 0], ['H', 0.09, 0.07, 0]],
  'AgCl': [['Ag', 0, 0, 0], ['Cl', 0.15, 0, 0]],
  'NaCl': [['Na', 0, 0, 0], ['Cl', 0.15, 0, 0]],
  'Cu(OH)₂': [['Cu', 0, 0, 0], ['O', -0.13, 0.05, 0], ['H', -0.2, 0.12, 0], ['O', 0.13, 0.05, 0], ['H', 0.2, 0.12, 0]],
};
const ATOM = { O: [0xef5350, 0.045], C: [0x546e7a, 0.045], H: [0xf5f5f5, 0.03], Ag: [0xcfd8dc, 0.055], Cl: [0x66bb6a, 0.05], Na: [0xab47bc, 0.05], Cu: [0xff8a65, 0.055] };
function showMolecule(out) {
  if (molecule) { scene.remove(molecule); molecule = null; }
  const key = Object.keys(MOLS).find((k) => out.product.includes(k) && (out.product.includes('→') ? out.product.split('→')[1].includes(k) : true));
  if (!key) return;
  molecule = new THREE.Group();
  const atoms = MOLS[key];
  atoms.forEach(([el, x, y, z], i) => {
    const [color, r] = ATOM[el];
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
    m.position.set(x, y, z);
    molecule.add(m);
    if (i > 0) {
      const anchor = atoms.find((a) => a !== atoms[i] && (a[0] === 'O' || a[0] === 'C' || a[0] === 'Ag' || a[0] === 'Na' || a[0] === 'Cu')) ?? atoms[0];
      const p = new THREE.Vector3(anchor[1], anchor[2], anchor[3]), q = m.position;
      const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), new THREE.MeshStandardMaterial({ color: 0xcfd8dc }));
      bond.position.lerpVectors(p, q, 0.5); bond.scale.y = p.distanceTo(q); bond.lookAt(q); bond.rotateX(Math.PI / 2);
      molecule.add(bond);
    }
  });
  const tag = makeLabel(key, { scale: 0.0018 });
  tag.position.y = 0.16;
  molecule.add(tag);
  molecule.position.set(FLASK.x, FLASK.y + 0.75, FLASK.z);
  molecule.scale.setScalar(2);
  scene.add(molecule);
  lab.hover(molecule, `Продукт: ${key}`);
}
function empty() {
  Object.assign(state, mixState());
  liquid.userData.targetColor = new THREE.Color(0x9ecfff);
  liquid.userData.targetVol = 0.05;
  productBoard.set('Колба вылита. Что смешаем?');
  for (const arr of [bubbles, foam, precip]) { for (const b of arr) scene.remove(b); arr.length = 0; }
  if (molecule) { scene.remove(molecule); molecule = null; }
}
lab.button3d('Вылить', [1.2, TABLE_Y + 0.12, 0.35], empty, { width: 0.5, color: 0x8d6e63 });
lab.hud.action('Вылить колбу', empty);
scene.add(placeLabel(makeLabel('Попробуйте: H₂O₂ + KI, AgNO₃ + HCl, NaHCO₃ + HCl, лакмус + кислота', { scale: 0.0016 }), 0, TABLE_Y + 0.2, -0.72));

// ---------- Станция 2: пламя ----------
const BURNER = new THREE.Vector3(22, TABLE_Y, -0.3);
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0x546e7a, metalness: 0.7, roughness: 0.3 }));
  body.position.copy(BURNER).add(new THREE.Vector3(0, 0.11, 0));
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0x37474f }));
  foot.position.copy(BURNER).add(new THREE.Vector3(0, 0.015, 0));
  scene.add(body, foot);
  lab.hover(body, 'Горелка Бунзена\nПоднесите соль к пламени');
}
const FLAME_N = 160;
const flameGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(FLAME_N * 3).fill(0), 3));
const flameMat = new THREE.PointsMaterial({ color: 0x64b5f6, size: 0.05, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const flame = new THREE.Points(flameGeo, flameMat);
scene.add(flame);
const flameLight = new THREE.PointLight(0x64b5f6, 2, 3);
flameLight.position.copy(BURNER).add(new THREE.Vector3(0, 0.4, 0));
scene.add(flameLight);
const flameParts = Array.from({ length: FLAME_N }, () => ({ t: Math.random() }));
const flameColor = new THREE.Color(0x64b5f6);
let flameTarget = new THREE.Color(0x64b5f6);
const flameBoard = lab.board('Пламя без примесей — голубое', [22, 2.1, -0.9], { scale: 0.003 });
const salts = [];
FLAME_SALTS.forEach((s, i) => {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.6 }));
  const powder = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), new THREE.MeshStandardMaterial({ color: s.flame, emissive: s.flame, emissiveIntensity: 0.25 }));
  powder.scale.y = 0.4; powder.position.y = 0.025;
  const tag = makeLabel(s.formula, { scale: 0.0011 });
  tag.position.y = 0.14;
  g.add(dish, powder, tag);
  const home = new THREE.Vector3(21.1 + i * 0.45, TABLE_Y + 0.015, 0.25);
  g.position.copy(home);
  g.userData.home = home;
  scene.add(g);
  salts.push(g);
  lab.hover(dish, `${s.name}\n${s.formula}`);
  lab.grab(g, {
    onMove: (o) => {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      if (Math.hypot(p.x - BURNER.x, p.z - BURNER.z) < 0.22 && p.y > TABLE_Y + 0.15 && p.y < TABLE_Y + 0.8) ignite(s);
    },
    onRelease: (o) => { o.rotation.set(0, 0, 0); o.userData.returning = true; },
  });
});
let flameBoost = 0;
function ignite(s) {
  if (flameTarget.getHex() === new THREE.Color(s.flame).getHex()) return;
  flameTarget = new THREE.Color(s.flame);
  flameBoost = 1;
  flameBoard.set(`${s.name} (${s.formula})\nПламя ${s.note}: светятся атомы ${s.formula.replace(/Cl.*/, '')}`);
  setTimeout(() => { flameTarget = new THREE.Color(0x64b5f6); flameBoard.set('Пламя остывает — снова голубое'); }, 6000);
}

// ---------- Цикл ----------
lab.setFrame((dt, t) => {
  // Наливание
  if (pouring) {
    pouring.t += dt;
    const pos = drops.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = ((pouring.t * 1.5 + i / pos.count) % 1);
      pos.setXYZ(i, FLASK.x - 0.06 + (Math.random() - 0.5) * 0.01, FLASK.y + 0.6 - k * 0.55, FLASK.z + (Math.random() - 0.5) * 0.01);
    }
    pos.needsUpdate = true;
    if (pouring.t > 1.4) { const b = pouring.bottle; pouring = null; drops.visible = false; finishPour(b); }
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
  if (liquid.userData.targetColor) {
    liquid.material.color.lerp(liquid.userData.targetColor, Math.min(1, dt * 2));
    liquid.material.emissive.copy(liquid.material.color);
    liquid.scale.y += (liquid.userData.targetVol - liquid.scale.y) * Math.min(1, dt * 2);
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.userData.delay -= dt;
    if (b.userData.delay > 0) continue;
    b.visible = true; b.position.y += b.userData.vy * dt; b.position.x += Math.sin(t * 8 + i) * dt * 0.02;
    if (b.position.y > FLASK.y + 0.9) { scene.remove(b); bubbles.splice(i, 1); }
  }
  for (let i = foam.length - 1; i >= 0; i--) {
    const b = foam[i]; b.userData.delay -= dt;
    if (b.userData.delay > 0) continue;
    b.visible = true; b.userData.vel.y -= 1.2 * dt; b.position.addScaledVector(b.userData.vel, dt);
    if (b.position.y < TABLE_Y + 0.03) { b.position.y = TABLE_Y + 0.03; b.userData.vel.set(0, 0, 0); }
    b.scale.multiplyScalar(1 + dt * 0.25);
    b.userData.life -= dt;
    if (b.userData.life < 0) { scene.remove(b); foam.splice(i, 1); }
  }
  for (const b of precip) {
    b.userData.delay -= dt;
    if (b.userData.delay > 0) continue;
    b.visible = true;
    b.position.y = Math.max(b.userData.floor, b.position.y - 0.05 * dt);
    b.rotation.x += dt; b.rotation.y += dt * 0.7;
  }
  if (molecule) molecule.rotation.y += dt * 0.8;
  // Пламя
  flameColor.lerp(flameTarget, Math.min(1, dt * 2.5));
  flameMat.color.copy(flameColor); flameLight.color.copy(flameColor);
  flameBoost = Math.max(0, flameBoost - dt * 0.4);
  flameLight.intensity = 2 + flameBoost * 4 + pulse(t, 0.3, 0, 0.4);
  const pos = flameGeo.attributes.position;
  const h = 0.45 + flameBoost * 0.25;
  flameParts.forEach((p, i) => {
    p.t = (p.t + dt * (0.8 + (i % 7) * 0.08)) % 1;
    const r = (1 - p.t) * 0.045 * (1 + flameBoost * 0.5);
    const a = i * 2.4 + t * 3;
    pos.setXYZ(i, BURNER.x + Math.cos(a) * r + Math.sin(t * 9 + i) * 0.006, BURNER.y + 0.22 + p.t * h, BURNER.z + Math.sin(a) * r);
  });
  pos.needsUpdate = true;
});

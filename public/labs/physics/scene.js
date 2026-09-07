import { createLab, makeLabel, placeLabel } from '../common.js';
import { refract, reflect, indexFor, SPECTRUM } from './optics.js';

const lab = createLab({
  title: 'Оптический стол',
  hint: 'Призму, линзу и зеркало можно двигать по столу. Луч лазера виден в воздухе; призма раскладывает белый свет в спектр.',
  stations: [
    { name: 'Оптический стол', at: [0, 1.7, 1.9], look: [0, 0.95, -0.2] },
    { name: 'Гравитационная комната', at: [25.2, 2.0, 1.4], look: [22, 1.2, -3.5] },
  ],
});
const { THREE, scene } = lab;

// ---------- Станция 1: оптический стол ----------
const TABLE_Y = 0.9;
const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.8),
  new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.6, metalness: 0.2 }));
table.position.set(0, TABLE_Y - 0.04, -0.2);
scene.add(table);
const holes = new THREE.GridHelper(3.2, 32, 0x2f3d57, 0x2f3d57);
holes.position.set(0, TABLE_Y + 0.001, -0.2);
holes.scale.z = 1.8 / 3.2;
scene.add(holes);
for (const [x, z] of [[-1.5, -1], [1.5, -1], [-1.5, 0.6], [1.5, 0.6]]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, TABLE_Y, 8), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
  leg.position.set(x, TABLE_Y / 2, z);
  scene.add(leg);
}

// Оптические элементы: 2D-геометрия на плоскости стола в координатах (x, z).
const elements = [];
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35, roughness: 0.05,
  metalness: 0, transmission: 0.6, thickness: 0.3, emissive: 0x2a5d8f, emissiveIntensity: 0.15 });

// Лазер
const laser = new THREE.Group();
const laserBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.4, metalness: 0.6 }));
laser.add(laserBody);
const laserTip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }));
laserTip.rotation.z = Math.PI / 2; laserTip.position.x = 0.16;
laser.add(laserTip);
laser.position.set(-1.35, TABLE_Y + 0.06, -0.2);
scene.add(laser);
laser.userData.kind = 'laser';
lab.hover(laserBody, 'Лазер\nБелый луч — семь длин волн сразу');
lab.grab(laser, { onMove: clampToTable });

function clampToTable(o) {
  if (o.userData.heldBy && o.userData.heldBy !== 'mouse') {
    // В руке контроллера объект живёт в его системе координат; ограничиваем при отпускании.
    return;
  }
  o.position.y = TABLE_Y + 0.06;
  o.position.x = Math.max(-1.5, Math.min(1.5, o.position.x));
  o.position.z = Math.max(-1.0, Math.min(0.6, o.position.z));
}
function snapAfterGrab(o) { o.rotation.x = 0; o.rotation.z = 0; o.userData.heldBy = null; clampToTable(o); }

// Призма: равносторонний треугольник со стороной 0.36
{
  const s = 0.36;
  const shape = new THREE.Shape();
  const pts = [[-s / 2, s * 0.2887], [s / 2, s * 0.2887], [0, -s * 0.5774]];
  shape.moveTo(pts[0][0], pts[0][1]); shape.lineTo(pts[1][0], pts[1][1]); shape.lineTo(pts[2][0], pts[2][1]); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); geo.translate(0, 0.22, 0);
  const prism = new THREE.Mesh(geo, glassMat());
  prism.position.set(-0.3, TABLE_Y + 0.06, -0.2);
  prism.rotation.y = 0.0;
  scene.add(prism);
  prism.userData.kind = 'prism';
  prism.userData.poly = pts.map(([x, z]) => [x, z]);
  elements.push(prism);
  lab.hover(prism, 'Призма\nСиний преломляется сильнее красного — спектр');
  lab.grab(prism, { onMove: clampToTable, onRelease: snapAfterGrab });
}
// Линза: эллипс 0.36 × 0.12
{
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 16), glassMat());
  lens.scale.set(0.35, 0.8, 1);
  lens.position.set(0.55, TABLE_Y + 0.15, -0.2);
  scene.add(lens);
  lens.userData.kind = 'lens'; lens.userData.rx = 0.063; lens.userData.rz = 0.18;
  elements.push(lens);
  lab.hover(lens, 'Собирающая линза\nСводит лучи в фокус');
  lab.grab(lens, { onMove: (o) => { clampToTable(o); o.position.y = TABLE_Y + 0.15; }, onRelease: (o) => { snapAfterGrab(o); o.position.y = TABLE_Y + 0.15; } });
}
// Зеркало: отрезок длиной 0.4
{
  const mirror = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.6, roughness: 0.15, emissive: 0x90a4ae, emissiveIntensity: 0.35 }));
  glass.position.y = 0.11;
  mirror.add(glass);
  mirror.position.set(1.15, TABLE_Y + 0.06, 0.15);
  mirror.rotation.y = -Math.PI / 4;
  scene.add(mirror);
  mirror.userData.kind = 'mirror'; mirror.userData.len = 0.4;
  elements.push(mirror);
  lab.hover(glass, 'Зеркало\nУгол падения равен углу отражения');
  lab.grab(mirror, { onMove: clampToTable, onRelease: snapAfterGrab });
}
// Экран, на который ложится спектр
const screen = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 1 }));
screen.position.set(1.58, TABLE_Y + 0.25, -0.2);
scene.add(screen);
lab.hover(screen, 'Экран\nСюда ложится спектр');
const screenSeg = { kind: 'absorb', seg: [[1.57, -0.9], [1.57, 0.5]] };

let prismRot = 0;
function rotatePrism() { prismRot += Math.PI / 18; const p = elements.find((e) => e.userData.kind === 'prism'); p.rotation.y = prismRot; }
lab.hud.action('Повернуть призму', rotatePrism);
lab.button3d('Повернуть призму', [-1.0, TABLE_Y + 0.12, -1.05], rotatePrism, { width: 0.8 });

// --- Трассировка лучей на плоскости стола ---
const beamPool = [];
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
beamGeo.rotateX(Math.PI / 2);
function beam(i, a, b, color, width) {
  let m = beamPool[i];
  if (!m) {
    m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(m);
    beamPool[i] = m;
  }
  m.visible = true;
  m.material.color.set(color);
  m.position.lerpVectors(a, b, 0.5);
  m.scale.set(width, width, a.distanceTo(b));
  m.lookAt(b);
  return m;
}

function worldPoly(el) {
  const c = Math.cos(el.rotation.y), s = Math.sin(el.rotation.y);
  return el.userData.poly.map(([x, z]) => [el.position.x + x * c + z * s, el.position.z - x * s + z * c]);
}
function segHit(o, d, a, b) {
  // Пересечение луча o+t d с отрезком ab на плоскости.
  const ex = b[0] - a[0], ez = b[1] - a[1];
  const den = d[0] * ez - d[1] * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den;
  const u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
  if (t < 1e-4 || u < 0 || u > 1) return null;
  const n = [ez, -ex];
  return { t, p: [o[0] + d[0] * t, o[1] + d[1] * t], n };
}
function ellipseHit(o, d, el) {
  const rx = el.userData.rx, rz = el.userData.rz;
  const c = Math.cos(-el.rotation.y), s = Math.sin(-el.rotation.y);
  const lo = [(o[0] - el.position.x) * c - (o[1] - el.position.z) * s, (o[0] - el.position.x) * s + (o[1] - el.position.z) * c];
  const ld = [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
  const A = (ld[0] * ld[0]) / (rx * rx) + (ld[1] * ld[1]) / (rz * rz);
  const B = 2 * ((lo[0] * ld[0]) / (rx * rx) + (lo[1] * ld[1]) / (rz * rz));
  const C = (lo[0] * lo[0]) / (rx * rx) + (lo[1] * lo[1]) / (rz * rz) - 1;
  const D = B * B - 4 * A * C;
  if (D < 0) return null;
  const r1 = (-B - Math.sqrt(D)) / (2 * A), r2 = (-B + Math.sqrt(D)) / (2 * A);
  const t = r1 > 1e-4 ? r1 : r2 > 1e-4 ? r2 : null;
  if (t === null) return null;
  const lp = [lo[0] + ld[0] * t, lo[1] + ld[1] * t];
  const ln = [lp[0] / (rx * rx), lp[1] / (rz * rz)];
  const c2 = Math.cos(el.rotation.y), s2 = Math.sin(el.rotation.y);
  return { t, p: [o[0] + d[0] * t, o[1] + d[1] * t], n: [ln[0] * c2 - ln[1] * s2, ln[0] * s2 + ln[1] * c2] };
}
function nearestHit(o, d) {
  let best = null;
  const consider = (h, el) => { if (h && (!best || h.t < best.t)) best = { ...h, el }; };
  for (const el of elements) {
    if (el.userData.kind === 'prism') {
      const poly = worldPoly(el);
      for (let i = 0; i < poly.length; i++) consider(segHit(o, d, poly[i], poly[(i + 1) % poly.length]), el);
    } else if (el.userData.kind === 'lens') {
      consider(ellipseHit(o, d, el), el);
    } else if (el.userData.kind === 'mirror') {
      const c = Math.cos(el.rotation.y), s = Math.sin(el.rotation.y), L = el.userData.len / 2;
      consider(segHit(o, d, [el.position.x - s * L, el.position.z - c * L], [el.position.x + s * L, el.position.z + c * L]), el);
    }
  }
  consider(segHit(o, d, screenSeg.seg[0], screenSeg.seg[1]), screenSeg);
  // Край стола
  const edge = [[-1.6, -1.1], [1.6, -1.1], [1.6, 0.7], [-1.6, 0.7]];
  for (let i = 0; i < 4; i++) consider(segHit(o, d, edge[i], edge[(i + 1) % 4]), { userData: { kind: 'absorb' } });
  return best;
}
function trace() {
  let bi = 0;
  const y = laser.position.y;
  const o0 = [laser.position.x + Math.cos(laser.rotation.y) * 0.16, laser.position.z - Math.sin(laser.rotation.y) * 0.16];
  const d0 = [Math.cos(laser.rotation.y), -Math.sin(laser.rotation.y)];
  for (const { nm, color } of SPECTRUM) {
    let o = o0, d = d0, inside = null;
    const n = indexFor(nm);
    for (let k = 0; k < 8; k++) {
      const h = nearestHit(o, d);
      const end = h ? h.p : [o[0] + d[0] * 4, o[1] + d[1] * 4];
      beam(bi++, new THREE.Vector3(o[0], y, o[1]), new THREE.Vector3(end[0], y, end[1]), color, 0.006);
      if (!h) break;
      const kind = h.el.userData?.kind ?? h.el.kind;
      if (kind === 'absorb') { break; }
      if (kind === 'mirror') { d = reflect(d, h.n); o = h.p; continue; }
      // Стекло: входим или выходим
      const entering = inside !== h.el;
      const r = entering ? refract(d, h.n, 1, n) : refract(d, h.n, n, 1);
      if (r) { d = r; inside = entering ? h.el : null; } else { d = reflect(d, h.n); }
      o = h.p;
    }
  }
  for (let i = bi; i < beamPool.length; i++) beamPool[i].visible = false;
}
// Дым, в котором виден луч
const smoke = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
  Array.from({ length: 1200 }, (_, i) => i % 3 === 1 ? TABLE_Y + Math.random() * 0.5 : (Math.random() - 0.5) * 3.4), 3)),
  new THREE.PointsMaterial({ color: 0x8ab4f8, size: 0.02, transparent: true, opacity: 0.35 }));
smoke.position.z = -0.2;
scene.add(smoke);
scene.add(placeLabel(makeLabel('n(синий) > n(красный): sin θ₁ = n·sin θ₂', { scale: 0.0024 }), 0, TABLE_Y + 0.85, -1.2));

// ---------- Станция 2: гравитационная комната ----------
const PLANETS = [
  { name: 'Земля', g: 9.81, color: 0x42a5f5 },
  { name: 'Луна', g: 1.62, color: 0xbdbdbd },
  { name: 'Юпитер', g: 24.8, color: 0xffb74d },
];
let planet = PLANETS[0];
const gBoard = lab.board('Земля · g = 9.81 м/с²', [22, 3.4, -5], { scale: 0.0036 });
const launcher = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x546e7a, metalness: 0.5 }));
launcher.position.set(22, 1.1, 1.2);
launcher.rotation.x = -Math.PI / 4;
scene.add(launcher);
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.9, 20), new THREE.MeshStandardMaterial({ color: 0x263238 }));
base.position.set(22, 0.45, 1.2);
scene.add(base);
const balls = [];
function throwBall() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: planet.color, emissive: planet.color, emissiveIntensity: 0.5 }));
  m.position.set(22, 1.3, 1.0);
  const v = 7;
  m.userData = { vel: new THREE.Vector3(0, v * Math.SQRT1_2, -v * Math.SQRT1_2), g: planet.g, trail: [], life: 8, top: 0, start: m.position.clone() };
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: planet.color, transparent: true, opacity: 0.8 }));
  m.userData.trailMesh = trail;
  scene.add(m, trail);
  balls.push(m);
}
PLANETS.forEach((p, i) => {
  lab.button3d(p.name, [20.4, 1.0, 1.2 - i * 0.7], () => { planet = p; gBoard.set(`${p.name} · g = ${p.g} м/с²`); }, { width: 0.6, color: p.color, rotY: Math.PI / 2 });
  lab.hud.action(p.name, () => { planet = p; gBoard.set(`${p.name} · g = ${p.g} м/с²`); });
});
lab.button3d('Бросить', [20.4, 1.0, -1.1], throwBall, { width: 0.6, color: 0x43a047, rotY: Math.PI / 2 });
lab.hud.action('Бросить', throwBall);
// Стена-фон и отметки дальности
{
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshStandardMaterial({ color: 0x18213a, roughness: 0.9, emissive: 0x0f1a33, emissiveIntensity: 0.5 }));
  wall.position.set(22, 2.25, -14.5);
  scene.add(wall);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 15.6), new THREE.MeshBasicMaterial({ color: 0x8ab4f8 }));
  strip.position.set(22, 0.012, 1.0 - 7.8);
  scene.add(strip);
  const hint = makeLabel('Одинаковый бросок — разная планета.\nСравните высоту и дальность.', { scale: 0.003 });
  hint.position.set(22, 3.0, -14.4);
  scene.add(hint);
}
let demoThrown = false;
// Стена-мишень с отметками дальности
for (let d = 2; d <= 14; d += 2) {
  const mark = makeLabel(`${d} м`, { scale: 0.0016 });
  mark.position.set(22.6, 0.25, 1.0 - d);
  scene.add(mark);
  const tick = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.01, 0.03), new THREE.MeshBasicMaterial({ color: 0x8ab4f8 }));
  tick.position.set(22, 0.01, 1.0 - d);
  scene.add(tick);
}

lab.setFrame((dt, t) => {
  trace();
  if (!demoThrown && lab.hud.current?.name === 'Гравитационная комната') { demoThrown = true; setTimeout(throwBall, 700); }
  smoke.rotation.y += dt * 0.02;
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i], u = b.userData;
    u.vel.y -= u.g * dt;
    b.position.addScaledVector(u.vel, dt);
    if (b.position.y < 0.09) { b.position.y = 0.09; u.vel.y = -u.vel.y * 0.55; u.vel.multiplyScalar(0.9); }
    u.top = Math.max(u.top, b.position.y);
    u.trail.push(b.position.clone());
    if (u.trail.length > 400) u.trail.shift();
    u.trailMesh.geometry.setFromPoints(u.trail);
    u.life -= dt;
    if (u.life < 0) { scene.remove(b, u.trailMesh); balls.splice(i, 1); }
    else if (u.life < 7.5 && !u.reported && Math.abs(u.vel.y) < 0.2 && b.position.y < 0.12) {
      u.reported = true;
      const range = u.start.distanceTo(b.position);
      gBoard.set(`${planet.name} · g = ${planet.g} м/с²\nВысота ${u.top.toFixed(1)} м · дальность ${range.toFixed(1)} м`);
    }
  }
});

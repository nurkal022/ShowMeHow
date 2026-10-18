/**
 * Процедурное сердце: стенки желудочков и предсердий — деформированные сферы,
 * разрезанные по фронтальной плоскости на переднюю и заднюю половины (передняя
 * отъезжает при «разрезе»). Внутри — объёмы камер, клапаны, сосуды и частицы крови.
 * Координаты локальные: сердце ≈ 2.8 единицы в высоту, наружу масштабируется группой.
 */
import * as THREE from 'three';
import { makeLabel } from '../common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const noRay = () => {};

// Мышца снаружи и изнутри (видна на срезе).
const muscleOut = () => new THREE.MeshStandardMaterial({ color: 0xb3313b, roughness: 0.5, metalness: 0.05, emissive: 0x3a0610, emissiveIntensity: 0.6 });
const muscleIn = () => new THREE.MeshStandardMaterial({ color: 0x6e1620, roughness: 0.8, emissive: 0x2a0408, emissiveIntensity: 0.5, side: THREE.BackSide });

/** Лёгкая «органическая» неровность, одинаковая для обеих половин. */
function bumps(p) {
  return 1 + 0.03 * Math.sin(5.1 * p.x + 3.3 * p.y) * Math.sin(4.2 * p.z + 2.1 * p.y) + 0.015 * Math.sin(9 * p.y + 2 * p.x);
}

function rotZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return V(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

/** Половина деформированной сферы: front — та, что смотрит на зрителя (z ≥ 0 до деформации). */
function halfGeo(front, deform, seg = 36) {
  const geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75), front ? 0 : Math.PI, Math.PI);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const q = deform(p.clone());
    pos.setXYZ(i, q.x, q.y, q.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function shell(deform, frontGroup, backGroup, seg) {
  const out = [];
  for (const [front, grp] of [[true, frontGroup], [false, backGroup]]) {
    const geo = halfGeo(front, deform, seg);
    const a = new THREE.Mesh(geo, muscleOut());
    const b = new THREE.Mesh(geo, muscleIn());
    grp.add(a, b);
    out.push(a, b);
  }
  return out;
}

// ---------- Формы ----------
const VENT_TILT = 0.42;
const ventDeform = (p) => {
  let { x, y, z } = p;
  const s = y < 0 ? 1 - 0.62 * Math.pow(-y, 1.4) : 1 - 0.12 * y;
  x *= s; z *= s;
  const b = bumps(p);
  return rotZ(V(x * 0.9 * b, y * 1.0 * b, z * 0.74 * b), VENT_TILT).add(V(0.02, -0.38, 0));
};
const ellDeform = (c, r, tilt = 0) => (p) => {
  const b = bumps(p.clone().multiplyScalar(1.7));
  return rotZ(V(p.x * r[0] * b, p.y * r[1] * b, p.z * r[2] * b), tilt).add(c);
};

// ---------- Пути крови ----------
// Узлы: [точка, тип участка, который НАЧИНАЕТСЯ в этой точке].
// in — вена, atrium — предсердие, vent — желудочек, out — артерия.
const PATHS = [
  { kind: 'ven', pts: [
    [-0.62, 1.7, 0.05, 'in'], [-0.62, 1.2, 0.08], [-0.6, 0.78, 0.1, 'atrium'], [-0.62, 0.45, 0.14],
    [-0.45, 0.08, 0.2, 'vent'], [-0.33, -0.3, 0.22], [-0.16, -0.58, 0.24], [0.0, -0.18, 0.3],
    [0.12, 0.28, 0.38, 'out'], [0.2, 0.72, 0.38], [0.25, 1.03, 0.24], [0.62, 1.12, 0.0], [1.25, 1.1, -0.25]] },
  { kind: 'ven', pts: [
    [-0.5, -1.25, -0.18, 'in'], [-0.55, -0.6, -0.06], [-0.6, -0.02, 0.04, 'atrium'], [-0.66, 0.36, 0.1],
    [-0.45, 0.08, 0.2, 'vent'], [-0.3, -0.36, 0.2], [-0.12, -0.5, 0.26], [0.02, -0.12, 0.32],
    [0.12, 0.28, 0.38, 'out'], [0.2, 0.72, 0.38], [0.25, 1.03, 0.24], [0.02, 1.08, -0.25], [-0.6, 1.08, -0.38], [-1.25, 1.05, -0.42]] },
  { kind: 'art', pts: [
    [1.38, 0.82, -0.62, 'in'], [0.88, 0.72, -0.52], [0.5, 0.64, -0.38, 'atrium'], [0.3, 0.52, -0.3],
    [0.3, 0.12, -0.22, 'vent'], [0.3, -0.4, -0.12], [0.42, -0.88, -0.06], [0.12, -0.4, 0.0],
    [-0.05, 0.25, 0.02, 'out'], [-0.1, 0.75, 0.05], [-0.06, 1.25, 0.02], [0.18, 1.52, -0.18], [0.48, 1.36, -0.46],
    [0.56, 0.9, -0.64], [0.56, 0.0, -0.74], [0.56, -1.1, -0.74]] },
  { kind: 'art', pts: [
    [-1.32, 0.78, -0.72, 'in'], [-0.78, 0.7, -0.62], [0.05, 0.64, -0.46, 'atrium'], [0.32, 0.5, -0.28],
    [0.3, 0.12, -0.22, 'vent'], [0.26, -0.48, -0.14], [0.36, -0.8, -0.04], [0.1, -0.32, 0.02],
    [-0.05, 0.25, 0.02, 'out'], [-0.1, 0.75, 0.05], [-0.06, 1.25, 0.02], [0.18, 1.52, -0.18], [0.48, 1.36, -0.46],
    [0.56, 0.9, -0.64], [0.56, 0.0, -0.74], [0.56, -1.1, -0.74]] },
];

const VEN = new THREE.Color(0x3d7bff), ART = new THREE.Color(0xff3640);

export function buildHeart(lab) {
  const root = new THREE.Group();
  const front = new THREE.Group();   // передние половины стенок + коронарные сосуды
  const back = new THREE.Group();
  const inner = new THREE.Group();   // камеры, клапаны, перегородка
  root.add(front, back, inner);
  inner.visible = false;

  // Стенки: желудочки, правое и левое предсердия, ушки.
  const ventWalls = new THREE.Group(), raWalls = new THREE.Group(), laWalls = new THREE.Group();
  const ventF = new THREE.Group(), raF = new THREE.Group(), laF = new THREE.Group();
  back.add(ventWalls, raWalls, laWalls); front.add(ventF, raF, laF);
  const walls = [
    ...shell(ventDeform, ventF, ventWalls, 44),
    ...shell(ellDeform(V(-0.6, 0.5, 0.1), [0.36, 0.34, 0.32], -0.2), raF, raWalls, 28),
    ...shell(ellDeform(V(0.32, 0.6, -0.32), [0.4, 0.27, 0.3], 0.1), laF, laWalls, 28),
  ];
  // Ушки предсердий — только спереди, отъезжают вместе с передней стенкой.
  for (const [c, r, t] of [[V(-0.3, 0.72, 0.36), [0.2, 0.12, 0.12], 0.5], [V(0.62, 0.52, 0.12), [0.18, 0.11, 0.11], -0.6]]) {
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const m = new THREE.Mesh(geo, muscleOut());
    m.scale.set(...r); m.position.copy(c); m.rotation.z = t;
    (c.x < 0 ? raF : laF).add(m);
    walls.push(m);
  }
  // Межжелудочковая перегородка.
  const septum = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshStandardMaterial({ color: 0x8e1f2a, roughness: 0.7, emissive: 0x2a0408 }));
  septum.scale.set(0.07, 0.62, 0.3); septum.position.set(0.0, -0.36, 0.02); septum.rotation.z = VENT_TILT;
  back.add(septum);

  // Коронарные артерии и вены на передней поверхности.
  const coronary = (pts, color, r) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 6),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 }));
    ventF.add(m); walls.push(m);
  };
  const onVent = (theta, az, k = 1.03) => ventDeform(V(Math.sin(theta) * Math.sin(az), Math.cos(theta), Math.sin(theta) * Math.cos(az)).multiplyScalar(k));
  coronary(Array.from({ length: 12 }, (_, i) => onVent(0.45 + i * 0.21, 0.28 - i * 0.015)), 0xe0453a, 0.03);          // ПМЖВ
  coronary(Array.from({ length: 10 }, (_, i) => onVent(0.9 + i * 0.15, 0.85 + i * 0.03)), 0xe0453a, 0.02);            // диагональная
  coronary(Array.from({ length: 12 }, (_, i) => onVent(0.6 + i * 0.03, -1.4 + i * 0.12)), 0xe0453a, 0.026);           // правая коронарная
  coronary(Array.from({ length: 12 }, (_, i) => onVent(0.5 + i * 0.2, 0.05 - i * 0.02, 1.04)), 0x5168b8, 0.018);      // большая вена

  // ---------- Пути и сосуды ----------
  const paths = PATHS.map((p) => {
    const pts = p.pts.map((a) => V(a[0], a[1], a[2]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    // u-границы участков по длине ломаной.
    let acc = 0; const us = [0];
    for (let i = 1; i < pts.length; i++) { acc += pts[i].distanceTo(pts[i - 1]); us.push(acc); }
    const marks = {};
    p.pts.forEach((a, i) => { if (a[3]) marks[a[3]] = us[i] / acc; });
    return { kind: p.kind, curve, len, marks };
  });

  const vessels = [];
  const vessel = (path, u0, u1, r, color, label) => {
    const pts = []; for (let i = 0; i <= 16; i++) pts.push(path.curve.getPointAt(u0 + (u1 - u0) * (i / 16)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 14, false),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35, transparent: true, opacity: 0.5, depthWrite: false }));
    root.add(m); vessels.push(m);
    if (label) lab.hover(m, label);
    return m;
  };
  const [pA, pB, pC, pD] = paths;
  vessel(pA, 0, pA.marks.atrium + 0.02, 0.12, 0x3f63d6, 'Верхняя полая вена\nНесёт венозную кровь от головы и рук в правое предсердие');
  vessel(pB, 0, pB.marks.atrium + 0.02, 0.13, 0x3f63d6, 'Нижняя полая вена\nВенозная кровь от ног и внутренних органов');
  vessel(pA, pA.marks.out - 0.02, 1, 0.12, 0x4a6fe0, 'Лёгочный ствол → левая лёгочная артерия\nВенозная кровь из правого желудочка идёт в лёгкие');
  vessel(pB, 0.72, 1, 0.1, 0x4a6fe0, 'Правая лёгочная артерия\nПроходит под дугой аорты к правому лёгкому');
  vessel(pC, 0, pC.marks.atrium + 0.02, 0.075, 0xd8434c, 'Лёгочные вены (левые)\nНесут насыщенную кислородом кровь из лёгких');
  vessel(pD, 0, pD.marks.atrium + 0.02, 0.075, 0xd8434c, 'Лёгочные вены (правые)\nАртериальная кровь в левое предсердие');
  const aorta = vessel(pC, pC.marks.out - 0.02, 1, 0.14, 0xd8434c, 'Аорта\nСамая крупная артерия: из левого желудочка в большой круг');
  // Ветви дуги аорты.
  const arch = pC.curve.getPointAt(pC.marks.out + (1 - pC.marks.out) * 0.3);
  [[-0.12, 0.06], [0.02, 0.03], [0.14, -0.04]].forEach(([dx, dz], i) => {
    const a = arch.clone().add(V(dx + i * 0.04, 0, dz - i * 0.06));
    const c = new THREE.CatmullRomCurve3([a, a.clone().add(V(dx * 0.6, 0.25, 0)), a.clone().add(V(dx, 0.5, 0))]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.05, 8), aorta.material);
    root.add(m);
  });

  // ---------- Камеры (объёмы крови) ----------
  const chambers = [];
  const chamber = (name, text, c, r, tilt, color, lo) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.55, transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.3 }));
    m.position.copy(c); m.scale.set(...r); m.rotation.z = tilt; m.userData.base = r;
    inner.add(m); chambers.push(m);
    lab.hover(m, `${name}\n${text}`);
    const lbl = makeLabel(name, { scale: 0.0017 });
    lbl.position.copy(c).add(lo);
    lbl.visible = false; lbl.raycast = noRay;
    inner.add(lbl);
    m.userData.label = lbl;
    return m;
  };
  const RA = chamber('Правое предсердие', 'Собирает венозную кровь из полых вен', V(-0.6, 0.48, 0.12), [0.28, 0.26, 0.24], -0.2, 0x3d6dff, V(-0.35, 0.2, 0.45));
  const LA = chamber('Левое предсердие', 'Принимает из лёгочных вен кровь, богатую O₂', V(0.32, 0.58, -0.3), [0.3, 0.2, 0.22], 0.1, 0xff3d4a, V(0.4, 0.2, 0.75));
  const RV = chamber('Правый желудочек', 'Качает кровь в лёгкие — малый круг.\nСтенка тонкая: давление ≈ 25 мм рт. ст.', V(-0.3, -0.3, 0.2), [0.26, 0.42, 0.2], VENT_TILT, 0x3d6dff, V(-0.45, -0.25, 0.45));
  const LV = chamber('Левый желудочек', 'Главный насос большого круга.\nСтенка толще всех: давление ≈ 120 мм рт. ст.', V(0.26, -0.44, -0.1), [0.25, 0.52, 0.24], VENT_TILT, 0xff3d4a, V(0.55, -0.35, 0.75));

  // ---------- Клапаны ----------
  const valves = [];
  const valve = (name, text, at, from, to, r, kind) => {
    const g = new THREE.Group();
    g.position.copy(at);
    g.quaternion.setFromUnitVectors(V(0, 0, 1), to.clone().sub(from).normalize());
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xf5e6c8, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.13, 8, 28), ringMat);
    g.add(ring);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xf2d3c4, emissive: 0x6b3a30, emissiveIntensity: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.92, roughness: 0.5 });
    const hinges = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.rotation.z = a;
      pivot.position.set(0.5 * r * Math.cos(a), 0.5 * r * Math.sin(a), 0);
      const hinge = new THREE.Group();
      const h = r * Math.sin(Math.PI / 3);
      const geo = new THREE.BufferGeometry().setFromPoints([V(0, -h, 0), V(0, h, 0), V(-0.5 * r, 0, 0)]);
      geo.computeVertexNormals();
      hinge.add(new THREE.Mesh(geo, leafMat));
      pivot.add(hinge); g.add(pivot); hinges.push(hinge);
    }
    // Невидимая «шайба» — чтобы лучу было куда попасть.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.08, 16), new THREE.MeshBasicMaterial({ visible: false }));
    hit.rotation.x = Math.PI / 2;
    g.add(hit);
    inner.add(g);
    lab.hover(g, `${name}\n${text}`);
    const v = { g, ring, hinges, kind, open: 0 };
    valves.push(v);
    return v;
  };
  const ptA = (p, i) => V(...PATHS[p].pts[i].slice(0, 3));
  valve('Трёхстворчатый клапан', 'Между правым предсердием и желудочком.\nЗакрывается в начале систолы — первый тон «лаб»', ptA(0, 4), ptA(0, 3), ptA(0, 5), 0.17, 'av');
  valve('Митральный клапан', 'Две створки между левым предсердием и желудочком.\nНе пускает кровь назад в лёгкие', ptA(2, 4), ptA(2, 3), ptA(2, 5), 0.17, 'av');
  valve('Клапан лёгочного ствола', 'Три полулунные створки. Открыт только в систолу желудочков', ptA(0, 8), ptA(0, 7), ptA(0, 9), 0.12, 'sl');
  valve('Аортальный клапан', 'Три полулунные створки. Захлопывается в начале диастолы — второй тон «даб»', ptA(2, 8), ptA(2, 7), ptA(2, 9), 0.13, 'sl');

  // ---------- Частицы крови ----------
  const PER = 80;
  const N = PER * paths.length;
  const dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.034, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  dots.frustumCulled = false;
  dots.raycast = noRay;
  root.add(dots);
  const parts = [];
  paths.forEach((path, pi) => {
    for (let i = 0; i < PER; i++) {
      parts.push({ path, u: i / PER + Math.random() * 0.01, off: new THREE.Vector3().randomDirection().multiplyScalar(Math.random()), shade: 0.75 + Math.random() * 0.35 });
      const c = (path.kind === 'ven' ? VEN : ART).clone().multiplyScalar(0.75 + Math.random() * 0.4);
      dots.setColorAt(pi * PER + i, c);
    }
  });
  dots.instanceColor.needsUpdate = true;

  // ---------- Подсветка изнутри ----------
  const glow = new THREE.PointLight(0xff4a5a, 0.0, 6, 1.5);
  glow.position.set(0, 0.2, 1.4);
  root.add(glow);

  // Стенкам — без лучей в момент, когда передняя половина открыта.
  const frontMeshes = [];
  front.traverse((o) => { if (o.isMesh) frontMeshes.push(o); });
  // Чтобы при наведении на стенку подписью было «сердце», а не отдельная сетка, ничего не регистрируем.

  let cut = 0, cutTarget = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  function speedFor(seg, st) {
    switch (seg) {
      case 'in': return st.phase === 'ventricular' ? 0.45 : 0.75;
      case 'atrium': return st.avOpen ? (st.phase === 'atrial' ? 2.4 : 0.9) : 0.12;
      case 'vent': return st.slOpen ? 0.7 + 2.6 * st.vent : (st.avOpen ? 0.22 : 0.05);
      default: return st.slOpen ? 2.6 : 0.35;
    }
  }

  return {
    root, chambers, valves, walls,
    setCut(on) { cutTarget = on ? 1 : 0; },
    get cutOpen() { return cutTarget === 1; },
    update(dt, st, bpm) {
      // Разрез.
      if (cut !== cutTarget) {
        cut += Math.sign(cutTarget - cut) * dt * 1.6;
        cut = Math.max(0, Math.min(1, cut));
        const e = cut * cut * (3 - 2 * cut);
        // Передняя стенка отъезжает влево и разворачивается внутренней стороной к зрителю.
        front.position.set(-e * 1.6, e * 0.1, e * 0.6);
        front.rotation.y = -e * 1.1;
        const op = 1 - 0.55 * e;
        inner.visible = cut > 0.05;
        for (const m of frontMeshes) {
          const tr = op < 0.999;
          if (m.material.transparent !== tr) { m.material.transparent = tr; m.material.needsUpdate = true; }
          m.material.opacity = op;
          m.material.depthWrite = op > 0.6;
          m.raycast = cut > 0.5 ? noRay : THREE.Mesh.prototype.raycast;
        }
        for (const c of chambers) c.userData.label.visible = cut > 0.8;
      }

      // Сокращение: стенки чуть, объёмы камер — заметно.
      const sv = 1 - 0.07 * st.vent, sa = 1 - 0.11 * st.atria;
      ventWalls.scale.set(sv, 1 - 0.035 * st.vent, sv); ventF.scale.copy(ventWalls.scale);
      for (const g of [raWalls, raF, laWalls, laF]) g.scale.set(sa, sa, sa);
      for (const [c, k] of [[RV, st.vent], [LV, st.vent], [RA, st.atria], [LA, st.atria]]) {
        const b = c.userData.base, f = 1 - 0.32 * k;
        c.scale.set(b[0] * f, b[1] * (1 - 0.18 * k), b[2] * f);
        c.material.emissiveIntensity = 0.45 + 0.9 * k;
      }
      // Пульсирующие стенки сосудов (артерии раздуваются в систолу).
      glow.intensity = 0.4 + 2.2 * st.vent + 0.8 * st.atria;

      // Клапаны.
      for (const v of valves) {
        const target = (v.kind === 'av' ? st.avOpen : st.slOpen) ? 1 : 0;
        v.open += (target - v.open) * Math.min(1, dt * 22);
        for (const h of v.hinges) h.rotation.y = v.open * 1.25;
        v.ring.material.emissive.setHex(target ? 0x5bd68a : 0xff6b6b);
        v.ring.material.emissiveIntensity = 0.5 + 0.5 * v.open;
      }

      // Частицы.
      const base = 0.55 * (bpm / 70);
      parts.forEach((pt, i) => {
        const { marks } = pt.path;
        const seg = pt.u < marks.atrium ? 'in' : pt.u < marks.vent ? 'atrium' : pt.u < marks.out ? 'vent' : 'out';
        pt.u += (base * speedFor(seg, st) * dt) / pt.path.len;
        if (pt.u >= 1) pt.u -= 1;
        pt.path.curve.getPointAt(Math.min(pt.u, 0.999), p);
        const amp = seg === 'atrium' || seg === 'vent' ? 0.15 : 0.065;
        p.addScaledVector(pt.off, amp);
        s.setScalar(pt.shade);
        m4.compose(p, q, s);
        dots.setMatrixAt(i, m4);
      });
      dots.instanceMatrix.needsUpdate = true;
    },
  };
}

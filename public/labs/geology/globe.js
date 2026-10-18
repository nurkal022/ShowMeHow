/**
 * Станция 1: глобус метрового диаметра с вынимаемой «долькой». Внутри — слои
 * в пропорциях настоящей Земли (кора утолщена, иначе её не видно), подписи
 * глубины и температуры, конвекционные ячейки мантии из частиц.
 */
import { makeLabel } from '../common.js';
import { fbm3, softDot } from './noise.js';

const R = 0.5;
// Доли радиуса Земли (6371 км). Кора в жизни 5–70 км — тут утолщена для наглядности.
const LAYERS = [
  { r0: 0.95, r1: 1.0, color: 0x9a7552, ei: 0.05 },
  { r0: 0.88, r1: 0.95, color: 0xe2793a, ei: 0.25 },
  { r0: 0.546, r1: 0.88, color: 0xc0451f, ei: 0.22 },
  { r0: 0.19, r1: 0.546, color: 0xf6a531, ei: 0.45 },
  { r0: 0, r1: 0.19, color: 0xfff2c4, ei: 1.0 },
];
const LABELS = [
  { text: 'Земная кора · 5–70 км\nдо 1000 °C (утолщена)', r: 0.975, a: 0.95 },
  { text: 'Верхняя мантия · до 660 км\n1000–1900 °C', r: 0.915, a: 0.5 },
  { text: 'Нижняя мантия · до 2900 км\n1900–3700 °C, течёт медленно', r: 0.72, a: 0.12 },
  { text: 'Внешнее ядро · до 5150 км\nжидкое железо, 4000–5000 °C', r: 0.38, a: -0.35 },
  { text: 'Внутреннее ядро · 6371 км\nтвёрдое, ≈ 5400 °C', r: 0.09, a: -0.6 },
];

function earthTexture(THREE) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
      const n = fbm3(px * 1.7 + 5, py * 1.7 + 1, pz * 1.7 + 9, 5);
      const m = fbm3(px * 4 + 2, py * 4, pz * 4, 3);
      let r, gg, b;
      if (n > 0.53) {
        const dry = Math.min(1, Math.max(0, (m - 0.45) * 3 + (0.35 - Math.abs(lat)) * 1.2));
        r = 70 + 110 * dry; gg = 110 + 40 * dry; b = 55 + 30 * dry;
        if (n > 0.62) { r = 120; gg = 105; b = 90; }
      } else {
        const d = Math.min(1, (0.53 - n) * 6);
        r = 20 + 20 * (1 - d); gg = 70 + 60 * (1 - d); b = 140 + 40 * (1 - d);
      }
      if (Math.abs(lat) > 1.2 + (m - 0.5) * 0.4) { r = 235; gg = 242; b = 250; }
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildGlobe(lab, origin, stationName) {
  const { THREE, scene } = lab;
  const home = new THREE.Vector3(origin[0], 1.35, origin[2]);

  // Подставка
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b3446, metalness: 0.6, roughness: 0.35 });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 0.82, 24), metal);
  stand.position.set(origin[0], 0.41, origin[2]);
  scene.add(stand);
  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x8ab4f8, emissive: 0x1a73e8, emissiveIntensity: 0.6 }));
  cradle.rotation.x = Math.PI / 2;
  cradle.position.set(origin[0], 0.83, origin[2]);
  scene.add(cradle);

  const earthMat = new THREE.MeshStandardMaterial({ map: earthTexture(THREE), roughness: 0.75, metalness: 0.05 });
  for (const L of LAYERS) {
    L.mat = new THREE.MeshStandardMaterial({ color: L.color, emissive: L.color, emissiveIntensity: L.ei, roughness: 0.8, side: THREE.DoubleSide });
  }

  function shell(phiStart, phiLen) {
    const g = new THREE.SphereGeometry(R, Math.max(8, Math.round(64 * phiLen / (Math.PI * 2))), 40, phiStart, phiLen);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (phiStart + uv.getX(i) * phiLen) / (Math.PI * 2));
    return new THREE.Mesh(g, earthMat);
  }
  function face(phi) {
    const grp = new THREE.Group();
    for (const L of LAYERS) {
      const geo = L.r0 === 0
        ? new THREE.CircleGeometry(L.r1 * R, 40, -Math.PI / 2, Math.PI)
        : new THREE.RingGeometry(L.r0 * R, L.r1 * R, 48, 1, -Math.PI / 2, Math.PI);
      grp.add(new THREE.Mesh(geo, L.mat));
    }
    grp.rotation.y = phi + Math.PI; // локальная +x смотрит туда же, куда точка сферы с долготой phi
    return grp;
  }
  function wedge(phiStart, phiLen) {
    const g = new THREE.Group();
    g.add(shell(phiStart, phiLen), face(phiStart), face(phiStart + phiLen));
    return g;
  }

  const globe = new THREE.Group();
  globe.position.copy(home);
  scene.add(globe);
  // Долька смотрит на зрителя (+z): долготы от π/4 до 3π/4.
  const body = wedge((3 * Math.PI) / 4, (3 * Math.PI) / 2);
  const lid = wedge(Math.PI / 4, Math.PI / 2);
  globe.add(body, lid);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x4fa3ff, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }));
  globe.add(atmo);

  // Подписи слоёв справа, с выносками к правой грани разреза (долгота 3π/4).
  const dR = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
  const labels = [];
  LABELS.forEach((L, i) => {
    const s = makeLabel(L.text, { scale: 0.00118 });
    s.center.set(0, 0.5);
    const at = new THREE.Vector3(0.62, 0.46 - i * 0.23, 0.42);
    s.position.copy(at);
    s.material.opacity = 0;
    const p = dR.clone().multiplyScalar(L.r * R * Math.cos(L.a)).add(new THREE.Vector3(0, L.r * R * Math.sin(L.a), 0));
    p.addScaledVector(new THREE.Vector3(-Math.SQRT1_2, 0, Math.SQRT1_2), 0.004);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, at]),
      new THREE.LineBasicMaterial({ color: 0xeef2f7, transparent: true, opacity: 0, depthTest: false }));
    line.renderOrder = 998;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false }));
    dot.position.copy(p);
    dot.renderOrder = 998;
    globe.add(s, line, dot);
    labels.push(s.material, line.material, dot.material);
  });

  // Конвекция мантии: на обеих гранях выреза по четыре ячейки, соседние крутятся навстречу.
  const FACES = [Math.PI / 4, (3 * Math.PI) / 4].map((phi) => {
    const d = new THREE.Vector3(-Math.cos(phi), 0, Math.sin(phi));
    const n = new THREE.Vector3(0, 0, 1).addScaledVector(d, -d.z).normalize(); // нормаль внутрь выреза
    return { d, n };
  });
  const CELLS = 4, PER = 70, N = FACES.length * CELLS * PER;
  const parts = [];
  for (let f = 0; f < FACES.length; f++) for (let k = 0; k < CELLS; k++) for (let i = 0; i < PER; i++) {
    parts.push({ f, ac: (-67.5 + 45 * k) * Math.PI / 180, dir: k % 2 ? -1 : 1, t: Math.random() * Math.PI * 2,
      sp: 0.35 + Math.random() * 0.25, jr: (Math.random() - 0.5) * 0.09, ja: (Math.random() - 0.5) * 0.12 });
  }
  const pPos = new Float32Array(N * 3), pCol = new Float32Array(N * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.022, map: softDot(THREE), vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const convection = new THREE.Points(pGeo, pMat);
  convection.frustumCulled = false;
  body.add(convection);
  const hot = new THREE.Color(0xffe27a), cold = new THREE.Color(0x8a1d0c), tmpC = new THREE.Color();
  const rc = 0.72 * R, ar = 0.13 * R, aw = 0.33;

  function updateConvection(dt) {
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      p.t += dt * p.sp;
      const r = rc + (ar + p.jr * R) * Math.sin(p.t);
      const a = p.ac + (aw + p.ja) * Math.cos(p.t) * p.dir;
      const F = FACES[p.f];
      const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      pPos[i * 3] = F.d.x * ca + F.n.x * 0.006;
      pPos[i * 3 + 1] = sa;
      pPos[i * 3 + 2] = F.d.z * ca + F.n.z * 0.006;
      // Поднимается (r растёт) — горячее, опускается — остывает.
      tmpC.copy(cold).lerp(hot, 0.5 + 0.5 * Math.cos(p.t));
      pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // Открытие разреза
  let open = false, k = 0, returning = false, align = false;
  const lidOut = new THREE.Vector3(-0.92, -0.08, 0.18);
  const board = lab.board('Недра Земли · радиус 6371 км', [origin[0], 2.25, origin[2] - 0.35], { scale: 0.0026 });
  function toggle() {
    open = !open;
    align = open;
    btn.setText(open ? 'Закрыть разрез' : 'Открыть разрез');
    hudBtn.textContent = open ? 'Закрыть разрез' : 'Открыть разрез';
    board.set(open ? 'Разрез: глубже — горячее и плотнее\nМантия медленно перемешивается (конвекция)' : 'Недра Земли · радиус 6371 км');
  }
  const btn = lab.button3d('Открыть разрез', [origin[0] - 0.5, 0.95, origin[2] + 0.62], toggle, { width: 0.62, color: 0xe2793a, rotY: 0.35 });
  const hudBtn = lab.hud.action('Открыть разрез', toggle, stationName);

  lab.hover(globe, () => (open
    ? 'Разрез Земли\nПотяните мышью — повернуть'
    : 'Земля · радиус 6371 км\nПотяните — повернуть; «Открыть разрез» — заглянуть внутрь'));
  lab.grab(globe, {
    onGrab(o) { align = false; o.userData.rot0 = o.rotation.y; o.userData.x0 = null; returning = false; },
    onMove(o) {
      if (o.userData.heldBy !== 'mouse') return;
      if (o.userData.x0 === null) o.userData.x0 = o.position.x;
      o.rotation.y = o.userData.rot0 + (o.position.x - o.userData.x0) * 4;
      o.position.copy(home);
    },
    onRelease() { returning = true; },
  });

  return function update(dt, t) {
    const target = open ? 1 : 0;
    k += Math.sign(target - k) * Math.min(Math.abs(target - k), dt / 1.3);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    lid.position.copy(lidOut).multiplyScalar(e);
    lid.rotation.y = (-3 * Math.PI / 4) * e;
    lid.rotation.z = 0.25 * e;
    const fade = Math.max(0, (e - 0.55) / 0.45);
    for (const m of labels) m.opacity = fade;
    pMat.opacity = e * 0.95;
    convection.visible = e > 0.02;
    if (convection.visible) updateConvection(dt);
    LAYERS[4].mat.emissiveIntensity = 0.85 + 0.25 * Math.sin(t * 2.2);
    if (!open && !globe.userData.heldBy) globe.rotation.y += dt * 0.08;
    if (align) {
      const goal = Math.round(globe.rotation.y / (Math.PI * 2)) * Math.PI * 2;
      globe.rotation.y += (goal - globe.rotation.y) * (1 - Math.exp(-dt * 4));
    }
    if (returning && !globe.userData.heldBy) {
      const a = 1 - Math.exp(-dt * 5);
      globe.position.lerp(home, a);
      globe.rotation.x += (0 - globe.rotation.x) * a;
      globe.rotation.z += (0 - globe.rotation.z) * a;
      if (globe.position.distanceTo(home) < 0.002) { globe.position.copy(home); returning = false; }
    }
  };
}

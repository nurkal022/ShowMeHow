/**
 * Станция 2: блок земной коры из двух плит. Рычаг задаёт движение плит —
 * схождение (растут горы), расхождение (раскрывается рифт с лавой) или сдвиг
 * (напряжение срывается землетрясением). Толчки пишет барабанный сейсмограф.
 */
import { makeLabel, tr } from '../common.js';
import { fbm2, softDot } from './noise.js';

const W = 2.4, D = 1.3, NX = 84, NZ = 44;
const TY = 0.8;          // крышка стола
const BASE = TY + 0.3;   // средний уровень поверхности
const MODES = {
  divergent: { angle: -0.55, name: tr('Расхождение', 'Алшақтау', 'Divergent'),
    text: tr('Расхождение плит\nРифт раскрывается, снизу поднимается магма\n(Исландия, Восточно-Африканский рифт)', 'Плиталардың алшақтауы\nРифт ашылады, астынан магма көтеріледі\n(Исландия, Шығыс Африка рифті)', 'Divergent plates\nA rift opens and magma rises from below\n(Iceland, East African Rift)') },
  transform: { angle: 0, name: tr('Сдвиг', 'Ығысу', 'Transform'),
    text: tr('Трансформный сдвиг\nПлиты скользят вдоль разлома, напряжение\nсрывается толчком (разлом Сан-Андреас)', 'Трансформды ығысу\nПлиталар жарылым бойымен сырғиды, кернеу\nсілкініспен босайды (Сан-Андреас жарылымы)', 'Transform fault\nPlates slide along the fault; stress\nis released as a quake (San Andreas Fault)') },
  convergent: { angle: 0.55, name: tr('Схождение', 'Жақындасу', 'Convergent'),
    text: tr('Схождение плит\nКора сминается в складки — растут горы\n(Гималаи, Альпы, Тянь-Шань)', 'Плиталардың жақындасуы\nҚыртыс қатпарланады — таулар өседі\n(Гималай, Альпі, Тянь-Шань)', 'Convergent plates\nThe crust crumples into folds — mountains rise\n(Himalayas, Alps, Tian Shan)') },
};

export function buildTectonics(lab, O, stationName) {
  const { THREE, scene } = lab;
  const root = new THREE.Group();
  root.position.set(O[0], 0, O[2]);
  scene.add(root);
  const CZ = -0.5; // центр блока по z (локально)
  const block = new THREE.Group();
  block.position.z = CZ;
  root.add(block);

  // Стол
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2433, roughness: 0.7, metalness: 0.3 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.36, 0.06, D + 0.36), dark);
  top.position.set(0, TY - 0.03, CZ);
  root.add(top);
  for (const [x, z] of [[-1.3, -0.75], [1.3, -0.75], [-1.3, 0.75], [1.3, 0.75]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, TY - 0.06, 0.06), dark);
    leg.position.set(x, (TY - 0.06) / 2, CZ + z);
    root.add(leg);
  }

  // ---- Состояние ----
  let mode = 'convergent';
  let mtn = 0.45, rift = 0;
  const offX = [0, 0], offZ = [0, 0];
  let slip = 0, slipLeft = 0;      // сдвиг при толчке, отдаётся плавно
  let stress = 0, shake = 0, seis = 0;
  const quakes = [];

  // ---- Рельеф ----
  const geo = new THREE.PlaneGeometry(W, D, NX, NZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const nV = pos.count;
  const gx = new Float32Array(nV), gz = new Float32Array(nV);
  for (let i = 0; i < nV; i++) { gx[i] = pos.getX(i); gz[i] = pos.getZ(i); }
  const col = new Float32Array(nV * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
  block.add(terrain);

  const C = {
    grass: new THREE.Color(0x4f8a3a), grass2: new THREE.Color(0x77984a), soil: new THREE.Color(0x8a6a45),
    rock: new THREE.Color(0x7d7872), snow: new THREE.Color(0xf2f5fa), basalt: new THREE.Color(0x2b2523),
    hotrock: new THREE.Color(0x8a2a12), road: new THREE.Color(0x2f3136), river: new THREE.Color(0x3d8fd6),
  };
  const tc = new THREE.Color();
  const wrapD = (z) => z - D * Math.floor(z / D + 0.5);

  function height(x, z, side) {
    const px = x - offX[side], pz = z - offZ[side];
    const gr = Math.exp(-(x * x) / 0.018);
    let h = (fbm2(px * 1.7 + 3.1, pz * 1.7 + 7.3, 3) - 0.5) * 0.14 * (1 - rift * gr);
    if (mtn > 0.001) h += mtn * Math.exp(-(x * x) / 0.06) * (0.2 + 0.2 * fbm2(x * 4 + 13, z * 5 + 2, 3));
    if (rift > 0.001) {
      h -= rift * 0.2 * gr;
      const sh = Math.abs(x) - 0.32;
      h += rift * 0.05 * Math.exp(-(sh * sh) / 0.012);
    }
    for (const q of quakes) {
      const dx = x - q.x, dz = z - q.z;
      const ph = Math.sqrt(dx * dx + dz * dz) - q.t * 0.9;
      if (ph > -0.3 && ph < 0.3) h += q.A * Math.exp(-(ph * ph) / 0.012) * Math.cos(ph * 38) * Math.exp(-q.t * 0.7);
    }
    return h;
  }

  function colorAt(h, x, z, side, out) {
    const pz = z - offZ[side];
    const gr = Math.exp(-(x * x) / 0.018);
    if (h > 0.27) out.copy(C.snow);
    else if (h > 0.16) out.copy(C.rock).lerp(C.snow, Math.max(0, (h - 0.22) / 0.05));
    else if (h > 0.07) out.copy(C.soil).lerp(C.rock, (h - 0.07) / 0.09);
    else out.copy(C.grass).lerp(C.grass2, Math.min(1, Math.max(0, (h + 0.03) * 8)));
    if (rift > 0.05 && gr > 0.15) out.lerp(C.basalt, Math.min(1, rift * gr * 1.4));
    if (rift > 0.3 && h < -0.12) out.lerp(C.hotrock, Math.min(1, (-h - 0.12) * 10));
    if (h < 0.15 && h > -0.05) {
      const dr = Math.abs(wrapD(pz - 0.22));
      if (dr < 0.022) out.copy(C.road);
      const dv = Math.abs(wrapD(pz + 0.33 + 0.03 * Math.sin((x - offX[side]) * 7)));
      if (dv < 0.026) out.copy(C.river);
    }
    return out;
  }

  const hgt = new Float32Array(nV);
  function updateTerrain() {
    for (let i = 0; i < nV; i++) {
      const x = gx[i], z = gz[i], side = x < 0 ? 0 : 1;
      const h = height(x, z, side);
      hgt[i] = h;
      pos.setY(i, BASE + h);
      colorAt(h, x, z, side, tc);
      col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
    }
    pos.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // ---- Борта блока: слои горных пород, изгибаются вместе с рельефом ----
  const strata = (() => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 512;
    const g = c.getContext('2d');
    const cols = ['#5a4636', '#7d6247', '#a0825c', '#8c7a63', '#b39a72', '#6d5c4c', '#927657', '#5e5145'];
    for (let y = 0; y < 512; y++) {
      const v = 1 - y / 512;
      let s;
      if (v < 0.3) s = '#3a2f3c';                    // фундамент
      else s = cols[Math.floor((v - 0.3) / 0.032) % cols.length];
      g.fillStyle = s; g.fillRect(0, y, 8, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })();
  const sideMat = new THREE.MeshStandardMaterial({ map: strata, roughness: 0.95, side: THREE.DoubleSide });
  const bend = (x) => mtn * 0.2 * Math.exp(-(x * x) / 0.08) - rift * 0.14 * Math.exp(-(x * x) / 0.03);
  function skirt(edge) {
    const n = edge.length;
    const p = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, sideMat);
    m.frustumCulled = false;
    block.add(m);
    return () => {
      for (let i = 0; i < n; i++) {
        const v = edge[i], x = gx[v], z = gz[v], y = BASE + hgt[v], b = bend(x);
        p.set([x, TY, z, x, y, z], i * 6);
        uv.set([0.5, 0.36 - b, 0.5, y - b - TY + 0.36], i * 4);
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.uv.needsUpdate = true;
      g.computeVertexNormals();
    };
  }
  const row = (iz) => Array.from({ length: NX + 1 }, (_, ix) => iz * (NX + 1) + ix);
  const colm = (ix) => Array.from({ length: NZ + 1 }, (_, iz) => iz * (NX + 1) + ix);
  const skirts = [skirt(row(0)), skirt(row(NZ)), skirt(colm(0)), skirt(colm(NX))];
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(W, D), sideMat);
  bottom.rotation.x = Math.PI / 2; bottom.position.y = TY + 0.001;
  block.add(bottom);

  // ---- Лава в рифте и магма в бортах ----
  const lavaTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
      const n = fbm2(x / 14, y / 14, 4);
      const k = Math.min(1, Math.max(0, (n - 0.35) * 2.6));
      const i = (y * 64 + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 60 + 170 * k; img.data[i + 2] = 20 + 60 * k * k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(1, D), new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false }));
  lava.rotation.x = -Math.PI / 2;
  block.add(lava);
  const dikeMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f, toneMapped: false });
  const dikes = [D / 2 + 0.003, -D / 2 - 0.003].map((z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dikeMat);
    m.position.z = z;
    block.add(m);
    return m;
  });
  const glow = new THREE.PointLight(0xff6a2a, 0, 2.2);
  glow.position.set(0, BASE + 0.1, 0);
  block.add(glow);
  const SPARKS = 140;
  const spPos = new Float32Array(SPARKS * 3), spData = [];
  for (let i = 0; i < SPARKS; i++) spData.push({ life: Math.random() * 1.5, vy: 0 });
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: 0xffb04a, size: 0.025, map: softDot(THREE),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false;
  block.add(sparks);

  // ---- Деревья и дома: едут вместе с плитой ----
  const TREES = 110;
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(0.018, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.9 }), TREES);
  const treeData = [];
  for (let i = 0; i < TREES; i++) {
    const side = i % 2;
    treeData.push({ side, x0: side ? 0.05 + Math.random() * 1.12 : -0.05 - Math.random() * 1.12, z0: (Math.random() - 0.5) * D * 0.96 });
  }
  block.add(trees);
  const HOUSES = 14;
  const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.03, 0.035), new THREE.MeshStandardMaterial({ color: 0xd9c7a8, roughness: 0.8 }), HOUSES);
  const houseData = [];
  for (let i = 0; i < HOUSES; i++) {
    const side = i % 2;
    houseData.push({ side, x0: side ? 0.12 + i * 0.075 : -0.12 - i * 0.075, z0: 0.22 + (i % 4 < 2 ? 0.045 : -0.045) });
  }
  block.add(houses);
  const mtx = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  function wrapX(x, side) { const a = side ? 0 : -W / 2; return a + (((x - a) % (W / 2)) + W / 2) % (W / 2); }
  function placeThings(list, mesh, onRoad) {
    list.forEach((it, i) => {
      const x = wrapX(it.x0 + offX[it.side], it.side);
      const z = wrapD(it.z0 + offZ[it.side]);
      const h = height(x, z, it.side);
      const ok = Math.abs(x) > 0.06 && Math.abs(x) < W / 2 - 0.03 && Math.abs(z) < D / 2 - 0.03 && h < (onRoad ? 0.12 : 0.17) && h > -0.05
        && Math.abs(x) > 0.2 * rift + 0.06;
      const s = ok ? 1 : 0.0001;
      pv.set(x, BASE + h + (onRoad ? 0.015 : 0.03), z);
      sv.set(s, s * (onRoad ? 1 : 0.8 + (i % 5) * 0.12), s);
      mesh.setMatrixAt(i, mtx.compose(pv, q0, sv));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---- Стрелки движения плит ----
  function arrow(color) {
    // Плоская стрелка над плитой: сверху читается при любом направлении, даже «к зрителю».
    const sh = new THREE.Shape();
    sh.moveTo(-0.17, -0.03); sh.lineTo(0.05, -0.03); sh.lineTo(0.05, -0.075); sh.lineTo(0.19, 0);
    sh.lineTo(0.05, 0.075); sh.lineTo(0.05, 0.03); sh.lineTo(-0.17, 0.03); sh.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.add(m);
    block.add(g);
    return g;
  }
  const arrows = [arrow(0x8ab4f8), arrow(0xffb74d)];

  // ---- Волны землетрясения ----
  const ringGeo = new THREE.RingGeometry(0.96, 1, 72);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.visible = false;
    block.add(m);
    return m;
  });
  const epi = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }));
  epi.visible = false;
  block.add(epi);
  let ringI = 0;
  function spawnRing(x, z, speed, color, delay) {
    const m = rings[ringI++ % rings.length];
    m.material.color.set(color);
    m.userData = { x, z, speed, t: -delay };
    m.position.set(x, BASE + 0.12, z);
    m.visible = false;
  }

  const board = lab.board(MODES[mode].text, [O[0], 2.25, O[2] + CZ - 0.95], { scale: 0.0024 });
  const quakeBoard = lab.board(tr('Сейсмограф ждёт толчка', 'Сейсмограф сілкіністі күтуде', 'Seismograph awaiting a tremor'), [O[0] + 1.3, 1.32, O[2] + 0.7], { scale: 0.0015 });

  function quake(M) {
    const z = (Math.random() - 0.5) * D * 0.6;
    quakes.push({ x: 0, z, t: 0, A: 0.006 * (M - 3.5) });
    if (quakes.length > 3) quakes.shift();
    shake = 0.0035 * (M - 3.5);
    seis = Math.min(1, (M - 3.5) / 3.5);
    spawnRing(0, z, 1.25, 0x8ab4f8, 0);
    spawnRing(0, z, 0.75, 0xffb74d, 0.15);
    epi.position.set(0, BASE + 0.13, z);
    epi.visible = true;
    epi.userData.t = 2.5;
    quakeBoard.set(tr(`Землетрясение · M ${M.toFixed(1)}\nсиние кольца — волны P, оранжевые — S`, `Жер сілкінісі · M ${M.toFixed(1)}\nкөк сақиналар — P толқындары, қызғылт сарылары — S`, `Earthquake · M ${M.toFixed(1)}\nblue rings — P waves, orange — S waves`));
    if (mode === 'transform') slipLeft += 0.025 * (M - 4);
  }

  function setMode(m) {
    if (mode === m) return;
    mode = m;
    stress = 0;
    board.set(MODES[m].text);
    setLever(MODES[m].angle);
  }

  // ---- Пульт с рычагом ----
  const leverAt = new THREE.Vector3(O[0] - 1.3, 0, O[2] + 0.7);
  const consoleMat = new THREE.MeshStandardMaterial({ color: 0x263043, roughness: 0.5, metalness: 0.4 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.26), consoleMat);
  box.position.copy(leverAt).setY(0.45);
  scene.add(box);
  const slot = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 40, 1.3), new THREE.MeshBasicMaterial({ color: 0x8ab4f8 }));
  slot.position.copy(leverAt).setY(0.92);
  slot.rotation.z = Math.PI / 2 - 0.65;
  scene.add(slot);
  const pivot = leverAt.clone().setY(0.92);
  const arm = new THREE.Group();
  arm.position.copy(pivot);
  const LEN = 0.3;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, LEN, 10), new THREE.MeshStandardMaterial({ color: 0xc9d1dc, metalness: 0.8, roughness: 0.25 }));
  stick.position.y = LEN / 2;
  arm.add(stick);
  scene.add(arm);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0xb71c1c, emissiveIntensity: 0.5, roughness: 0.3 }));
  scene.add(knob);
  for (const key of Object.keys(MODES)) {
    const a = MODES[key].angle;
    const l = makeLabel(MODES[key].name, { scale: 0.0009 });
    l.position.set(pivot.x + Math.sin(a) * (LEN + 0.13) * 1.25, pivot.y + Math.cos(a) * (LEN + 0.11), pivot.z);
    scene.add(l);
  }
  function setLever(a) {
    arm.rotation.z = -a;
    if (!knob.userData.heldBy) knob.position.set(pivot.x + Math.sin(a) * LEN, pivot.y + Math.cos(a) * LEN, pivot.z);
  }
  setLever(MODES[mode].angle);
  const kp = new THREE.Vector3();
  function nearestMode(a) {
    let best = 'transform', bd = 9;
    for (const [k, m] of Object.entries(MODES)) { const d = Math.abs(m.angle - a); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  lab.hover(knob, tr('Рычаг движения плит\nПотяните влево, в центр или вправо', 'Плиталар қозғалысының тұтқасы\nСолға, ортаға немесе оңға тартыңыз', 'Plate motion lever\nPull it left, to the centre or right'));
  lab.grab(knob, {
    onMove(o) {
      o.getWorldPosition(kp).sub(pivot);
      const a = Math.max(-0.6, Math.min(0.6, Math.atan2(kp.x, Math.max(0.05, kp.y))));
      arm.rotation.z = -a;
      if (o.userData.heldBy === 'mouse') o.position.set(pivot.x + Math.sin(a) * LEN, pivot.y + Math.cos(a) * LEN, pivot.z);
      const m = nearestMode(a);
      if (Math.abs(MODES[m].angle - a) < 0.15) setMode(m);
    },
    onRelease(o) {
      o.getWorldPosition(kp).sub(pivot);
      const a = Math.atan2(kp.x, Math.max(0.05, kp.y));
      const m = nearestMode(Math.max(-0.6, Math.min(0.6, a)));
      o.userData.heldBy = null;
      setMode(m);
      setLever(MODES[m].angle);
    },
  });
  for (const key of ['divergent', 'transform', 'convergent']) lab.hud.action(MODES[key].name, () => setMode(key), stationName);
  lab.hud.action(tr('Толчок', 'Сілкініс', 'Tremor'), () => quake(5 + Math.random() * 1.5), stationName);

  // ---- Сейсмограф ----
  const seisAt = new THREE.Vector3(O[0] + 1.3, 0, O[2] + 0.7);
  const sbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.26), consoleMat);
  sbox.position.copy(seisAt).setY(0.45);
  scene.add(sbox);
  const PW = 512, PH = 128, DL = 0.4, DR = 0.075;
  const paper = document.createElement('canvas');
  paper.width = PW; paper.height = PH;
  const pc = paper.getContext('2d');
  function clearCols(x, w) {
    pc.fillStyle = '#f3efe4'; pc.fillRect(x, 0, w, PH);
    pc.fillStyle = '#d6cfbd';
    for (let y = 16; y < PH; y += 24) pc.fillRect(x, y, w, 1);
  }
  clearCols(0, PW);
  const paperTex = new THREE.CanvasTexture(paper);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  const holder = new THREE.Group();
  holder.position.copy(seisAt).setY(1.0);
  holder.rotation.z = -Math.PI / 2;
  scene.add(holder);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(DR, DR, DL, 48, 1, true), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9 }));
  holder.add(drum);
  const caps = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.8, roughness: 0.3 });
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(DR + 0.008, DR + 0.008, 0.012, 32), caps);
    cap.position.y = s * (DL / 2 + 0.006);
    holder.add(cap);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.03), caps);
    post.position.set(seisAt.x + s * (DL / 2 + 0.03), 0.95, seisAt.z);
    scene.add(post);
  }
  const pen = new THREE.Group();
  const needle = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xd32f2f }));
  needle.rotation.x = -Math.PI / 2 - 0.5;
  needle.position.set(0, 0.012, DR + 0.02);
  const penArm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.2), caps);
  penArm.position.set(0, 0.03, DR + 0.13);
  pen.add(needle, penArm);
  pen.position.set(seisAt.x, 1.0, seisAt.z);
  scene.add(pen);
  lab.hover(drum, tr('Сейсмограф\nБарабан крутится, перо пишет колебания почвы', 'Сейсмограф\nБарабан айналады, қалам топырақ тербелістерін жазады', 'Seismograph\nThe drum turns and the pen records ground motion'));
  let head = 0, lastY = PH / 2;

  function updateSeismo(dt, t) {
    const amp = seis * Math.sin(t * 31) * (0.6 + 0.4 * Math.sin(t * 7.3)) + 0.012 * Math.sin(t * 53) + 0.008 * (Math.random() - 0.5);
    const y = PH / 2 + Math.max(-0.47, Math.min(0.47, amp * 0.47)) * PH;
    const nh = head + dt * 34;
    const x0 = head % PW, dx = nh - head;
    clearCols(Math.floor(nh % PW) + 3, Math.ceil(dx) + 2);
    pc.strokeStyle = '#1b2a6b'; pc.lineWidth = 1.6;
    for (const off of [0, -PW]) {
      pc.beginPath(); pc.moveTo(x0 + off, lastY); pc.lineTo(x0 + dx + off, y); pc.stroke();
    }
    paperTex.needsUpdate = true;
    head = nh; lastY = y;
    drum.rotation.y = -((head % PW) / PW) * Math.PI * 2;
    // Холст y=0 приходится на мировой +x барабана.
    pen.position.x = seisAt.x + (0.5 - y / PH) * DL;
  }

  // ---- Кадр ----
  const V = 0.035;
  return function update(dt, t) {
    if (mode === 'convergent') {
      offX[0] += V * dt; offX[1] -= V * dt;
      mtn = Math.min(1, mtn + dt * 0.05);
      rift = Math.max(0, rift - dt * 0.12);
      stress += dt / 8;
      if (stress >= 1) { stress = 0; quake(5.4 + Math.random() * 1.6); }
    } else if (mode === 'divergent') {
      offX[0] -= V * dt; offX[1] += V * dt;
      rift = Math.min(1, rift + dt * 0.08);
      mtn = Math.max(0, mtn - dt * 0.04);
      stress += dt / 9;
      if (stress >= 1) { stress = 0; quake(4.4 + Math.random() * 1.0); }
    } else {
      stress += dt / 5;
      if (stress >= 1) { stress = 0; quake(6 + Math.random() * 1.2); }
    }
    if (slipLeft > 0) {
      const s = Math.min(slipLeft, dt * 0.25);
      slipLeft -= s; slip += s;
      offZ[0] += s; offZ[1] -= s;
    }
    for (let i = quakes.length - 1; i >= 0; i--) { quakes[i].t += dt; if (quakes[i].t > 3) quakes.splice(i, 1); }
    updateTerrain();
    for (const f of skirts) f();
    placeThings(treeData, trees, false);
    placeThings(houseData, houses, true);

    // лава
    const rv = rift > 0.03;
    lava.visible = rv;
    sparks.visible = rv;
    for (const d of dikes) d.visible = rv;
    glow.intensity = rv ? rift * (1.5 + 0.4 * Math.sin(t * 6)) : 0;
    if (rv) {
      lava.position.y = BASE - 0.2 * rift + 0.012;
      lava.scale.x = 0.03 + 0.1 * rift;
      lavaTex.offset.y = (t * 0.05) % 1;
      lavaTex.offset.x = Math.sin(t * 0.7) * 0.1;
      const top = BASE - 0.2 * rift;
      for (const d of dikes) { d.scale.set(0.02 + 0.08 * rift, top - TY, 1); d.position.y = (top + TY) / 2; }
      dikeMat.color.setHSL(0.04 + 0.02 * Math.sin(t * 3), 1, 0.5);
      for (let i = 0; i < SPARKS; i++) {
        const s = spData[i];
        s.life -= dt;
        if (s.life <= 0) {
          s.life = 0.6 + Math.random() * 1.2; s.vy = 0.15 + Math.random() * 0.35;
          spPos[i * 3] = (Math.random() - 0.5) * 0.08 * rift; spPos[i * 3 + 1] = lava.position.y; spPos[i * 3 + 2] = (Math.random() - 0.5) * D * 0.95;
        }
        spPos[i * 3 + 1] += s.vy * dt;
        spPos[i * 3] += (Math.random() - 0.5) * dt * 0.05;
      }
      spGeo.attributes.position.needsUpdate = true;
    }

    // стрелки
    const bob = (t * 0.6) % 1;
    arrows.forEach((a, s) => {
      const sign = s ? -1 : 1;
      let dir, x = s ? 0.62 : -0.62, z = 0;
      if (mode === 'convergent') dir = sign;
      else if (mode === 'divergent') dir = -sign;
      else dir = 0;
      // Плоскость стрелки разворачиваем к зрителю: сдвиг читается как «вниз — к вам, вверх — от вас».
      a.rotation.y = dir === 0 ? (s ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      a.rotation.x = dir === 0 ? 0 : 1.0;
      a.rotation.z = dir === 0 ? (s ? 1.1 : -1.1) : 0;
      const shift = (bob - 0.5) * 0.12;
      if (dir === 0) z = (s ? -1 : 1) * shift; else x += dir * shift;
      a.position.set(x, BASE + 0.42, z);
    });

    // волны и тряска
    for (const r of rings) {
      const u = r.userData;
      if (u.t === undefined) continue;
      u.t += dt;
      if (u.t < 0) continue;
      const rad = 0.05 + u.t * u.speed;
      r.visible = rad < 1.5;
      r.scale.set(rad, 1, rad);
      r.material.opacity = Math.max(0, 0.9 * (1 - rad / 1.5));
    }
    if (epi.visible) { epi.userData.t -= dt; epi.scale.setScalar(1 + 0.3 * Math.sin(t * 20)); if (epi.userData.t <= 0) epi.visible = false; }
    if (shake > 0.0001) {
      block.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.5, CZ + (Math.random() - 0.5) * shake);
      shake *= Math.exp(-dt * 2.2);
    } else block.position.set(0, 0, CZ);
    seis *= Math.exp(-dt * 0.9);
    updateSeismo(dt, t);
  };
}

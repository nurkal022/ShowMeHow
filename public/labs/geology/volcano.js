/**
 * Станция 3: стратовулкан в разрезе. Кнопка нагнетает давление в очаге — магма
 * поднимается по жерлу, и на 100 % вулкан извергается: фонтан лавы, потоки
 * по склонам, облако пепла.
 */
import { softDot } from './noise.js';
import { tr } from '../common.js';

const Y0 = 0.5, RIM = 1.55, CR = 1.43, BASE_R = 1.15, TOPR = 0.13;
const prof = (y) => TOPR + (BASE_R - TOPR) * Math.pow(Math.max(0, (RIM - y) / (RIM - Y0)), 1.5);
const surfY = (r) => RIM - (RIM - Y0) * Math.pow(Math.min(1, Math.max(0, (r - TOPR) / (BASE_R - TOPR))), 1 / 1.5);
const CH_Y = 0.24, CH_RX = 0.42, CH_RY = 0.12, SW = 2.6, SH = 1.65;

function sectionTexture(THREE) {
  const CW = 1024, CHh = 650;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CHh;
  const g = c.getContext('2d');
  const X = (x) => ((x + SW / 2) / SW) * CW, Y = (y) => ((SH - y) / SH) * CHh;
  // Пласты под вулканом
  const bands = [[0.5, 0.46, '#5b4a33'], [0.46, 0.4, '#8a6d4b'], [0.4, 0.33, '#a48d6d'], [0.33, 0.26, '#6f6670'], [0.26, 0.12, '#4c4656'], [0.12, 0, '#352f3d']];
  for (const [a, b, col] of bands) { g.fillStyle = col; g.fillRect(0, Y(a), CW, Y(b) - Y(a) + 1); }
  // Конус: чередуются слои пепла и застывшей лавы
  for (let k = 0; k < 9; k++) {
    const d = k * 0.1;
    g.beginPath();
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const y = Y0 + (RIM - Y0) * i / 40;
      const r = prof(y) - d;
      if (r < 0.05) break;
      pts.push([r, y]);
    }
    if (pts.length < 2) break;
    pts.forEach(([r, y], i) => (i ? g.lineTo(X(-r), Y(y)) : g.moveTo(X(-r), Y(y))));
    if (k === 0) { g.lineTo(X(-0.05), Y(CR)); g.lineTo(X(0.05), Y(CR)); }
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(X(pts[i][0]), Y(pts[i][1]));
    g.closePath();
    g.fillStyle = k % 2 ? '#8f8379' : '#564a44';
    g.fill();
  }
  // Боковая дайка и жерло
  g.strokeStyle = '#5a1a0e'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(X(0.02), Y(0.85)); g.quadraticCurveTo(X(0.25), Y(0.95), X(0.42), Y(1.12)); g.stroke();
  g.fillStyle = '#4a150b';
  g.fillRect(X(-0.04), Y(CR), X(0.04) - X(-0.04), Y(CH_Y) - Y(CR));
  // Очаг
  const grd = g.createRadialGradient(X(0), Y(CH_Y), 4, X(0), Y(CH_Y), (CH_RX / SW) * CW);
  grd.addColorStop(0, '#a3361a'); grd.addColorStop(1, '#4a150b');
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(X(0), Y(CH_Y), (CH_RX / SW) * CW, (CH_RY / SH) * CHh, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildVolcano(lab, O, stationName) {
  const { THREE, scene } = lab;
  const root = new THREE.Group();
  root.position.set(O[0], 0, O[2]);
  scene.add(root);
  const body = new THREE.Group();
  root.add(body);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(SW, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.95 }));
  slab.position.set(0, 0.25, -0.7);
  body.add(slab);

  const pts = [];
  for (let i = 0; i <= 28; i++) { const y = Y0 + (RIM - Y0) * i / 28; pts.push(new THREE.Vector2(prof(y), y)); }
  pts.push(new THREE.Vector2(0.06, CR + 0.01), new THREE.Vector2(0.0, CR));
  const cone = new THREE.LatheGeometry(pts, 56, Math.PI / 2, Math.PI);
  const cpos = cone.attributes.position, ccol = new Float32Array(cpos.count * 3);
  const low = new THREE.Color(0x4f6a37), mid = new THREE.Color(0x6b5543), high = new THREE.Color(0x3d3735), tc = new THREE.Color();
  for (let i = 0; i < cpos.count; i++) {
    const k = (cpos.getY(i) - Y0) / (RIM - Y0);
    if (k < 0.35) tc.copy(low).lerp(mid, k / 0.35); else tc.copy(mid).lerp(high, (k - 0.35) / 0.65);
    tc.offsetHSL(0, 0, (Math.random() - 0.5) * 0.04);
    ccol.set([tc.r, tc.g, tc.b], i * 3);
  }
  cone.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  const coneMesh = new THREE.Mesh(cone, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }));
  body.add(coneMesh);

  const section = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH),
    new THREE.MeshStandardMaterial({ map: sectionTexture(THREE), transparent: true, alphaTest: 0.5, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.12 }));
  section.material.emissiveMap = section.material.map;
  section.position.set(0, SH / 2, 0.003);
  body.add(section);
  lab.hover(section, tr('Стратовулкан в разрезе\nСлои пепла чередуются со слоями застывшей лавы', 'Стратожанартаудың кесігі\nКүл қабаттары қатқан лава қабаттарымен кезектеседі', 'Stratovolcano in section\nAsh layers alternate with layers of solidified lava'));

  // Светящиеся очаг и столб магмы
  const chamber = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true,
    opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  chamber.scale.set(CH_RX, CH_RY, 1);
  chamber.position.set(0, CH_Y, 0.007);
  body.add(chamber);
  lab.hover(chamber, tr('Магматический очаг\nРасплав 900–1200 °C, газы давят на кровлю', 'Магмалық ошақ\nБалқыма 900–1200 °C, газдар жабынға қысым түсіреді', 'Magma chamber\nMelt at 900–1200 °C, gases press on the roof'));
  const columnGeo = new THREE.PlaneGeometry(0.075, 1);
  columnGeo.translate(0, 0.5, 0);
  const column = new THREE.Mesh(columnGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
  column.position.set(0, CH_Y + CH_RY - 0.02, 0.008);
  body.add(column);
  const ventHit = new THREE.Mesh(new THREE.BoxGeometry(0.1, CR - CH_Y, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
  ventHit.position.set(0, (CR + CH_Y) / 2 + 0.06, 0.02);
  body.add(ventHit);
  lab.hover(ventHit, tr('Жерло\nПо нему магма поднимается к кратеру', 'Жанартау өңеші\nОл арқылы магма кратерге көтеріледі', 'Conduit\nMagma rises through it to the crater'));
  const craterHit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  craterHit.position.set(0, RIM, -0.05);
  body.add(craterHit);
  lab.hover(craterHit, tr('Кратер\nСюда выходят лава, газы и пепел', 'Кратер\nМұнда лава, газдар мен күл шығады', 'Crater\nLava, gases and ash come out here'));

  const light = new THREE.PointLight(0xff6a2a, 0, 5);
  light.position.set(0, RIM + 0.2, 0.1);
  root.add(light);

  // Манометр и кнопка
  const gx = 1.62;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.25, roughness: 0.1, side: THREE.DoubleSide }));
  tube.position.set(gx, 0.9, -0.3);
  root.add(tube);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x263043, metalness: 0.4 }));
  stand.position.set(gx, 0.25, -0.3);
  root.add(stand);
  const fillGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 20);
  fillGeo.translate(0, 0.5, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x43a047, toneMapped: false }));
  fill.position.set(gx, 0.5, -0.3);
  root.add(fill);
  lab.hover(tube, () => tr(`Давление в очаге: ${Math.round(pressure * 100)} %`, `Ошақтағы қысым: ${Math.round(pressure * 100)} %`, `Chamber pressure: ${Math.round(pressure * 100)} %`));
  const board = lab.board(tr('Давление в очаге: 0 %', 'Ошақтағы қысым: 0 %', 'Chamber pressure: 0 %') + '\n' + tr('Нагнетайте — на 100 % вулкан проснётся', 'Қысымды арттырыңыз — 100 %-да жанартау оянады', 'Keep pumping — at 100 % the volcano wakes up'), [O[0], 2.2, O[2] - 0.9], { scale: 0.0025 });

  let pressure = 0, shown = 0, erupt = 0, level = 0;
  function pump() {
    if (erupt > 0) return;
    pressure = Math.min(1, pressure + 0.2);
    if (pressure >= 0.999) {
      erupt = 7;
      board.set(tr('Извержение!\nГазы вырываются, лава льётся по склонам', 'Атқылау!\nГаздар атқылап шығады, лава беткейлермен ағады', 'Eruption!\nGases burst out, lava pours down the slopes'));
    } else board.set(`${tr('Давление в очаге', 'Ошақтағы қысым', 'Chamber pressure')}: ${Math.round(pressure * 100)} %\n${pressure >= 0.6 ? tr('Магма поднимается по жерлу…', 'Магма өңеш бойымен көтерілуде…', 'Magma is rising up the conduit…') : tr('Нагнетайте — на 100 % вулкан проснётся', 'Қысымды арттырыңыз — 100 %-да жанартау оянады', 'Keep pumping — at 100 % the volcano wakes up')}`);
  }
  lab.button3d(tr('Нагнетать давление', 'Қысымды арттыру', 'Build pressure'), [O[0] + 1.25, 1.0, O[2] + 0.45], pump, { width: 0.8, color: 0xe53935, rotY: -0.3 });
  lab.hud.action(tr('Нагнетать давление', 'Қысымды арттыру', 'Build pressure'), pump, stationName);

  // Лава: фонтан из кратера, потом поток по склону
  const dot = softDot(THREE);
  const LN = 520;
  const lp = new Float32Array(LN * 3), lc = new Float32Array(LN * 3);
  const L = Array.from({ length: LN }, () => ({ alive: false, v: new THREE.Vector3(), flow: false, phi: 0, r: 0, heat: 1, life: 0 }));
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const lavaPts = new THREE.Points(lGeo, new THREE.PointsMaterial({ size: 0.075, map: dot, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  lavaPts.frustumCulled = false;
  body.add(lavaPts);
  for (let i = 0; i < LN; i++) lp[i * 3 + 1] = -10;
  let lNext = 0;
  function spawnLava() {
    const p = L[lNext]; const i = lNext; lNext = (lNext + 1) % LN;
    p.alive = true; p.flow = false; p.heat = 1; p.life = 9;
    const phi = Math.PI / 2 + Math.random() * Math.PI; // только задняя половина — туда, где есть склон
    const sp = 0.25 + Math.random() * 0.55;
    p.v.set(Math.sin(phi) * sp, 1.6 + Math.random() * 1.3, Math.cos(phi) * sp);
    lp[i * 3] = (Math.random() - 0.5) * 0.05; lp[i * 3 + 1] = CR + 0.04; lp[i * 3 + 2] = -0.03;
  }
  const hot = new THREE.Color(0xffb347), red = new THREE.Color(0xe8330c), crust = new THREE.Color(0x3a1408), cc = new THREE.Color();
  function updateLava(dt) {
    for (let i = 0; i < LN; i++) {
      const p = L[i];
      if (!p.alive) continue;
      p.life -= dt;
      let x = lp[i * 3], y = lp[i * 3 + 1], z = lp[i * 3 + 2];
      if (!p.flow) {
        p.v.y -= 4.2 * dt;
        x += p.v.x * dt; y += p.v.y * dt; z += p.v.z * dt;
        const r = Math.hypot(x, z);
        if (p.v.y < 0 && r >= TOPR && r <= BASE_R && y <= surfY(r) + 0.01) { p.flow = true; p.r = r; p.phi = Math.atan2(x, z); }
        else if (p.v.y < 0 && r < TOPR && y < CR) p.alive = false;
        p.heat = Math.max(0.6, p.heat - dt * 0.05);
      } else {
        p.r += dt * 0.16 * p.heat;
        p.heat = Math.max(0, p.heat - dt * 0.13);
        if (p.r > BASE_R) p.r = BASE_R;
        x = Math.sin(p.phi) * p.r; z = Math.cos(p.phi) * p.r; y = surfY(p.r) + 0.012;
      }
      if (p.life <= 0) p.alive = false;
      if (!p.alive) y = -10;
      lp[i * 3] = x; lp[i * 3 + 1] = y; lp[i * 3 + 2] = z;
      if (p.heat > 0.6) cc.copy(red).lerp(hot, (p.heat - 0.6) / 0.4); else cc.copy(crust).lerp(red, p.heat / 0.6);
      lc.set([cc.r, cc.g, cc.b], i * 3);
    }
    lGeo.attributes.position.needsUpdate = true;
    lGeo.attributes.color.needsUpdate = true;
  }

  // Пепел и пар — спрайты с собственной прозрачностью
  const PUFFS = 46;
  const puffs = Array.from({ length: PUFFS }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0x777777, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    s.userData = { v: new THREE.Vector3(), life: 0, max: 1, size: 0.2, grow: 0.3, op: 0.5 };
    root.add(s);
    return s;
  });
  let pNext = 0;
  function spawnPuff(ash) {
    const s = puffs[pNext]; pNext = (pNext + 1) % PUFFS;
    const u = s.userData;
    s.visible = true;
    s.position.set((Math.random() - 0.5) * 0.08, RIM + 0.02, -0.05);
    u.v.set((Math.random() - 0.5) * (ash ? 0.5 : 0.08), ash ? 0.9 + Math.random() * 0.8 : 0.18 + Math.random() * 0.1, (Math.random() - 0.5) * (ash ? 0.4 : 0.06));
    u.max = u.life = ash ? 4 + Math.random() * 2 : 4;
    u.size = ash ? 0.35 : 0.12; u.grow = ash ? 0.6 : 0.12; u.op = ash ? 0.85 : 0.22;
    s.material.color.set(ash ? (Math.random() < 0.5 ? 0x9a928c : 0xb8b0a8) : 0xe8eef5);
  }
  function updatePuffs(dt) {
    for (const s of puffs) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.v.multiplyScalar(Math.exp(-dt * 0.35));
      u.v.x += dt * 0.06; // ветер
      s.position.addScaledVector(u.v, dt);
      const age = 1 - u.life / u.max;
      s.scale.setScalar(u.size + u.grow * age * u.max);
      s.material.opacity = u.op * Math.min(1, age * 6) * (1 - age);
    }
  }

  let steamT = 0, lavaAcc = 0, ashAcc = 0;
  return function update(dt, t) {
    if (erupt > 0) {
      erupt -= dt;
      pressure = Math.max(0, erupt / 7);
      lavaAcc += dt * 110; while (lavaAcc > 1) { spawnLava(); lavaAcc--; }
      ashAcc += dt * 9; while (ashAcc > 1) { spawnPuff(true); ashAcc--; }
      body.position.set((Math.random() - 0.5) * 0.008, 0, (Math.random() - 0.5) * 0.008);
      light.intensity = 3 + Math.random() * 1.5;
      if (erupt <= 0) {
        erupt = 0; pressure = 0; body.position.set(0, 0, 0);
        board.set(tr('Давление в очаге: 0 %\nОчаг опустел. Нагнетайте снова', 'Ошақтағы қысым: 0 %\nОшақ босады. Қысымды қайта арттырыңыз', 'Chamber pressure: 0 %\nThe chamber is empty. Pump again'));
      }
    } else {
      light.intensity = Math.max(0, light.intensity - dt * 3) + pressure * 0.6 * (0.8 + 0.2 * Math.sin(t * 5));
      if (pressure > 0.79) body.position.set((Math.random() - 0.5) * 0.002, 0, 0); else body.position.set(0, 0, 0);
    }
    shown += (pressure - shown) * (1 - Math.exp(-dt * 4));
    level += ((erupt > 0 ? 1 : shown) - level) * (1 - Math.exp(-dt * 3));
    column.scale.y = Math.max(0.001, level * (CR - column.position.y));
    column.visible = level > 0.01;
    chamber.material.opacity = 0.25 + 0.6 * shown + 0.12 * Math.sin(t * (2 + shown * 6));
    fill.scale.y = Math.max(0.001, shown * 0.8);
    fill.material.color.setHSL(0.33 * (1 - shown), 0.85, 0.5);
    steamT -= dt;
    if (steamT <= 0 && erupt <= 0) { spawnPuff(false); steamT = 0.5; }
    updateLava(dt);
    updatePuffs(dt);
  };
}

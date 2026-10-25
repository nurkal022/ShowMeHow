import { createLab, makeLabel, placeLabel, pulse, tr } from '../common.js';
import { BASE_CO2, clamp, emissivity, equilibriumC, iceTarget, surfaceAlbedo, albedoFeedback, seaRise } from './model.js';
import { createPhotons, glowTexture } from './photons.js';

const S1 = tr('Парниковый эффект', 'Парниктік әсер', 'Greenhouse Effect');
const S2 = tr('Ледник и океан', 'Мұздық және мұхит', 'Glacier and Ocean');
const lab = createLab({
  title: tr('Климатическая станция', 'Климаттық станция', 'Climate Station'),
  hint: tr('Возьмите баллон CO₂ или H₂O и отпустите у воронки — газ войдёт под купол, термометр и график покажут потепление. На второй станции рычаг поднимает температуру: ледник тает, море наступает на город.',
    'CO₂ немесе H₂O баллонын алып, шұңғыл жанында жіберіңіз — газ күмбез астына кіреді, термометр мен график жылынуды көрсетеді. Екінші станцияда тұтқа температураны көтереді: мұздық ериді, теңіз қалаға қарай жылжиды.',
    'Pick up the CO₂ or H₂O canister and release it at the funnel — the gas enters the dome, and the thermometer and chart show the warming. At the second station the lever raises the temperature: the glacier melts and the sea advances on the city.'),
  stations: [
    { name: S1, at: [0, 1.75, 2.5], look: [0, 1.2, -0.6] },
    { name: S2, at: [22, 1.75, 2.4], look: [22, 1.05, -0.4] },
  ],
});
const { THREE, scene } = lab;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const glow = glowTexture(THREE);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Лампа-«солнце»: корпус, светящийся шар, ореол и мягкий световой конус. */
function sunLamp(x, y, z, coneH) {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.16, 24, 1, true), std(0x2b3346, { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
  housing.position.y = 0.08;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(0.9);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 8), std(0x3a4458));
  rod.position.y = 0.75;
  const shaft = new THREE.Mesh(new THREE.ConeGeometry(0.95, coneH, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shaft.position.y = -coneH / 2;
  g.add(housing, bulb, halo, rod, shaft);
  g.position.set(x, y, z);
  const light = new THREE.PointLight(0xffd9a0, 2.2, 4.5, 1.6);
  light.position.set(x, y - 0.15, z);
  scene.add(g, light);
  return { group: g, halo, bulb };
}

/** Термометр: стеклянная трубка, шарик и столбик, который сцена двигает через set(°C). */
function thermometer(x, z, minC, maxC, ticks, unit = '°C') {
  const H0 = 0.35, H = 1.35;
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 24), std(0x222a3a, { metalness: 0.4 }));
  stand.position.y = 0.03;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, H0, 8), std(0x3a4458));
  post.position.y = H0 / 2;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H, 20, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }));
  tube.position.y = H0 + 0.08 + H / 2;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), std(0xe53935, { emissive: 0xe53935, emissiveIntensity: 0.6, roughness: 0.3 }));
  bulb.position.y = H0 + 0.04;
  const colGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 14);
  colGeo.translate(0, 0.5, 0);
  const column = new THREE.Mesh(colGeo, bulb.material);
  column.position.y = H0 + 0.08;
  g.add(stand, post, tube, bulb, column);
  for (const t of ticks) {
    const y = H0 + 0.08 + ((t - minC) / (maxC - minC)) * H;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: 0x8ab4f8 }));
    tick.position.set(0.09, y, 0);
    g.add(tick);
    g.add(placeLabel(makeLabel(`${t > 0 && unit !== '°C' ? '+' : ''}${t}${unit}`, { scale: 0.0011 }), 0.25, y, 0));
  }
  g.position.set(x, 0, z);
  scene.add(g);
  let shown = minC;
  return {
    group: g, tube,
    set(c, dt) {
      shown += (c - shown) * Math.min(1, dt * 3);
      column.scale.y = Math.max(0.001, ((clamp(shown, minC, maxC) - minC) / (maxC - minC)) * H);
    },
  };
}

// =====================================================================
// Станция 1: парниковый эффект под куполом
// =====================================================================
const C = v3(0, 0.76, -0.6); // центр купола на уровне земли
const R = 1.1;
const GROUND = C.y + 0.01;
{
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.14, C.y, 48), std(0x1b2232, { metalness: 0.3, roughness: 0.6 }));
  ped.position.set(C.x, C.y / 2, C.z);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.025, 8, 64), std(0x8ab4f8, { emissive: 0x1a73e8, emissiveIntensity: 0.6, metalness: 0.5 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(C).setY(C.y + 0.01);
  scene.add(ped, rim);
  // Пейзаж: трава, холмы, озеро, деревья, домик.
  const land = new THREE.Mesh(new THREE.CircleGeometry(R, 48), std(0x3f7a3a, { roughness: 1 }));
  land.rotation.x = -Math.PI / 2;
  land.position.copy(C).setY(GROUND);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), std(0x2a6fb0, { roughness: 0.2, emissive: 0x0d3a66, emissiveIntensity: 0.4 }));
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(1.4, 1, 1);
  lake.position.set(C.x + 0.35, GROUND + 0.003, C.z + 0.35);
  scene.add(land, lake);
  lab.hover(land, tr('Поверхность Земли\nПоглощает видимый свет и излучает тепло — ИК', 'Жер беті\nКөрінетін жарықты жұтып, жылуды — ИҚ сәулені шығарады', 'Earth’s surface\nAbsorbs visible light and emits heat as IR'));
  const hillMat = std(0x56853f, { flatShading: true });
  for (const [dx, dz, r, h] of [[-0.55, -0.35, 0.38, 0.22], [-0.2, -0.65, 0.3, 0.16], [0.45, -0.5, 0.28, 0.13]]) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.y = h / r;
    hill.position.set(C.x + dx, GROUND, C.z + dz);
    scene.add(hill);
  }
  const trunk = new THREE.CylinderGeometry(0.012, 0.015, 0.06, 6);
  const crown = new THREE.ConeGeometry(0.055, 0.15, 7);
  const trunkM = std(0x5d4037), crownM = std(0x2e7d32, { flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39, r = 0.25 + ((i * 37) % 60) / 100;
    const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
    if (Math.hypot(x - (C.x + 0.35), (z - (C.z + 0.35)) * 1.4) < 0.42) continue;
    const t = new THREE.Mesh(trunk, trunkM); t.position.set(x, GROUND + 0.03, z);
    const c = new THREE.Mesh(crown, crownM); c.position.set(x, GROUND + 0.13, z);
    const s = 0.8 + ((i * 13) % 5) / 10; c.scale.setScalar(s);
    scene.add(t, c);
  }
  const house = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), std(0xeeeeee));
  house.position.set(C.x - 0.15, GROUND + 0.04, C.z + 0.55);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 4), std(0xc62828));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(C.x - 0.15, GROUND + 0.115, C.z + 0.55);
  scene.add(house, roof);
}
// Купол: стекло и геодезическая сетка; нижняя половина сетки спрятана в постаменте.
const domeMat = new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0,
  depthWrite: false, side: THREE.DoubleSide, emissive: 0x000000 });
const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
dome.position.copy(C);
scene.add(dome);
const domeWire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(R + 0.004, 2)),
  new THREE.LineBasicMaterial({ color: 0x8ab4f8, transparent: true, opacity: 0.18 }));
domeWire.position.copy(C);
scene.add(domeWire);
lab.hover(dome, () => `${tr('Купол — модель атмосферы', 'Күмбез — атмосфера моделі', 'Dome — a model of the atmosphere')}\nCO₂ ${Math.round(co2)} ppm · ε = ${emissivity(co2, h2o).toFixed(2)}`);

const sun1 = sunLamp(C.x, 2.65, C.z, 1.75);
lab.hover(sun1.bulb, tr('Лампа-«Солнце»\nСвет видимый: атмосфера его почти пропускает', '«Күн» шамы\nЖарығы көрінетін: атмосфера оны түгелге жуық өткізеді', '“Sun” lamp\nVisible light: the atmosphere lets almost all of it through'));

// Воздушный впуск: труба в купол и воронка, к которой подносят баллоны.
const FUNNEL = v3(1.62, 1.08, -0.6);
{
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 12), std(0x90a4ae, { metalness: 0.7, roughness: 0.3 }));
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(1.3, 0.9, -0.6);
  const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), pipe.material);
  elbow.position.set(1.6, 0.97, -0.6);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.04, 0.16, 24, 1, true), std(0xb0bec5, { metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide }));
  funnel.position.copy(FUNNEL);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 32), new THREE.MeshBasicMaterial({ color: 0x8ab4f8 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(FUNNEL).setY(FUNNEL.y + 0.08);
  ring.name = 'funnelRing';
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), std(0x3a4458));
  leg.position.set(1.6, 0.45, -0.6);
  scene.add(pipe, elbow, funnel, ring, leg);
  scene.add(placeLabel(makeLabel(tr('Впуск газа', 'Газ кірісі', 'Gas inlet'), { scale: 0.0012 }), FUNNEL.x, FUNNEL.y + 0.25, FUNNEL.z));
  lab.hover(funnel, tr('Впуск газа\nОтпустите здесь баллон CO₂ или H₂O', 'Газ кірісі\nCO₂ немесе H₂O баллонын осы жерде жіберіңіз', 'Gas inlet\nRelease the CO₂ or H₂O canister here'));
}
const funnelRing = scene.getObjectByName('funnelRing');

// Молекулы в «воздухе» под куполом.
const molGeo = { C: new THREE.SphereGeometry(0.04, 12, 8), O: new THREE.SphereGeometry(0.035, 12, 8), H: new THREE.SphereGeometry(0.023, 10, 6) };
const molMat = { C: std(0x263238, { roughness: 0.4 }), O: std(0xe53935, { roughness: 0.4, emissive: 0x5a0d0d, emissiveIntensity: 0.6 }),
  H: std(0xf5f5f5, { roughness: 0.4, emissive: 0x555555, emissiveIntensity: 0.4 }) };
const molecules = [];
function makeMolecule(type, at) {
  const g = new THREE.Group();
  const atom = (k, x, y) => { const m = new THREE.Mesh(molGeo[k], molMat[k]); m.position.set(x, y, 0); g.add(m); return m; };
  if (type === 'co2') { atom('C', 0, 0); g.userData.a = [atom('O', -0.068, 0), atom('O', 0.068, 0)]; }
  else { atom('O', 0, 0); const k = 0.054; g.userData.a = [atom('H', -k * Math.sin(0.91), -k * Math.cos(0.91)), atom('H', k * Math.sin(0.91), -k * Math.cos(0.91))]; }
  g.userData.type = type;
  g.userData.vel = v3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.15);
  g.userData.spin = v3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.5);
  g.userData.flash = 0;
  g.userData.steer = 0;
  g.position.copy(at ?? randomInDome());
  g.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  scene.add(g);
  molecules.push(g);
  return g;
}
function randomInDome() {
  const y = C.y + 0.25 + Math.random() * 0.6;
  const rr = Math.sqrt(R * R - (y - C.y) ** 2) * 0.8 * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  return v3(C.x + Math.cos(a) * rr, y, C.z + Math.sin(a) * rr);
}
const CANISTER_PPM = 140;
let co2 = BASE_CO2, h2o = 1;
function molCount(type) { return type === 'co2' ? 3 + Math.round(((co2 - BASE_CO2) / CANISTER_PPM) * 4) : 2 + Math.round((h2o - 1) * 4); }
function syncMolecules(fromInlet) {
  for (const type of ['co2', 'h2o']) {
    const have = molecules.filter((m) => m.userData.type === type);
    const want = molCount(type);
    for (let i = have.length; i < want; i++) {
      const m = makeMolecule(type, fromInlet ? v3(C.x + R * 0.8, C.y + 0.18, C.z + (Math.random() - 0.5) * 0.2) : null);
      if (fromInlet) { m.userData.target = randomInDome(); m.userData.steer = 2.5; }
    }
    for (let i = have.length - 1; i >= want; i--) { scene.remove(have[i]); molecules.splice(molecules.indexOf(have[i]), 1); }
  }
}
syncMolecules(false);

function addGas(type) {
  if (type === 'co2') co2 = Math.min(co2 + CANISTER_PPM, BASE_CO2 + CANISTER_PPM * 8);
  else h2o = Math.min(h2o + 0.5, 3);
  syncMolecules(true);
  funnelRing.userData.flash = 1;
  updateGasBoard();
}
function resetGas() {
  co2 = BASE_CO2; h2o = 1;
  syncMolecules(false);
  updateGasBoard();
}

// Баллоны на стойке справа.
{
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.2), std(0x1c2433, { roughness: 0.6 }));
  stand.position.set(2.15, 0.87, -0.35);
  scene.add(stand);
  for (const [dx, dz] of [[-0.2, -0.5], [0.2, -0.5], [-0.2, 0.5], [0.2, 0.5]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.84, 8), std(0x2a3445));
    l.position.set(2.15 + dx, 0.42, -0.35 + dz);
    scene.add(l);
  }
}
const canisters = [];
[['co2', -0.75], ['co2', -0.35], ['h2o', 0.05]].forEach(([type, dz]) => {
  const col = type === 'co2' ? 0x78909c : 0x29b6f6;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.3, 20), std(col, { metalness: 0.55, roughness: 0.35, emissive: col, emissiveIntensity: 0.15 }));
  body.position.y = 0.15;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), body.material);
  top.position.y = 0.3;
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 10), std(0xcfd8dc, { metalness: 0.8, roughness: 0.2 }));
  valve.position.y = 0.39;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.067, 0.067, 0.05, 20), new THREE.MeshBasicMaterial({ color: type === 'co2' ? 0xffca28 : 0xe1f5fe }));
  band.position.y = 0.2;
  const tag = makeLabel(type === 'co2' ? 'CO₂' : 'H₂O', { scale: 0.0011 });
  tag.position.y = 0.52;
  g.add(body, top, valve, band, tag);
  const home = v3(2.15, 0.9, -0.35 + dz);
  g.position.copy(home);
  g.userData.home = home;
  g.userData.type = type;
  scene.add(g);
  canisters.push(g);
  lab.hover(body, type === 'co2'
    ? tr(`Баллон CO₂ · +${CANISTER_PPM} ppm\nПоднесите к воронке и отпустите`, `CO₂ баллоны · +${CANISTER_PPM} ppm\nШұңғылға апарып, жіберіңіз`, `CO₂ canister · +${CANISTER_PPM} ppm\nBring it to the funnel and let go`)
    : tr('Баллон водяного пара\nПар — тоже парниковый газ', 'Су буы баллоны\nБу да — парниктік газ', 'Water vapour canister\nVapour is a greenhouse gas too'));
  lab.grab(g, {
    onRelease: (o) => {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      o.rotation.set(0, 0, 0);
      if (p.distanceTo(FUNNEL) < 0.5 || Math.hypot(p.x - FUNNEL.x, p.z - FUNNEL.z) < 0.35) addGas(o.userData.type);
      o.userData.returning = true;
    },
  });
});

// Термометр, график и табло.
const thermo1 = thermometer(-1.5, 0.35, 10, 25, [10, 15, 20, 25]);
lab.hover(thermo1.tube, () => `${tr('Средняя температура поверхности', 'Жер бетінің орташа температурасы', 'Mean surface temperature')}\n${T1.toFixed(1)} °C`);

const chartCanvas = document.createElement('canvas');
chartCanvas.width = 640; chartCanvas.height = 360;
const chartTex = new THREE.CanvasTexture(chartCanvas);
chartTex.colorSpace = THREE.SRGBColorSpace;
const chart = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: chartTex, transparent: true }));
chart.position.set(-1.65, 2.3, -1.3);
chart.rotation.y = 0.45;
scene.add(chart);
lab.hover(chart, tr('Температура во времени\nПунктир — доиндустриальные 15 °C', 'Температураның уақыт бойынша өзгерісі\nҮзік сызық — индустрияға дейінгі 15 °C', 'Temperature over time\nDashed line — pre-industrial 15 °C'));
const samples = [];
function drawChart() {
  const g = chartCanvas.getContext('2d');
  const W = chartCanvas.width, H = chartCanvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(14,18,28,0.9)';
  g.beginPath(); g.roundRect(0, 0, W, H, 28); g.fill();
  const L = 70, Rt = W - 24, T = 60, B = H - 46;
  const yOf = (c) => B - ((clamp(c, 10, 25) - 10) / 15) * (B - T);
  g.font = '600 30px Inter, system-ui, sans-serif';
  g.fillStyle = '#eef2f7';
  g.fillText(tr('Температура, °C', 'Температура, °C', 'Temperature, °C'), 24, 40);
  g.font = '700 40px Inter, system-ui, sans-serif';
  g.fillStyle = T1 > 17 ? '#ff8a80' : T1 > 15.5 ? '#ffd54f' : '#81d4fa';
  g.fillText(`${T1.toFixed(1)} °C`, 270, 42);
  g.fillStyle = '#b7c0cf';
  g.font = '24px Inter, system-ui, sans-serif';
  g.textAlign = 'right';
  g.fillText(`CO₂ ${Math.round(co2)} ppm`, W - 24, 38);
  for (const c of [10, 15, 20, 25]) {
    g.strokeStyle = 'rgba(138,180,248,0.15)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, yOf(c)); g.lineTo(Rt, yOf(c)); g.stroke();
    g.fillText(String(c), L - 12, yOf(c) + 7);
  }
  g.textAlign = 'left';
  g.fillText(tr('годы →', 'жылдар →', 'years →'), L, H - 14);
  g.setLineDash([8, 8]); g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.beginPath(); g.moveTo(L, yOf(15)); g.lineTo(Rt, yOf(15)); g.stroke();
  g.setLineDash([]);
  if (samples.length > 1) {
    const N = 120;
    const xOf = (i) => L + (i / (N - 1)) * (Rt - L);
    const grad = g.createLinearGradient(0, B, 0, T);
    grad.addColorStop(0, '#4fc3f7'); grad.addColorStop(0.35, '#ffd54f'); grad.addColorStop(1, '#ff5252');
    g.strokeStyle = grad; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath();
    samples.forEach((s, i) => (i ? g.lineTo(xOf(i), yOf(s)) : g.moveTo(xOf(i), yOf(s))));
    g.stroke();
    const last = samples[samples.length - 1];
    g.fillStyle = '#ff8a80';
    g.beginPath(); g.arc(xOf(samples.length - 1), yOf(last), 8, 0, Math.PI * 2); g.fill();
  }
  chartTex.needsUpdate = true;
}

const gasBoard = lab.board(' ', [0, 0.42, 0.7], { scale: 0.0018 });
function updateGasBoard() {
  gasBoard.set(tr(
    `CO₂ ${Math.round(co2)} ppm · водяной пар ×${h2o.toFixed(1)}\nε атмосферы = ${emissivity(co2, h2o).toFixed(2)} → равновесие ${equilibriumC(co2, h2o).toFixed(1)} °C`,
    `CO₂ ${Math.round(co2)} ppm · су буы ×${h2o.toFixed(1)}\nатмосфераның ε = ${emissivity(co2, h2o).toFixed(2)} → тепе-теңдік ${equilibriumC(co2, h2o).toFixed(1)} °C`,
    `CO₂ ${Math.round(co2)} ppm · water vapour ×${h2o.toFixed(1)}\natmosphere ε = ${emissivity(co2, h2o).toFixed(2)} → equilibrium ${equilibriumC(co2, h2o).toFixed(1)} °C`));
}
updateGasBoard();
scene.add(placeLabel(makeLabel(tr(
  'Жёлтые — видимый свет Солнца: проходит сквозь воздух.\n' +
  'Земля нагревается и светит в ИК — красные фотоны.\n' +
  'CO₂ и H₂O поглощают ИК и переизлучают во все стороны:\n' +
  'часть тепла возвращается вниз — поверхность теплее.',
  'Сарылары — Күннің көрінетін жарығы: ауадан өтеді.\n' +
  'Жер қызып, ИҚ сәуле шығарады — қызыл фотондар.\n' +
  'CO₂ мен H₂O ИҚ сәулені жұтып, жан-жаққа қайта шығарады:\n' +
  'жылудың бір бөлігі төмен қайтады — жер беті жылынады.',
  'Yellow — visible sunlight: it passes through the air.\n' +
  'The Earth warms up and glows in IR — red photons.\n' +
  'CO₂ and H₂O absorb IR and re-emit it in all directions:\n' +
  'part of the heat returns downward — the surface gets warmer.'), { scale: 0.0019 }), 2.25, 1.9, -1.2));

lab.hud.action(tr('Добавить CO₂', 'CO₂ қосу', 'Add CO₂'), () => addGas('co2'), S1);
lab.hud.action(tr('Добавить водяной пар', 'Су буын қосу', 'Add water vapour'), () => addGas('h2o'), S1);
lab.hud.action(tr('Сбросить атмосферу', 'Атмосфераны қалпына келтіру', 'Reset atmosphere'), resetGas, S1);
lab.button3d(tr('Сбросить', 'Қалпына келтіру', 'Reset'), [1.1, 0.95, 0.75], resetGas, { width: 0.5, color: 0x546e7a, rotY: -0.4 });

let T1 = equilibriumC(BASE_CO2, 1);
let sampleTimer = 0;
const photons1 = createPhotons(THREE, scene, 200);
let sunAcc1 = 0;
const tmp = new THREE.Vector3();
function randomDir(out, upOnly) {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  out.set(s * Math.cos(a), upOnly ? Math.abs(u) * 0.9 + 0.1 : u, s * Math.sin(a));
  return out.normalize();
}
function stepPhoton1(ph) {
  const dC = ph.p.distanceTo(C);
  if (dC > 2.3 || ph.p.y < GROUND - 0.05 || ph.life > 9) return false;
  if (ph.kind === 0) { // видимый свет
    if (ph.p.y <= GROUND && ph.v.y < 0) {
      if (ph.data.bounced || Math.random() < 0.3) { ph.v.y = -ph.v.y; ph.data.bounced = true; return true; }
      ph.kind = 1; ph.color(0xff3d3d); ph.p.y = GROUND + 0.002;
      randomDir(ph.v, true).multiplyScalar(0.75);
    }
    return true;
  }
  // Инфракрасный
  if (ph.p.y <= GROUND && ph.v.y < 0) {
    ph.data.n = (ph.data.n ?? 0) + 1;
    if (ph.data.n > 5) return false;
    ph.p.y = GROUND + 0.002; ph.data.last = null;
    randomDir(ph.v, true).multiplyScalar(0.75);
    return true;
  }
  if (dC < R) {
    for (const m of molecules) {
      if (m === ph.data.last) continue;
      if (ph.p.distanceToSquared(m.position) < 0.01) {
        ph.data.last = m;
        m.userData.flash = 1;
        randomDir(ph.v, false).multiplyScalar(0.75);
        break;
      }
    }
  }
  return true;
}

// =====================================================================
// Станция 2: ледник, океан и прибрежный город
// =====================================================================
const X0 = 22, Z2 = -0.4;
const TOP = 0.73;           // столешница
const F = TOP + 0.03;       // дно аквариума
const TW = 3.2, TD = 1.0, TH = 0.85;
const SHELF = 0.30;          // высота берега с городом над дном
const LEVEL0 = 0.22;         // исходный уровень моря над дном
const M_PER_UNIT = 10 / 0.22; // 10 м подъёма = 0.22 м воды в аквариуме
{
  const table = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 1.9), std(0x1c2433, { roughness: 0.7 }));
  table.position.set(X0, TOP - 0.03, Z2 + 0.3);
  scene.add(table);
  for (const [dx, dz] of [[-1.7, -0.8], [1.7, -0.8], [-1.7, 1.0], [1.7, 1.0]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, TOP - 0.06, 8), std(0x2a3445));
    leg.position.set(X0 + dx, (TOP - 0.06) / 2, Z2 + 0.3 + dz * 0.95);
    scene.add(leg);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.08, 0.03, TD + 0.08), std(0x10151f));
  base.position.set(X0, TOP + 0.015, Z2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.02, TD), std(0xc2b280, { roughness: 1 }));
  floor.position.set(X0, F + 0.01, Z2);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.02, TH, TD + 0.02),
    new THREE.MeshPhysicalMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.set(X0, F + TH / 2, Z2);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: 0x8ab4f8, transparent: true, opacity: 0.55 }));
  edges.position.copy(glass.position);
  scene.add(base, floor, glass, edges);
}
function extrude(points, depth, mat) {
  const sh = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, mat);
}
// Скала слева, ледник на её плато.
const PLATEAU = 0.55;
const rock = extrude([[-1.6, 0], [-0.66, 0], [-0.7, 0.18], [-0.67, 0.3], [-0.74, 0.44], [-0.76, PLATEAU], [-1.0, PLATEAU + 0.02], [-1.3, PLATEAU - 0.01], [-1.6, PLATEAU]],
  TD - 0.02, std(0x6d6058, { flatShading: true, roughness: 0.95 }));
rock.position.set(X0, F + 0.02, Z2);
scene.add(rock);
const GL_LEN = 0.88, GL_H = 0.3;
const glacier = extrude([[0, 0], [GL_LEN, 0], [GL_LEN - 0.02, 0.09], [GL_LEN - 0.08, 0.13], [0.62, 0.2], [0.45, 0.24], [0.25, 0.28], [0.08, GL_H], [0, GL_H]],
  TD - 0.06, std(0xeaf6ff, { emissive: 0x8fc8f0, emissiveIntensity: 0.28, roughness: 0.35, flatShading: true }));
const glacierPivot = new THREE.Group();
glacierPivot.position.set(X0 - 1.6, F + 0.02 + PLATEAU, Z2);
glacierPivot.add(glacier);
scene.add(glacierPivot);
lab.hover(glacier, () => tr(`Ледник · осталось ${Math.round(ice * 100)} %\nБелый лёд отражает ~80 % света`, `Мұздық · ${Math.round(ice * 100)} % қалды\nАқ мұз жарықтың ~80 %-ын шағылыстырады`, `Glacier · ${Math.round(ice * 100)} % left\nWhite ice reflects ~80 % of light`));
lab.hover(rock, tr('Суша под ледником\nЛёд на суше при таянии поднимает море', 'Мұздық астындағы құрлық\nҚұрлықтағы мұз еріген кезде теңіз деңгейі көтеріледі', 'Land under the glacier\nLand ice raises the sea as it melts'));
// Берег справа и город.
const shore = extrude([[0.5, 0], [1.6, 0], [1.6, SHELF], [0.86, SHELF], [0.74, 0.22], [0.62, 0.09]], TD - 0.02, std(0x8d9f5a, { flatShading: true, roughness: 1 }));
shore.position.set(X0, F + 0.02, Z2);
scene.add(shore);
const houses = [];
{
  const palette = [0xffcc80, 0xef9a9a, 0x90caf9, 0xfff59d, 0xce93d8, 0xa5d6a7, 0xffab91, 0xb0bec5];
  const spots = [[0.98, -0.3], [1.18, -0.32], [1.4, -0.28], [1.0, 0.0], [1.22, 0.04], [1.45, 0.02], [1.08, 0.3], [1.36, 0.3]];
  spots.forEach(([x, z], i) => {
    const g = new THREE.Group();
    const h = 0.06 + (i % 3) * 0.025;
    const mat = std(palette[i], { roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.1), mat);
    body.position.y = h / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.06, 4), std(0x8d3b2f));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 0.03;
    g.add(body, roof);
    g.position.set(X0 + x, F + 0.02 + SHELF, Z2 + z);
    g.userData = { mat, base: new THREE.Color(palette[i]), h };
    scene.add(g);
    houses.push(g);
  });
  const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.28, 12), std(0xf5f5f5));
  lh.position.set(X0 + 0.88, F + 0.02 + SHELF + 0.14, Z2 + 0.38);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffeb3b }));
  lamp.position.set(X0 + 0.88, F + 0.02 + SHELF + 0.3, Z2 + 0.38);
  lamp.name = 'lighthouse';
  scene.add(lh, lamp);
  lab.hover(houses[4].children[0], () => tr(`Прибрежный город\nЗатоплено домов: ${flooded} из ${houses.length}`, `Жағалаудағы қала\nСу басқан үйлер: ${houses.length} үйдің ${flooded}`, `Coastal city\nHouses flooded: ${flooded} of ${houses.length}`));
}
const lighthouse = scene.getObjectByName('lighthouse');
// Вода
const waterGeo = new THREE.BoxGeometry(TW - 0.02, 1, TD - 0.02);
waterGeo.translate(0, 0.5, 0);
const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x1e74c8, transparent: true, opacity: 0.62, roughness: 0.12, metalness: 0.1,
  emissive: 0x0b3d72, emissiveIntensity: 0.45, depthWrite: false }));
water.position.set(X0, F + 0.02, Z2);
water.scale.y = LEVEL0;
water.renderOrder = 2;
scene.add(water);
lab.hover(water, tr('Океан\nТёмная вода поглощает ~94 % света', 'Мұхит\nҚараңғы су жарықтың ~94 %-ын жұтады', 'Ocean\nDark water absorbs ~94 % of light'));

// Линейка уровня моря на передней стенке.
const GAUGE_X = X0 + 0.3, GAUGE_Z = Z2 + TD / 2 + 0.03;
{
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.01), std(0xf5f5f5, { roughness: 0.6 }));
  strip.position.set(GAUGE_X, F + 0.02 + LEVEL0 + 0.11, GAUGE_Z);
  scene.add(strip);
  for (let m = 0; m <= 10; m += 1) {
    const y = F + 0.02 + LEVEL0 + m / M_PER_UNIT;
    const t = new THREE.Mesh(new THREE.BoxGeometry(m % 5 === 0 ? 0.07 : 0.04, 0.004, 0.012), new THREE.MeshBasicMaterial({ color: 0x263238 }));
    t.position.set(GAUGE_X - 0.01, y, GAUGE_Z + 0.002);
    scene.add(t);
    if (m % 5 === 0) scene.add(placeLabel(makeLabel(`+${m} ${tr('м', 'м', 'm')}`, { scale: 0.0009 }), GAUGE_X + 0.13, y, GAUGE_Z + 0.02));
  }
}
const gaugeMark = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 3), new THREE.MeshBasicMaterial({ color: 0xff5252 }));
gaugeMark.rotation.z = -Math.PI / 2;
scene.add(gaugeMark);

const sun2 = sunLamp(X0, 2.6, Z2, 1.6);
lab.hover(sun2.bulb, tr('Солнце\nОдин и тот же свет: лёд отражает, вода поглощает', 'Күн\nЖарық бірдей: мұз шағылыстырады, су жұтады', 'Sun\nThe same light: ice reflects it, water absorbs it'));

// Рычаг термостата.
const PIVOT = v3(X0 - 1.15, TOP + 0.1, Z2 + 0.95);
const ARM_L = 0.34, A_MAX = 0.9;
const armGroup = new THREE.Group();
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.16), std(0x263044, { metalness: 0.5, roughness: 0.4 }));
  base.position.set(PIVOT.x, TOP + 0.05, PIVOT.z);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(ARM_L + 0.04, 0.012, 6, 40, A_MAX * 2), new THREE.MeshBasicMaterial({ color: 0x8ab4f8 }));
  arc.rotation.z = Math.PI / 2 - A_MAX;
  arc.position.copy(PIVOT).setZ(PIVOT.z - 0.03);
  // Шкала цвета от холодного к горячему.
  const scale = new THREE.Mesh(new THREE.TorusGeometry(ARM_L + 0.07, 0.01, 6, 40, A_MAX * 2), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const pos = scale.geometry.attributes.position, colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i)) / (A_MAX * 2);
    c.setHSL(0.6 - 0.6 * clamp(a, 0, 1), 0.85, 0.55);
    colors.push(c.r, c.g, c.b);
  }
  scale.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scale.rotation.z = Math.PI / 2 - A_MAX;
  scale.position.copy(arc.position);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, ARM_L, 10), std(0xb0bec5, { metalness: 0.8, roughness: 0.25 }));
  arm.position.y = ARM_L / 2;
  armGroup.add(arm);
  armGroup.position.copy(PIVOT);
  scene.add(base, arc, scale, armGroup);
  scene.add(placeLabel(makeLabel(tr('холод', 'суық', 'cold'), { scale: 0.0009, color: '#81d4fa' }), PIVOT.x - 0.42, PIVOT.y + 0.32, PIVOT.z));
  scene.add(placeLabel(makeLabel(tr('жара', 'ыстық', 'hot'), { scale: 0.0009, color: '#ff8a80' }), PIVOT.x + 0.42, PIVOT.y + 0.32, PIVOT.z));
}
const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), std(0xff7043, { emissive: 0xff5722, emissiveIntensity: 0.5, roughness: 0.3 }));
scene.add(knob);
let lever = 0; // 0..1
const DT_MAX = 6;
function leverAngle() { return A_MAX - 2 * A_MAX * lever; }
function placeKnob() {
  const a = leverAngle();
  armGroup.rotation.z = a;
  knob.position.set(PIVOT.x - Math.sin(a) * ARM_L, PIVOT.y + Math.cos(a) * ARM_L, PIVOT.z);
}
function setLever(v) { lever = clamp(v, 0, 1); placeKnob(); }
placeKnob();
lab.hover(knob, () => tr(`Рычаг потепления\n+${(lever * DT_MAX).toFixed(1)} °C — тяните вправо`, `Жылыну тұтқасы\n+${(lever * DT_MAX).toFixed(1)} °C — оңға тартыңыз`, `Warming lever\n+${(lever * DT_MAX).toFixed(1)} °C — pull right`));
lab.grab(knob, {
  onMove: (o) => {
    const p = new THREE.Vector3(); o.getWorldPosition(p);
    const s = clamp(-(p.x - PIVOT.x) / ARM_L, -Math.sin(A_MAX), Math.sin(A_MAX));
    lever = clamp((A_MAX - Math.asin(s)) / (2 * A_MAX), 0, 1);
    armGroup.rotation.z = leverAngle();
    if (o.userData.heldBy === 'mouse') placeKnob();
  },
  onRelease: () => placeKnob(),
});
const warmer = () => setLever(lever + 1 / DT_MAX);
const colder = () => setLever(lever - 1 / DT_MAX);
lab.hud.action(tr('Холоднее −1 °C', 'Суығырақ −1 °C', 'Colder −1 °C'), colder, S2);
lab.hud.action(tr('Теплее +1 °C', 'Жылырақ +1 °C', 'Warmer +1 °C'), warmer, S2);
lab.button3d('−1 °C', [PIVOT.x + 0.55, TOP + 0.09, PIVOT.z], colder, { width: 0.3, color: 0x0288d1 });
lab.button3d('+1 °C', [PIVOT.x + 0.9, TOP + 0.09, PIVOT.z], warmer, { width: 0.3, color: 0xe64a19 });

const thermo2 = thermometer(X0 + 2.05, Z2 + 0.1, 0, 7, [0, 2, 4, 6], ' °C');
lab.hover(thermo2.tube, () => tr(
  `Потепление: +${dTtotal.toFixed(1)} °C\n(рычаг +${(lever * DT_MAX).toFixed(1)}, альбедо +${feedback.toFixed(1)})`,
  `Жылыну: +${dTtotal.toFixed(1)} °C\n(тұтқа +${(lever * DT_MAX).toFixed(1)}, альбедо +${feedback.toFixed(1)})`,
  `Warming: +${dTtotal.toFixed(1)} °C\n(lever +${(lever * DT_MAX).toFixed(1)}, albedo +${feedback.toFixed(1)})`));
const state2Board = lab.board(' ', [X0 + 0.5, 1.95, Z2 - 1.0], { scale: 0.0022 });
scene.add(placeLabel(makeLabel(tr(
  'Альбедо — доля отражённого света.\n' +
  'Лёд ≈ 0.8 — отражает почти всё, вода ≈ 0.06 — почти всё поглощает.\n' +
  'Меньше льда → темнее поверхность → ещё теплее (обратная связь).\n' +
  'Море растёт от талой воды с суши и теплового расширения.',
  'Альбедо — шағылысқан жарықтың үлесі.\n' +
  'Мұз ≈ 0.8 — түгелге жуық шағылыстырады, су ≈ 0.06 — түгелге жуық жұтады.\n' +
  'Мұз азаяды → жер беті қараяды → одан әрі жылынады (кері байланыс).\n' +
  'Теңіз құрлықтың еріген суы мен судың жылулық ұлғаюынан көтеріледі.',
  'Albedo is the fraction of light reflected.\n' +
  'Ice ≈ 0.8 reflects almost everything, water ≈ 0.06 absorbs almost everything.\n' +
  'Less ice → darker surface → even warmer (a feedback loop).\n' +
  'The sea rises from land meltwater and thermal expansion.'), { scale: 0.0019 }), X0 - 0.9, 2.42, Z2 - 1.0));

let ice = 1, dTtotal = 0, feedback = 0, level = LEVEL0, flooded = 0;
const photons2 = createPhotons(THREE, scene, 160);
let sunAcc2 = 0;
const drips = [];
const dripGeo = new THREE.SphereGeometry(0.012, 6, 4);
const dripMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85 });
for (let i = 0; i < 24; i++) { const d = new THREE.Mesh(dripGeo, dripMat); d.visible = false; scene.add(d); drips.push(d); }
const bergs = [];
const bergMat = std(0xf0f8ff, { emissive: 0x9fd4ff, emissiveIntensity: 0.25, flatShading: true });
function glacierFrontX() { return X0 - 1.6 + GL_LEN * glacierPivot.scale.x; }
function glacierTopY() { return F + 0.02 + PLATEAU + GL_H * glacierPivot.scale.y; }
function surfaceAt(x) {
  // Что встретит луч солнца в точке x: лёд, скала, вода или берег.
  if (ice > 0.02 && x < glacierFrontX()) return { kind: 'ice', y: glacierTopY() - 0.05 * (x - (X0 - 1.6)) };
  if (x < X0 - 0.72) return { kind: 'rock', y: F + 0.02 + PLATEAU };
  if (x > X0 + 0.86 && level < SHELF) return { kind: 'land', y: F + 0.02 + SHELF };
  return { kind: 'water', y: F + 0.02 + level };
}
function stepPhoton2(ph) {
  if (ph.p.y > 2.7 || ph.life > 6) return false;
  if (ph.kind === 2) { ph.size *= 0.96; return ph.life < 0.8; } // тепло в воде
  if (ph.kind === 1) return true; // отражённый луч уходит вверх
  const s = surfaceAt(ph.p.x);
  if (ph.p.y > s.y) return true;
  if (s.kind === 'ice' || (s.kind === 'land' && Math.random() < 0.3) || (s.kind === 'rock' && Math.random() < 0.2)) {
    ph.kind = 1; ph.v.y = Math.abs(ph.v.y); ph.p.y = s.y + 0.002;
    ph.color(s.kind === 'ice' ? 0xfff7d6 : 0xffd27a);
    return true;
  }
  if (s.kind === 'water') {
    ph.kind = 2; ph.p.y = s.y; ph.v.set(0, 0.06, 0); ph.size = 0.02; ph.life = 0; ph.color(0xff5a3c);
    return true;
  }
  return false;
}

// =====================================================================
// Цикл
// =====================================================================
let demoDone = false;
lab.setFrame((dt, t) => {
  const at1 = lab.hud.current?.name !== S2;
  // --- станция 1 ---
  sun1.halo.material.opacity = pulse(t, 3, 0.75, 1);
  sunAcc1 += dt * 22;
  while (sunAcc1 > 1) {
    sunAcc1 -= 1;
    const r = 0.95 * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const from = v3(C.x + (Math.random() - 0.5) * 0.12, 2.55, C.z + (Math.random() - 0.5) * 0.12);
    const to = v3(C.x + Math.cos(a) * r, GROUND, C.z + Math.sin(a) * r);
    photons1.spawn(from, to.sub(from).normalize().multiplyScalar(1.3), 0xffe066, 0, 0.013);
  }
  photons1.update(dt, stepPhoton1);
  for (const m of molecules) {
    const u = m.userData;
    if (u.steer > 0) { u.steer -= dt; u.vel.lerp(tmp.subVectors(u.target, m.position).multiplyScalar(0.9), Math.min(1, dt * 3)); }
    m.position.addScaledVector(u.vel, dt);
    u.vel.x += (Math.random() - 0.5) * dt * 0.3; u.vel.z += (Math.random() - 0.5) * dt * 0.3; u.vel.y += (Math.random() - 0.5) * dt * 0.2;
    u.vel.multiplyScalar(1 - dt * 0.4);
    if (u.vel.lengthSq() < 0.004) u.vel.multiplyScalar(1.05);
    const lo = C.y + 0.2, hi = C.y + R * 0.85;
    if (m.position.y < lo) u.vel.y = Math.abs(u.vel.y);
    if (m.position.y > hi) u.vel.y = -Math.abs(u.vel.y);
    const rMax = Math.sqrt(Math.max(0.01, R * R - (m.position.y - C.y) ** 2)) * 0.82;
    tmp.set(m.position.x - C.x, 0, m.position.z - C.z);
    if (tmp.length() > rMax) { tmp.normalize(); u.vel.x -= tmp.x * 0.05; u.vel.z -= tmp.z * 0.05; }
    m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt;
    // Возбуждённая молекула вибрирует — так она и поглощает ИК.
    u.flash = Math.max(0, u.flash - dt * 2.5);
    const wob = u.flash * Math.sin(t * 60) * 0.25;
    m.scale.setScalar(1 + u.flash * 0.5);
    u.a[0].position.x = (u.type === 'co2' ? -0.068 : -0.042) * (1 + wob);
    u.a[1].position.x = (u.type === 'co2' ? 0.068 : 0.042) * (1 - wob);
  }
  for (const c of canisters) {
    if (c.userData.returning && !c.userData.heldBy) {
      c.position.lerp(c.userData.home, Math.min(1, dt * 6));
      if (c.position.distanceTo(c.userData.home) < 0.005) { c.position.copy(c.userData.home); c.userData.returning = false; }
    }
  }
  funnelRing.userData.flash = Math.max(0, (funnelRing.userData.flash ?? 0) - dt);
  funnelRing.material.color.setHSL(0.6 - 0.45 * funnelRing.userData.flash, 0.9, 0.6 + 0.2 * funnelRing.userData.flash);
  funnelRing.scale.setScalar(1 + 0.3 * funnelRing.userData.flash);
  const eq = equilibriumC(co2, h2o);
  T1 += (eq - T1) * Math.min(1, dt / 4);
  thermo1.set(T1, dt);
  const warm = clamp((T1 - 15) / 7, 0, 1);
  domeMat.color.setHSL(0.58 - 0.5 * warm, 0.6, 0.75);
  domeMat.opacity = 0.08 + 0.1 * warm;
  sampleTimer += dt;
  if (sampleTimer > 0.4) {
    sampleTimer = 0;
    samples.push(T1);
    if (samples.length > 120) samples.shift();
    if (at1 || samples.length < 3) drawChart();
  }

  // --- станция 2 ---
  sun2.halo.material.opacity = pulse(t, 3, 0.75, 1);
  sunAcc2 += dt * 16;
  while (sunAcc2 > 1) {
    sunAcc2 -= 1;
    const from = v3(X0 + (Math.random() - 0.5) * 0.12, 2.5, Z2 + (Math.random() - 0.5) * 0.12);
    const to = v3(X0 + (Math.random() - 0.5) * 3.0, F, Z2 + (Math.random() - 0.5) * 0.8);
    photons2.spawn(from, to.sub(from).normalize().multiplyScalar(1.3), 0xffe066, 0, 0.013);
  }
  photons2.update(dt, stepPhoton2);
  const dT = lever * DT_MAX;
  feedback = albedoFeedback(ice);
  dTtotal = dT + feedback;
  const target = iceTarget(dTtotal);
  const prevIce = ice;
  ice += (target - ice) * Math.min(1, dt * (target < ice ? 0.35 : 0.15));
  glacierPivot.visible = ice > 0.02;
  glacierPivot.scale.set(0.2 + 0.8 * ice, 0.15 + 0.85 * ice, 0.7 + 0.3 * ice);
  const rise = seaRise(dTtotal, ice);
  level += (LEVEL0 + rise / M_PER_UNIT - level) * Math.min(1, dt * 1.2);
  water.scale.y = level;
  water.material.emissiveIntensity = 0.4 + 0.08 * Math.sin(t * 1.7);
  gaugeMark.position.set(GAUGE_X - 0.07, F + 0.02 + level, GAUGE_Z + 0.01);
  thermo2.set(dTtotal, dt);
  // Таяние: капли с фронта ледника и откалывающиеся айсберги.
  const melting = prevIce - ice > dt * 0.003;
  for (const d of drips) {
    if (!d.visible && melting && Math.random() < dt * 6) {
      d.visible = true;
      d.position.set(glacierFrontX() - 0.02, glacierTopY() - 0.05 - Math.random() * 0.1, Z2 + (Math.random() - 0.5) * (TD - 0.2));
      d.userData.vy = 0;
    }
    if (d.visible) {
      d.userData.vy -= 3 * dt;
      d.position.y += d.userData.vy * dt;
      d.position.x += dt * 0.08;
      if (d.position.y < F + 0.02 + level) d.visible = false;
    }
  }
  if (melting && ice > 0.05 && bergs.length < 5 && Math.random() < dt * 0.5) {
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 + Math.random() * 0.03, 0), bergMat);
    b.position.set(glacierFrontX() + 0.04, F + 0.02 + level, Z2 + (Math.random() - 0.5) * 0.7);
    b.scale.y = 0.7;
    b.userData.life = 0;
    scene.add(b); bergs.push(b);
  }
  for (let i = bergs.length - 1; i >= 0; i--) {
    const b = bergs[i];
    b.userData.life += dt;
    b.position.x += dt * 0.07;
    b.position.y = F + 0.02 + level + Math.sin(t * 2 + i) * 0.005;
    b.rotation.y += dt * 0.2;
    b.scale.setScalar(Math.max(0.01, 1 - b.userData.life / 10)); b.scale.y *= 0.7;
    if (b.userData.life > 10 || b.position.x > X0 + 0.7) { scene.remove(b); b.geometry.dispose(); bergs.splice(i, 1); }
  }
  // Город: дом считается затопленным, когда вода выше половины стены.
  flooded = 0;
  for (const h of houses) {
    const depth = F + 0.02 + level - h.position.y;
    const k = clamp(depth / h.userData.h, 0, 1);
    if (k > 0.5) flooded++;
    h.userData.mat.color.copy(h.userData.base).lerp(new THREE.Color(0x1e4f7a), k * 0.7);
  }
  lighthouse.material.color.setHSL(0.14, 1, 0.5 + 0.3 * Math.max(0, Math.sin(t * 3)));
  if (!at1 && Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
    state2Board.set(tr(
      `Потепление +${dTtotal.toFixed(1)} °C · лёд ${Math.round(ice * 100)} % · альбедо ${surfaceAlbedo(ice).toFixed(2)}\n` +
      `Уровень моря +${rise.toFixed(1)} м · затоплено домов: ${flooded} из ${houses.length}`,
      `Жылыну +${dTtotal.toFixed(1)} °C · мұз ${Math.round(ice * 100)} % · альбедо ${surfaceAlbedo(ice).toFixed(2)}\n` +
      `Теңіз деңгейі +${rise.toFixed(1)} м · су басқан үйлер: ${houses.length} үйдің ${flooded}`,
      `Warming +${dTtotal.toFixed(1)} °C · ice ${Math.round(ice * 100)} % · albedo ${surfaceAlbedo(ice).toFixed(2)}\n` +
      `Sea level +${rise.toFixed(1)} m · houses flooded: ${flooded} of ${houses.length}`));
  }
  if (!demoDone && !at1) { demoDone = true; state2Board.set(tr('Тяните рычаг вправо — станет теплее', 'Тұтқаны оңға тартыңыз — жылырақ болады', 'Pull the lever right — it will get warmer')); }
});
drawChart();

import { createLab, makeLabel, placeLabel, tr } from '../common.js';
import { PHASES, timing, cycleState, ecgMonitor, liveSign } from './cycle.js';
import { buildHeart } from './heart.js';
import { buildBody, ORGAN } from './body.js';

const S1 = tr('Сердце', 'Жүрек', 'Heart'), S2 = tr('Круги кровообращения', 'Қан айналым шеңберлері', 'Blood circulation');
const BPM = tr('уд/мин', 'соқ/мин', 'bpm');
const CUT = tr('Разрез', 'Кесік', 'Cut open');
const REST_BTN = tr('Покой · 70', 'Тыныштық · 70', 'Rest · 70');
const RUN_BTN = tr('Нагрузка · 140', 'Жүктеме · 140', 'Exercise · 140');
const SPIN = tr('Вращение', 'Айналдыру', 'Rotate');
const RESET = tr('Вернуть сердце', 'Жүректі қайтару', 'Reset heart');
const SMALL = tr('Малый круг', 'Кіші шеңбер', 'Pulmonary circuit');
const BIG = tr('Большой круг', 'Үлкен шеңбер', 'Systemic circuit');
const ON = tr('вкл', 'қосулы', 'on'), OFF = tr('выкл', 'өшірулі', 'off');
const lab = createLab({
  title: tr('Сердце и кровоток', 'Жүрек және қан ағысы', 'Heart and blood flow'),
  hint: tr('Сердце можно взять и повернуть; «Разрез» открывает камеры и клапаны. Монитор ЭКГ идёт в такт с фазами. На второй станции наведите на орган — узнаете, что там происходит с кровью.',
    'Жүректі алып, бұруға болады; «Кесік» камералар мен қақпақшаларды ашады. ЭКГ мониторы фазалармен қатар жүреді. Екінші станцияда ағзаға меңзерді апарыңыз — онда қанмен не болатынын білесіз.',
    'You can grab and turn the heart; "Cut open" reveals the chambers and valves. The ECG monitor keeps time with the phases. At the second station, point at an organ to learn what happens to the blood there.'),
  stations: [
    { name: S1, at: [0, 1.65, 0.9], look: [0, 1.32, -1.2] },
    { name: S2, at: [22, 1.55, -0.3], look: [22, 1.35, -3] },
  ],
  sky: 0x0a0c15, fogFar: 38, floor: 60,
});
const { THREE, scene } = lab;

// ---------- Общие часы сердца ----------
let bpm = 70, bpmTarget = 70, tBeat = 0, tm = timing(bpm);
const MODES = { rest: { bpm: 70, name: tr('Покой', 'Тыныштық', 'Rest') }, run: { bpm: 140, name: tr('Нагрузка', 'Жүктеме', 'Exercise') } };
let mode = 'rest';

// ---------- Станция 1: сердце ----------
const HEART_POS = new THREE.Vector3(0, 1.28, -1.2);
const heart = buildHeart(lab);
const hr = heart.root;
hr.position.copy(HEART_POS);
hr.scale.setScalar(0.4);
hr.rotation.y = 0.12;
scene.add(hr);

// Постамент с подсветкой.
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 48),
  new THREE.MeshStandardMaterial({ color: 0x161c2a, roughness: 0.6, metalness: 0.3 }));
plinth.position.set(0, 0.35, -1.2);
scene.add(plinth);
const halo = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.012, 8, 64),
  new THREE.MeshBasicMaterial({ color: 0xff4a5a, toneMapped: false }));
halo.rotation.x = -Math.PI / 2; halo.position.set(0, 0.71, -1.2);
scene.add(halo);

let phaseName = 'diastole';
const phaseSign = liveSign({ width: 1260, height: 200, scale: 0.0016 });
phaseSign.position.set(0, 2.32, -1.2);
scene.add(phaseSign);
phaseSign.set(PHASES.diastole.name, PHASES.diastole.text, PHASES.diastole.color);

lab.hover(hr, () => `${S1} · ${Math.round(bpm)} ${BPM}\n${PHASES[phaseName].name}\n${tr('Возьмите и поверните. «Разрез» откроет камеры', 'Алып, бұрыңыз. «Кесік» камераларды ашады', 'Grab and turn it. "Cut open" shows the chambers')}`);
const ROT0 = { x: 0, y: 0.12 };
let drag = null, spin = false;
lab.grab(hr, {
  onGrab(o) { if (o.userData.heldBy === 'mouse') drag = { at: o.position.clone(), rx: o.rotation.x, ry: o.rotation.y }; },
  onMove(o) {
    if (o.userData.heldBy !== 'mouse' || !drag) return;
    const d = o.position.clone().sub(drag.at);
    o.rotation.y = drag.ry + d.x * 2.2;
    o.rotation.x = THREE.MathUtils.clamp(drag.rx + d.z * 0.6, -1.1, 1.1);
    o.position.copy(drag.at);
  },
  onRelease() { drag = null; },
});
function resetHeart() {
  hr.position.copy(HEART_POS); hr.rotation.set(ROT0.x, ROT0.y, 0); spin = false;
}
function toggleCut() { heart.setCut(!heart.cutOpen); cutBtn.setText(heart.cutOpen ? tr('Собрать', 'Құрастыру', 'Assemble') : CUT); cutAct.textContent = heart.cutOpen ? tr('Собрать сердце', 'Жүректі құрастыру', 'Assemble heart') : CUT; }
function setMode(m) {
  mode = m; bpmTarget = MODES[m].bpm;
  modeSign.set(`${MODES[m].name} · ${MODES[m].bpm} ${BPM}`, m === 'run'
    ? tr('Мышцам нужно больше O₂: пульс растёт,\nукорачивается в основном диастола.', 'Бұлшықеттерге O₂ көбірек керек: пульс жиілейді,\nнегізінен диастола қысқарады.', 'Muscles need more O₂: the pulse rises,\nmostly diastole gets shorter.')
    : tr('В покое ~60–80 ударов в минуту,\nударный объём ≈ 70 мл.', 'Тыныштықта минутына ~60–80 соққы,\nсоққы көлемі ≈ 70 мл.', 'At rest ~60–80 beats per minute,\nstroke volume ≈ 70 mL.'), m === 'run' ? '#ff8a3d' : '#5bd68a');
}

// ЭКГ-монитор.
const monitor = ecgMonitor();
monitor.position.set(1.3, 1.55, -1.0);
monitor.rotation.y = -0.7;
monitor.traverse((o) => { o.raycast = () => {}; });
scene.add(monitor);
scene.add(placeLabel(makeLabel(tr('ЭКГ · синхронно с сердцем', 'ЭКГ · жүрекпен үйлесімді', 'ECG · in sync with the heart'), { scale: 0.0015 }), 1.3, 1.98, -1.0));

// Пульт слева.
const modeSign = liveSign({ width: 900, height: 200, scale: 0.0013 });
modeSign.position.set(-1.45, 1.92, -0.95);
scene.add(modeSign);
const BTN = { rotY: 0.6 };
lab.button3d(REST_BTN, [-1.45, 1.6, -0.95], () => setMode('rest'), { ...BTN, width: 0.62, color: 0x2e7d32 });
lab.button3d(RUN_BTN, [-1.45, 1.4, -0.95], () => setMode('run'), { ...BTN, width: 0.62, color: 0xe65100 });
const cutBtn = lab.button3d(CUT, [-1.45, 1.2, -0.95], toggleCut, { ...BTN, width: 0.62, color: 0xb71c1c });
lab.button3d(SPIN, [-1.45, 1.0, -0.95], () => { spin = !spin; }, { ...BTN, width: 0.62, color: 0x5c6bc0 });
lab.button3d(RESET, [-1.45, 0.8, -0.95], resetHeart, { ...BTN, width: 0.62, color: 0x455a64 });
const pole = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.04), new THREE.MeshStandardMaterial({ color: 0x161c2a, roughness: 0.7 }));
pole.position.set(-1.47, 1.2, -0.98); pole.rotation.y = 0.6;
scene.add(pole);

lab.hud.action(REST_BTN, () => setMode('rest'));
lab.hud.action(RUN_BTN, () => setMode('run'));
const cutAct = lab.hud.action(CUT, toggleCut, S1);
lab.hud.action(SPIN, () => { spin = !spin; }, S1);
lab.hud.action(RESET, resetHeart, S1);

// ---------- Станция 2: круги кровообращения ----------
const BODY_POS = new THREE.Vector3(22, 0, -3);
const infoSign = liveSign({ width: 1200, height: 200, scale: 0.0010 });
infoSign.position.set(23.2, 2.0, -2.2);
scene.add(infoSign);
infoSign.set(tr('Наведите на орган', 'Ағзаға меңзерді апарыңыз', 'Point at an organ'), tr('Лёгкие, мозг, печень, кишечник, почки, мышцы ног —\nв каждом кровь меняется по-своему.', 'Өкпе, ми, бауыр, ішек, бүйрек, аяқ бұлшықеттері —\nәрқайсысында қан өзінше өзгереді.', 'Lungs, brain, liver, intestines, kidneys, leg muscles —\nblood changes differently in each.'), '#8ab4f8');
const body = buildBody(lab, {
  onOrgan(o) {
    const lung = o.name === ORGAN.lungR || o.name === ORGAN.lungL;
    infoSign.set(o.name, o.text, lung ? '#ff6b7a' : o.name === ORGAN.heart ? '#ff3640' : '#6fb6ff');
  },
});
body.root.position.copy(BODY_POS);
body.root.scale.setScalar(1.5);
scene.add(body.root);

const legend = liveSign({ width: 980, height: 290, scale: 0.0012 });
legend.position.set(20.8, 2.1, -2.4);
scene.add(legend);
{
  // Легенда рисуется один раз, поверх стандартной подложки.
  legend.set(tr('Два круга', 'Екі шеңбер', 'Two circuits'), tr('● Малый: сердце → лёгкие → сердце\n● Большой: сердце → органы → сердце\nКрасный — артериальная кровь (много O₂)\nСиний — венозная (много CO₂)', '● Кіші: жүрек → өкпе → жүрек\n● Үлкен: жүрек → ағзалар → жүрек\nҚызыл — артериялық қан (O₂ көп)\nКөк — веналық қан (CO₂ көп)', '● Pulmonary: heart → lungs → heart\n● Systemic: heart → organs → heart\nRed — arterial blood (rich in O₂)\nBlue — venous blood (rich in CO₂)'), '#ffcc4d');
}
const toggleSmall = () => smallBtn.setText(`${SMALL}: ${body.toggle('small') ? ON : OFF}`);
const toggleBig = () => bigBtn.setText(`${BIG}: ${body.toggle('big') ? ON : OFF}`);
const smallBtn = lab.button3d(`${SMALL}: ${ON}`, [23.15, 1.5, -2.2], toggleSmall, { width: 0.7, color: 0x1565c0, rotY: -0.5 });
const bigBtn = lab.button3d(`${BIG}: ${ON}`, [23.15, 1.28, -2.2], toggleBig, { width: 0.7, color: 0xc62828, rotY: -0.5 });
lab.button3d(REST_BTN, [23.15, 1.06, -2.2], () => setMode('rest'), { width: 0.7, color: 0x2e7d32, rotY: -0.5 });
lab.button3d(RUN_BTN, [23.15, 0.84, -2.2], () => setMode('run'), { width: 0.7, color: 0xe65100, rotY: -0.5 });
lab.hud.action(SMALL, toggleSmall, S2);
lab.hud.action(BIG, toggleBig, S2);

setMode('rest');

// ---------- Цикл ----------
lab.setFrame((rawDt, t) => {
  const dt = Math.max(0, rawDt); // первый кадр rAF бывает «раньше» performance.now()
  bpm += (bpmTarget - bpm) * Math.min(1, dt * 0.8);
  tBeat += dt;
  if (tBeat >= tm.T) { tBeat -= tm.T; tm = timing(bpm); }
  const st = cycleState(Math.min(tBeat, tm.T - 1e-4), tm);
  if (st.phase !== phaseName) {
    phaseName = st.phase;
    const ph = PHASES[phaseName];
    phaseSign.set(ph.name, ph.text, ph.color);
  }
  if (spin && !hr.userData.heldBy) hr.rotation.y += dt * 0.35;
  heart.update(dt, st, bpm);
  monitor.update(dt, tBeat, tm, st, bpm);
  halo.material.color.setHSL(0.99, 1, 0.35 + 0.3 * st.vent);
  body.update(dt, t, st, bpm);
});

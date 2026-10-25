import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildLab, LAYOUT, Display } from './scene/lab.js';
import { Apparatus } from './scene/apparatus.js';
import { SampleView } from './scene/sample.js';
import { Effects } from './scene/particles.js';
import { Probe, DEFAULT_TIPS } from './scene/probes.js';
import { controlPanel, viewPanel, instrumentPanel, graphPanel, modelPanel, guidePanel } from './ui/panels.js';
import { Interaction } from './interaction.js';
import { Sound } from './audio.js';
import { state, actions, initWorker, onChange, preset, setProbes, replayFrame } from './state.js';
import { SceneControls, fieldAt } from './scene/controls3d.js';
import { wristPanel, updateWrist } from './ui/wrist.js';
import { buildDock } from './ui/dock.js';
import { labTick } from './labs.js';
import { presetDensities } from './physics/params.js';
import { tr } from './i18n.js';

// ---------- тексты страницы (index.html) на языке интерфейса ----------
document.title = tr('Термообработка нефтешлама — Tesseract', 'Мұнай шламын термиялық өңдеу — Tesseract', 'Oil sludge thermal treatment — Tesseract');
document.getElementById('hud').innerHTML = `
    <a id="back" href="/labs">← ${tr('Лаборатории', 'Зертханалар', 'Labs')}</a>
    <h1>${tr('VR-лаборатория: термическая обработка нефтешлама', 'VR-зертхана: мұнай шламын термиялық өңдеу', 'VR lab: thermal treatment of oil sludge')}</h1>
    <p>${tr('Наведите на куб — увидите T и состав; клик по кубу ставит термопару. Крутите ручку T₀ и двигайте рычаг U₀ на фене. Справка — <b>?</b>',
    'Текшеге меңзерді апарыңыз — T мен құрамы көрінеді; текшені басса, термопара қойылады. Фендегі T₀ тұтқасын бұрап, U₀ иінтірегін жылжытыңыз. Анықтама — <b>?</b>',
    'Hover over the cube to see T and composition; click the cube to place a thermocouple. Turn the T₀ knob and move the U₀ lever on the heat gun. Help — <b>?</b>')}</p>`;
document.querySelector('#help .card').innerHTML = `
      <h2>${tr('Управление', 'Басқару', 'Controls')}</h2>
      <div class="cols">
        <div><kbd>${tr('Пробел', 'Бос орын', 'Space')}</kbd> ${tr('пуск / пауза', 'іске қосу / кідірту', 'run / pause')}</div><div><kbd>R</kbd> ${tr('сброс образца', 'үлгіні қайта бастау', 'reset sample')}</div>
        <div><kbd>1</kbd>–<kbd>5</kbd> ${tr('режим вида', 'көрініс режимі', 'view mode')}</div><div><kbd>S</kbd> ${tr('сечение', 'қима', 'section')}, <kbd>[</kbd> <kbd>]</kbd> ${tr('сдвиг', 'жылжыту', 'shift')}</div>
        <div><kbd>↑</kbd> <kbd>↓</kbd> T₀ ± 25 °C</div><div><kbd>←</kbd> <kbd>→</kbd> ${tr('перемотка', 'кері айналдыру', 'rewind')}, <kbd>L</kbd> live</div>
        <div><kbd>+</kbd> <kbd>−</kbd> ${tr('ускорение', 'жеделдету', 'speed-up')}</div><div><kbd>?</kbd> ${tr('эта справка', 'осы анықтама', 'this help')}</div>
      </div>
      <p>${tr('<b>Мышь:</b> вращение — левая кнопка по фону, панорама — правая, масштаб — колесо. Наведение на куб — значения в точке, клик — поставить следующую термопару (на срезе — внутрь). Ручку T₀ тяните вверх/вниз, рычаг U₀ — вбок, красная кнопка на фене — пуск. Панели переносятся за заголовок (⠿).',
      '<b>Тінтуір:</b> айналдыру — фонда сол жақ батырма, панорама — оң жақ, масштаб — дөңгелек. Текшеге меңзеу — нүктедегі мәндер, басу — келесі термопараны қою (қимада — ішке). T₀ тұтқасын жоғары/төмен, U₀ иінтірегін бүйірге тартыңыз, фендегі қызыл батырма — іске қосу. Панельдер тақырыбынан (⠿) ұстап жылжытылады.',
      '<b>Mouse:</b> rotate — left button on the background, pan — right, zoom — wheel. Hover over the cube — values at the point, click — place the next thermocouple (inside, on a section). Drag the T₀ knob up/down, the U₀ lever sideways; the red button on the heat gun starts the run. Panels are moved by their title bar (⠿).')}</p>
      <p>${tr('<b>Quest:</b> лазер + курок или щипок пальцами. Посмотрите на левую руку — появится меню (пуск, T₀, U₀, вид, «Панели ко мне»). Левый стик — ходьба, правый — поворот на 30°.',
      '<b>Quest:</b> лазер + шүріппе немесе саусақпен шымшу. Сол қолыңызға қараңыз — мәзір шығады (іске қосу, T₀, U₀, көрініс, «Панельдер маған»). Сол стик — жүру, оң стик — 30°-қа бұрылу.',
      '<b>Quest:</b> laser + trigger or finger pinch. Look at your left hand to open the menu (run, T₀, U₀, view, “Panels to me”). Left stick — walk, right stick — turn by 30°.')}</p>
      <p style="color:#93a1b3">${tr('Нажмите в любом месте, чтобы закрыть.', 'Жабу үшін кез келген жерді басыңыз.', 'Click anywhere to close.')}</p>`;

// ---------- рендер ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(1.0);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const bg = new THREE.Color(0x1b2129);
scene.background = bg;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 60);
camera.position.set(0, 1.62, 0.45);
const dolly = new THREE.Group();
dolly.add(camera);
scene.add(dolly);

scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x4a4f57, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(1.5, 3, 1.2);
scene.add(sun);
const hoodLight = new THREE.PointLight(0xfff4e0, 3, 2.5, 2);
hoodLight.position.set(0, 2.0, -0.85);
scene.add(hoodLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(LAYOUT.sampleCenter);
controls.enableDamping = true;
controls.maxDistance = 4;
controls.minDistance = 0.25;
controls.update();

// ---------- сцена ----------
const { room, shadow } = buildLab(scene);
const apparatus = new Apparatus(scene);
const sample = new SampleView(LAYOUT.sampleSize, state.cfg.N);
sample.group.position.copy(LAYOUT.sampleCenter);
scene.add(sample.group);
const effects = new Effects(scene, apparatus);

// подпись масштаба у образца
const scaleLabel = new Display(0.2, 0.03, 640);
scaleLabel.mesh.position.set(LAYOUT.sampleCenter.x, LAYOUT.grateY - 0.035, LAYOUT.sampleCenter.z + LAYOUT.sampleSize / 2 + 0.06);
scaleLabel.mesh.rotation.x = -0.5;
scene.add(scaleLabel.mesh);
const drawScaleLabel = () => scaleLabel.draw((c, w, h) => {
  c.fillStyle = '#cfe8ff'; c.font = '600 34px Inter, Roboto, sans-serif'; c.textAlign = 'center';
  c.fillText(tr(`куб L = ${(state.cfg.L * 100).toFixed(1)} см · показан ×${(LAYOUT.sampleSize / state.cfg.L).toFixed(1)}  →  поток`, `текше L = ${(state.cfg.L * 100).toFixed(1)} см · ×${(LAYOUT.sampleSize / state.cfg.L).toFixed(1)} үлкейтілген  →  ағын`, `cube L = ${(state.cfg.L * 100).toFixed(1)} cm · shown ×${(LAYOUT.sampleSize / state.cfg.L).toFixed(1)}  →  flow`), w / 2, h / 2 + 15);
});
drawScaleLabel();

const probes = DEFAULT_TIPS.map((_, i) => new Probe(i, scene));
const placeProbes = () => probes.forEach((p, i) => p.setTipLocal(...DEFAULT_TIPS[i]));
placeProbes();
setProbes(probes);

// ---------- панели ----------
const hooks = {
  mode: () => { sample.setMode(state.view.mode); panels.view.dirty = true; panels.wrist.dirty = true; hooks.syncDock?.(); },
  slice: () => { sample.setSlice(state.view.slice, state.view.slicePos); panels.view.dirty = true; hooks.syncDock?.(); },
  probes: placeProbes,
  toggle: () => {},
};
let guide;
const panels = {
  guide: guidePanel(() => {}),
  control: controlPanel(),
  view: viewPanel(hooks),
  instr: instrumentPanel(probes),
  graph: graphPanel(),
  model: modelPanel(),
  wrist: wristPanel({ hooks, summon: () => summonPanels() }),
};
guide = panels.guide;
scene.add(panels.wrist.mesh);
for (const p of Object.values(panels)) p.live = () => state.running;
// дуга вокруг пользователя: угол (град, 0 — вперёд), высота центра
// углы подобраны так, чтобы стенки вытяжного шкафа (x = ±0.78, z ∈ [−1.2, −0.4]) не закрывали панели
const ARC = [['control', -80, 1.68], ['view', -80, 1.08], ['guide', -116, 1.52], ['instr', 78, 1.6], ['graph', 112, 1.5], ['model', 150, 1.5]];
function layoutPanels(cx = 0, cz = 0.05, yaw = 0, R = 1.18, spread = 1) {
  for (const [k, deg, y] of ARC) {
    const a = THREE.MathUtils.degToRad(deg * spread) + yaw;
    const p = panels[k];
    p.mesh.position.set(cx + R * Math.sin(a), y, cz - R * Math.cos(a));
    p.mesh.lookAt(cx, y, cz);
    if (!p.mesh.parent) scene.add(p.mesh);
  }
}
layoutPanels();
// «Панели ко мне»: та же дуга, но вокруг текущего положения головы и плотнее
function summonPanels() {
  const head = interaction.head(new THREE.Vector3());
  const dir = interaction.viewDir(new THREE.Vector3());
  const yaw = Math.atan2(dir.x, -dir.z);
  layoutPanels(head.x, head.z, yaw, 0.95, 0.72);
}

const interaction = new Interaction({ renderer, camera, scene, dolly, controls });
Object.values(panels).forEach((p) => interaction.add(p.mesh));
probes.forEach((p) => interaction.add(p.grabZone));

const sound = new Sound();
interaction.onFirstGesture = () => sound.start();
interaction.onClick = () => sound.click();
interaction.add(panels.wrist.mesh);

// поля для щупа: текущий снимок или кадр перемотки
const getField = (u, v, w) => {
  const f = replayFrame() ?? state.snap;
  return f ? fieldAt(f.T, f.tex, f.N, u, v, w) : null;
};
const sceneControls = new SceneControls({ scene, state, actions, sample, probes, interaction, hooks, getField });

// ---------- ракурсы для ПК ----------
const tween = { t: 1 };
function flyTo(pos, target) {
  Object.assign(tween, { t: 0, p0: camera.position.clone(), q0: controls.target.clone(), p1: pos, q1: target });
}
const views = [
  [tr('Установка', 'Қондырғы', 'Setup'), () => flyTo(new THREE.Vector3(0.12, 1.62, 0.02), LAYOUT.sampleCenter.clone().add(new THREE.Vector3(0, 0.08, 0)))],
  [tr('Лабораторные работы', 'Зертханалық жұмыстар', 'Lab assignments'), () => panelView(panels.guide)],
  [tr('Эксперимент', 'Тәжірибе', 'Experiment'), () => panelView(panels.control)],
  [tr('Вид и сечение', 'Көрініс және қима', 'View and section'), () => panelView(panels.view)],
  [tr('Приборы', 'Аспаптар', 'Instruments'), () => panelView(panels.instr)],
  [tr('Графики', 'Графиктер', 'Charts'), () => panelView(panels.graph)],
  [tr('Модель и уравнения', 'Модель және теңдеулер', 'Model and equations'), () => panelView(panels.model)],
];
function panelView(p) {
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(p.mesh.quaternion);
  const w = p.mesh.geometry.parameters.width;
  flyTo(p.mesh.position.clone().addScaledVector(n, 0.15 + w * 0.95), p.mesh.position.clone());
}
const vbox = document.getElementById('views');
views.forEach(([name, fn]) => { const b = document.createElement('button'); b.textContent = name; b.onclick = fn; vbox.appendChild(b); });
const help = document.getElementById('help');
const toggleHelp = () => help.classList.toggle('show');
help.addEventListener('click', toggleHelp);
buildDock({ hooks, onHelp: toggleHelp });

// ---------- данные ----------
let fresh = false;
const loads = () => {
  const d = presetDensities(preset());
  const S0w = d.m[0] / 1000 / d.porosity;
  let vo = 0; for (let c = 1; c < 5; c++) vo += d.m[c] / 900;
  sample.uniforms.uWaterLoad.value = S0w;
  sample.uniforms.uOilLoad.value = vo / d.porosity;
};
loads();
onChange((what) => {
  if (what === 'snap') fresh = true;
  if (what === 'reset') { loads(); drawScaleLabel(); }
  // перерисовываются только панели, зависящие от изменения
  const deps = { cfg: ['control', 'instr', 'model', 'graph', 'wrist'], speed: ['control', 'wrist'], run: ['control', 'guide', 'wrist'], runs: ['graph'], reset: Object.keys(panels), replay: ['control', 'instr', 'graph', 'wrist'] };
  if (what === 'replay') { replayShown = undefined; fresh = true; }
  for (const k of deps[what] ?? []) panels[k].dirty = true;
  if (what === 'snap' && !state.running) ['control', 'instr', 'graph', 'model'].forEach((k) => { panels[k].dirty = true; });
  if (what === 'run' && !state.running) setTimeout(() => Object.values(panels).forEach((p) => { p.dirty = true; }), 300);
});
initWorker();
// панели рисуются на canvas — перерисовать, когда загрузится шрифт Inter
document.fonts?.ready.then(() => Object.values(panels).forEach((p) => { p.dirty = true; }));

// ---------- режимы входа ----------
let entering = false;
async function enter(mode) {
  if (!navigator.xr || entering || renderer.xr.isPresenting) return;
  entering = true;
  let session;
  try {
    session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'layers'],
    });
  } catch (e) {
    console.warn('XR session failed', e);
    showNote(tr(`Не удалось войти (${mode}): ${e.name}: ${e.message}`, `Кіру мүмкін болмады (${mode}): ${e.name}: ${e.message}`, `Could not enter (${mode}): ${e.name}: ${e.message}`), false);
    entering = false;
    return;
  }
  entering = false;
  sound.start();
  const ar = mode === 'immersive-ar';
  room.visible = !ar;
  scene.background = ar ? null : bg;
  await renderer.xr.setSession(session);
  renderer.xr.setFoveation(1);
  dolly.position.set(0, 0, 0);
  dolly.rotation.set(0, 0, 0);
  camera.position.set(0, 0, 0);
  session.addEventListener('end', () => {
    room.visible = true;
    scene.background = bg;
    dolly.position.set(0, 0, 0);
    dolly.rotation.set(0, 0, 0);
    camera.quaternion.identity();
    interaction.snapReady = true;
    camera.position.set(0, 1.62, 0.45);
    controls.update();
  });
}
const ui = document.getElementById('xr');
let note;
// fade — скрыть через 5 с (на ПК); иначе подсказка остаётся, чтобы в очках была видна причина
function showNote(text, fade) {
  note?.remove();
  note = document.createElement('div');
  note.className = 'note';
  note.textContent = text;
  ui.appendChild(note);
  if (fade) setTimeout(() => { note.style.transition = 'opacity .6s'; note.style.opacity = '0'; setTimeout(() => note.remove(), 700); }, 5000);
}
async function setupButtons() {
  const vr = await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false);
  const ar = await navigator.xr?.isSessionSupported('immersive-ar').catch(() => false);
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = fn; ui.appendChild(b); return b; };
  if (vr) mk(tr('Войти в VR', 'VR-ға кіру', 'Enter VR'), 'primary', () => enter('immersive-vr'));
  if (ar) mk(tr('Смешанная реальность (MR)', 'Аралас шындық (MR)', 'Mixed reality (MR)'), '', () => enter('immersive-ar'));
  if (!vr && !ar) {
    const headset = /OculusBrowser|Quest/i.test(navigator.userAgent);
    if (navigator.xr) {
      // isSessionSupported может ответить false (например, при самоподписанном сертификате) — даём попробовать вручную
      mk(tr('Попробовать войти в VR', 'VR-ға кіріп көру', 'Try entering VR'), 'primary', () => enter('immersive-vr'));
      if (headset) mk(tr('Попробовать MR', 'MR-ды байқап көру', 'Try MR'), '', () => enter('immersive-ar'));
    }
    const why = !window.isSecureContext ? tr('страница не считается защищённой (нужен HTTPS)', 'бет қорғалған деп саналмайды (HTTPS қажет)', 'the page is not a secure context (HTTPS required)')
      : !navigator.xr ? tr('в браузере нет WebXR (navigator.xr отсутствует)', 'браузерде WebXR жоқ (navigator.xr табылмады)', 'the browser has no WebXR (navigator.xr is missing)')
      : tr('браузер ответил, что VR-сессия не поддерживается', 'браузер VR-сессияға қолдау жоқ екенін хабарлады', 'the browser reports that VR sessions are not supported');
    showNote(tr(`VR недоступен: ${why}. Режим ПК (мышь).`, `VR қолжетімсіз: ${why}. ДК режимі (тінтуір).`, `VR unavailable: ${why}. PC mode (mouse).`), !headset);
  }
}
setupButtons();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- цикл ----------
const clock = new THREE.Timer();
let tDisp = 0, tLab = 0, panelRR = 0;
let replayShown; // какой кадр сейчас в 3D-текстуре

renderer.setAnimationLoop(() => {
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();
  if (!renderer.xr.isPresenting) {
    if (tween.t < 1) {
      tween.t = Math.min(1, tween.t + dt / 0.7);
      const e = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - (-2 * tween.t + 2) ** 2 / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.q0, tween.q1, e);
    }
    controls.update();
  }
  interaction.update(dt);

  const s = state.snap;
  const rf = replayFrame();
  if (rf) {
    if (replayShown !== rf) { replayShown = rf; sample.setData(rf.tex, rf.N); }
  } else if (fresh && s) {
    fresh = false;
    sample.setData(s.tex, s.N);
    effects.setSnapshot(s);
  }
  for (const p of probes) p.read(rf ?? s, state);
  sceneControls.update();
  if (!window.__lab?.forceWrist) updateWrist(panels.wrist, interaction, renderer.xr.isPresenting); // forceWrist — отладка на ПК
  sample.uniforms.uTmax.value = Math.max(state.cfg.Tf, 100);
  sample.uniforms.uTamb.value = state.cfg.Tamb;

  effects.update(dt, state);
  apparatus.update(state, s);
  sound.update(state);

  if (now - tDisp > 250) {
    tDisp = now;
    apparatus.drawDisplays(state, s);
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    probes.forEach((p) => p.drawLabel(cam));
  }
  if (now - tLab > 500) {
    tLab = now;
    if (labTick()) guide.dirty = true;
  }
  // не более двух загрузок текстур панелей за кадр, по кругу
  const plist = Object.values(panels);
  let budget = 2;
  for (let k = 0; k < plist.length; k++) {
    const p = plist[(panelRR + k) % plist.length];
    if (!p.mesh.visible) continue;
    if (p.update(now, budget > 0)) budget--;
  }
  panelRR = (panelRR + 1) % plist.length;

  renderer.render(scene, camera);
});

// для отладки из консоли
window.__lab = { state, actions, scene, renderer, sample, effects, probes, panels, camera, controls, interaction, sceneControls, summonPanels };

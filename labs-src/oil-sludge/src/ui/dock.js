// Нижняя панель для ПК и горячие клавиши (дублирует основные органы управления 3D-панелей).
import { state, actions, onChange } from '../state.js';
import { MODES } from '../scene/sample.js';
import { fmt } from './panel.js';
import { tr } from '../i18n.js';

const SPEEDS = [1, 100, 500, 2000, 6000];

export function buildDock({ hooks, onHelp }) {
  const el = document.getElementById('dock');
  el.innerHTML = `
    <div class="grp">
      <button id="d-run" class="big" title="${tr('Пуск / пауза (Пробел)', 'Іске қосу / кідірту (Бос орын)', 'Run / pause (Space)')}">▶</button>
      <button id="d-reset" title="${tr('Сброс (R)', 'Қайта бастау (R)', 'Reset (R)')}">⟲</button>
      <select id="d-speed" title="${tr('Ускорение времени', 'Уақытты жеделдету', 'Time acceleration')}">${SPEEDS.map((v) => `<option value="${v}">×${v}</option>`).join('')}</select>
      <span id="d-time" class="time">0:00:00</span>
    </div>
    <div class="grp">
      <label>T₀ <input id="d-tf" type="range" min="50" max="650" step="5" list="d-tf-l"><b id="d-tf-v"></b></label>
      <datalist id="d-tf-l"><option value="150"><option value="250"><option value="450"></datalist>
      <label>U₀ <input id="d-u" type="range" min="0.3" max="5" step="0.01" list="d-u-l"><b id="d-u-v"></b></label>
      <datalist id="d-u-l"><option value="0.83"><option value="1.6"><option value="2.7"></datalist>
    </div>
    <div class="grp">
      <select id="d-mode" title="${tr('Режим отображения (1–5)', 'Көрсету режимі (1–5)', 'Display mode (1–5)')}">${MODES.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
      <select id="d-slice" title="${tr('Сечение (S)', 'Қима (S)', 'Section (S)')}"><option value="none">${tr('Без сечения', 'Қимасыз', 'No section')}</option><option value="x">${tr('Сечение', 'Қима', 'Section')} X</option><option value="z">${tr('Сечение', 'Қима', 'Section')} Z</option><option value="y">${tr('Сечение', 'Қима', 'Section')} Y</option></select>
      <input id="d-slicepos" type="range" min="0.05" max="0.95" step="0.01" title="${tr('Положение плоскости', 'Жазықтықтың орны', 'Plane position')}">
    </div>
    <div class="grp hist">
      <label title="${tr('Перемотка опыта (← →)', 'Тәжірибені кері айналдыру (← →)', 'Rewind the run (← →)')}">⏪ <input id="d-hist" type="range" min="0" max="0" step="1" value="0"></label>
      <button id="d-live" title="${tr('К текущему моменту (L)', 'Ағымдағы сәтке (L)', 'Back to now (L)')}">Live</button>
      <button id="d-help" title="${tr('Горячие клавиши (?)', 'Жылдам пернелер (?)', 'Keyboard shortcuts (?)')}">?</button>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const run = $('d-run'), speed = $('d-speed'), time = $('d-time'), tf = $('d-tf'), tfv = $('d-tf-v'),
    u = $('d-u'), uv = $('d-u-v'), mode = $('d-mode'), slice = $('d-slice'), sp = $('d-slicepos'), hist = $('d-hist'), live = $('d-live');

  run.onclick = () => actions.setRunning(!state.running);
  $('d-reset').onclick = () => actions.reset();
  speed.onchange = () => actions.setSpeed(+speed.value);
  tf.oninput = () => actions.setLive({ Tf: +tf.value });
  u.oninput = () => {
    let v = +u.value;
    for (const s of [0.83, 1.6, 2.7]) if (Math.abs(v - s) < 0.05) v = s;
    actions.setLive({ U: v });
  };
  mode.onchange = () => { state.view.mode = mode.value; hooks.mode(); };
  slice.onchange = () => { state.view.slice = slice.value; hooks.slice(); };
  sp.oninput = () => { state.view.slicePos = +sp.value; hooks.slice(); };
  hist.oninput = () => actions.setReplay(+hist.value);
  live.onclick = () => actions.setReplay(null);
  $('d-help').onclick = onHelp;

  const sync = () => {
    run.textContent = state.running ? '⏸' : '▶';
    run.classList.toggle('on', state.running);
    speed.value = String(state.speed);
    if (document.activeElement !== tf) tf.value = state.cfg.Tf;
    tfv.textContent = `${state.cfg.Tf.toFixed(0)} °C`;
    if (document.activeElement !== u) u.value = state.cfg.U;
    uv.textContent = `${state.cfg.U.toFixed(2)} ${tr('м/с', 'м/с', 'm/s')}`;
    mode.value = state.view.mode;
    slice.value = state.view.slice;
    sp.value = state.view.slicePos;
    sp.disabled = state.view.slice === 'none';
    const n = state.history.length;
    hist.max = Math.max(0, n - 1);
    hist.disabled = n < 2;
    if (document.activeElement !== hist) hist.value = state.replay ?? Math.max(0, n - 1);
    live.classList.toggle('on', state.replay !== null);
    const t = state.replay !== null ? state.history[state.replay]?.t : state.snap?.t;
    time.textContent = (state.replay !== null ? tr('повтор ', 'қайталау ', 'replay ') : '') + fmt.t(t ?? 0);
  };
  onChange(sync);
  hooks.syncDock = sync;
  sync();

  // горячие клавиши
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      if (e.key !== ' ') return;
      e.target.blur();
    }
    const k = e.key;
    if (k === ' ') { e.preventDefault(); actions.setRunning(!state.running); }
    else if (k === 'r' || k === 'R' || k === 'к' || k === 'К') actions.reset();
    else if (k >= '1' && k <= '5') { state.view.mode = MODES[+k - 1].id; hooks.mode(); }
    else if (k === 's' || k === 'S' || k === 'ы' || k === 'Ы') {
      const order = ['none', 'x', 'z', 'y'];
      state.view.slice = order[(order.indexOf(state.view.slice) + 1) % order.length]; hooks.slice();
    } else if (k === '[' || k === ']') {
      state.view.slicePos = Math.min(0.95, Math.max(0.05, state.view.slicePos + (k === ']' ? 0.05 : -0.05))); hooks.slice();
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      actions.setLive({ Tf: Math.min(650, Math.max(50, state.cfg.Tf + (k === 'ArrowUp' ? 25 : -25))) });
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (state.history.length < 2) return;
      const cur = state.replay ?? state.history.length - 1;
      actions.setReplay(cur + (k === 'ArrowRight' ? 1 : -1));
    } else if (k === 'l' || k === 'L' || k === 'д' || k === 'Д') actions.setReplay(null);
    else if (k === '+' || k === '=') actions.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(state.speed) + 1)]);
    else if (k === '-') actions.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(state.speed) - 1)]);
    else if (k === '?' || k === 'h' || k === 'H') onHelp();
    hooks.syncDock();
  });
}

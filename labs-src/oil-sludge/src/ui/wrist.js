// Меню на запястье: появляется, когда пользователь смотрит на левую руку/контроллер.
import * as THREE from 'three';
import { Panel, THEME, fmt } from './panel.js';
import { state, actions } from '../state.js';
import { MODES } from '../scene/sample.js';

const SPEEDS = [1, 100, 500, 2000, 6000];
const F = THEME.font;

export function wristPanel({ hooks, summon }) {
  const p = new Panel({ width: 0.24, height: 0.19, px: 760 });
  p.movable = false;
  p.autoRefresh = 2;
  p.mesh.userData.owner = 'left';
  p.mesh.renderOrder = 30;
  p.mesh.visible = false;
  const lbl = (s) => () => s();
  p.button(24, 100, 360, 96, lbl(() => (state.running ? '⏸  Пауза' : '▶  Пуск')), () => actions.setRunning(!state.running), { active: () => state.running, color: THEME.ok, size: 36, weight: 700 });
  p.button(400, 100, 160, 96, '⟲', () => actions.reset(), { size: 44 });
  p.button(576, 100, 160, 96, 'Панели ↺', () => summon(), { size: 24 });
  const stepper = (y, name, get, dec, inc, fmtv) => {
    p.button(150, y, 120, 92, '−', dec, { size: 48 });
    p.button(616, y, 120, 92, '+', inc, { size: 48 });
    return { y, name, get, fmtv };
  };
  const rows = [
    stepper(214, 'T₀', () => state.cfg.Tf,
      () => actions.setLive({ Tf: Math.max(50, state.cfg.Tf - 25) }),
      () => actions.setLive({ Tf: Math.min(650, state.cfg.Tf + 25) }), (v) => `${v.toFixed(0)} °C`),
    stepper(324, 'U₀', () => state.cfg.U,
      () => actions.setLive({ U: stepU(state.cfg.U, -1) }),
      () => actions.setLive({ U: stepU(state.cfg.U, +1) }), (v) => `${v.toFixed(2)} м/с`),
  ];
  p.button(24, 434, 400, 92, () => `Вид: ${MODES.find((m) => m.id === state.view.mode)?.name}`, () => {
    const i = MODES.findIndex((m) => m.id === state.view.mode);
    state.view.mode = MODES[(i + 1) % MODES.length].id; hooks.mode();
  }, { size: 26 });
  p.button(440, 434, 296, 92, () => `×${state.speed >= 1000 ? state.speed / 1000 + 'k' : state.speed}  ▸`, () => {
    const i = SPEEDS.indexOf(state.speed);
    actions.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  }, { size: 28 });

  p.draw = (c) => {
    const s = state.snap;
    c.font = `700 52px ${F}`; c.fillStyle = THEME.text; c.textBaseline = 'alphabetic';
    c.fillText(s ? fmt.t(s.t) : '0:00:00', 28, 70);
    c.font = `600 26px ${F}`; c.fillStyle = state.replay !== null ? THEME.warn : THEME.dim;
    c.textAlign = 'right';
    c.fillText(state.replay !== null ? 'ПОВТОР' : state.running ? 'идёт опыт' : 'пауза', 736, 66);
    c.textAlign = 'left';
    for (const r of rows) {
      c.font = `700 34px ${F}`; c.fillStyle = THEME.dim; c.fillText(r.name, 40, r.y + 58);
      c.font = `700 40px ${F}`; c.fillStyle = THEME.text; c.textAlign = 'center';
      c.fillText(r.fmtv(r.get()), 443, r.y + 60); c.textAlign = 'left';
    }
  };
  return p;
}

// шаг скорости с остановкой на значениях из статьи
function stepU(u, dir) {
  const stops = [0.3, 0.5, 0.83, 1.2, 1.6, 2.0, 2.7, 3.5, 5.0];
  if (dir > 0) return stops.find((s) => s > u + 1e-6) ?? 5;
  return [...stops].reverse().find((s) => s < u - 1e-6) ?? 0.3;
}

// Показ меню: левая рука/контроллер перед лицом и в поле взгляда
const _g = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
export function updateWrist(p, interaction, xr) {
  const grip = interaction.grips.left;
  if (!xr || !grip) { p.mesh.visible = false; return; }
  grip.getWorldPosition(_g);
  interaction.head(_h);
  interaction.viewDir(_f);
  _d.copy(_g).sub(_h);
  const dist = _d.length();
  const ang = _d.normalize().angleTo(_f);
  const show = dist < 0.8 && ang < (p.mesh.visible ? 0.75 : 0.55); // гистерезис
  p.mesh.visible = show;
  if (show) {
    p.mesh.position.copy(_g).add(_d.set(0, 0.12, 0));
    p.mesh.lookAt(_h);
  }
}

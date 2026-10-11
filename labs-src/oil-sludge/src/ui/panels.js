// Панели лаборатории.
import { Panel, THEME, roundRect, wrapText, fmt } from './panel.js';
import { state, actions, preset, exportCSV, runLabel } from '../state.js';
import { PRESETS, COMPONENTS, LIMITS, PYRO, EVAP, DRAIN } from '../physics/params.js';
import { MODES } from '../scene/sample.js';
import { PROBE_COLORS } from '../scene/probes.js';
import { LABS, lab } from '../labs.js';

const F = THEME.font;
const text = (c, s, x, y, size = 24, color = THEME.text, weight = 500, align = 'left') => {
  c.font = `${weight} ${size}px ${F}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  c.fillText(s, x, y); c.textAlign = 'left';
};
const section = (c, s, y) => { text(c, s.toUpperCase(), 32, y, 19, THEME.dim, 700); };

// ---------------------------------------------------------------- Эксперимент
export function controlPanel() {
  const p = new Panel({ width: 0.62, height: 0.69, px: 1024, title: 'Эксперимент' });
  p.autoRefresh = 4;
  let pendL = state.cfg.L, pendK = null;
  const kNow = () => pendK ?? state.cfg.kPerm ?? preset().k;

  PRESETS.forEach((pr, i) => p.button(32 + i * 324, 116, 312, 58, pr.name, () => actions.setSample({ presetId: pr.id, kPerm: null }), { active: () => state.cfg.presetId === pr.id, size: 21 }));

  p.slider(32, 196, 460, { label: 'Размер куба L', min: 0.03, max: 0.1, step: 0.005, get: () => pendL, set: (v) => { pendL = v; }, format: (v) => `${(v * 100).toFixed(1)} см`, onRelease: () => { if (pendL !== state.cfg.L) actions.setSample({ L: pendL }); } });
  p.slider(532, 196, 460, { label: 'Проницаемость k', min: 1e-12, max: 1e-10, log: true, get: kNow, set: (v) => { pendK = v; }, format: (v) => `${fmt.sci(v)} м²`, color: THEME.accent2, onRelease: () => { const v = pendK; pendK = null; actions.setSample({ kPerm: v }); } });
  p.slider(32, 290, 960, { label: 'Температура потока T₀', min: 50, max: 650, step: 5, marks: [150, 250, 450], snap: [150, 250, 450], get: () => state.cfg.Tf, set: (v) => actions.setLive({ Tf: v }), format: (v) => `${v.toFixed(0)} °C` });
  p.slider(32, 374, 960, { label: 'Скорость потока U₀', min: 0.3, max: 5, step: 0.01, marks: [0.83, 1.6, 2.7], snap: [0.83, 1.6, 2.7], get: () => state.cfg.U, set: (v) => actions.setLive({ U: v }), format: (v) => `${v.toFixed(2)} м/с` });

  const tg = (x, y, label, key) => p.button(x, y, 472, 54, label, () => actions.setLive({ [key]: !state.cfg[key] }), { active: () => state.cfg[key], color: THEME.accent2, size: 21 });
  tg(32, 478, 'Изоляция боковых граней (статья)', 'insulated');
  tg(520, 478, 'Теплота испарения −ṁL', 'latentHeat');
  tg(32, 542, 'Пиролиз (Аррениус)', 'pyrolysis');
  tg(520, 542, 'Стекание нефти (Дарси)', 'drainage');

  p.button(32, 630, 300, 84, () => (state.running ? '⏸  Пауза' : '▶  Пуск'), () => actions.setRunning(!state.running), { active: () => state.running, color: THEME.ok, size: 32, weight: 700 });
  p.button(348, 630, 220, 84, '⟲  Сброс', () => actions.reset(), { size: 28 });
  [1, 100, 500, 2000, 6000].forEach((v, i) => p.button(584 + i * 84, 650, 76, 50, `×${v >= 1000 ? v / 1000 + 'k' : v}`, () => actions.setSpeed(v), { active: () => state.speed === v, size: 20 }));

  const nH = () => state.history.length;
  p.slider(32, 1032, 760, {
    label: 'Перемотка опыта', min: 0, max: 1, color: THEME.warn,
    get: () => (nH() > 1 ? (state.replay ?? nH() - 1) / (nH() - 1) : 1),
    set: (f) => { if (nH() > 1) actions.setReplay(Math.round(f * (nH() - 1))); },
    format: () => (state.replay !== null ? `повтор ${fmt.t(state.history[state.replay]?.t ?? 0)}` : 'текущий момент'),
  });
  p.button(816, 1030, 176, 62, 'Live ▶', () => actions.setReplay(null), { active: () => state.replay !== null, color: THEME.warn, size: 24 });
  p.draw = (c) => {
    section(c, 'Образец', 104);
    section(c, 'Режим обработки', 288 - 18);
    section(c, 'Физика модели', 466);
    text(c, 'Ускорение времени', 584, 640, 18, THEME.dim, 600);
    const s = state.snap;
    roundRect(c, 32, 744, 960, 248, 16); c.fillStyle = THEME.bg2; c.fill();
    text(c, s ? fmt.t(s.t) : '0:00:00', 56, 812, 56, THEME.text, 700);
    text(c, 'модельное время', 56, 842, 18, THEME.dim);
    if (s) {
      text(c, `фактически ×${Math.round(s.speed || 0)}`, 420, 790, 22, THEME.dim);
      text(c, `шаг dt = ${s.props.dtStable.toFixed(1)} с (устойчивость явной схемы)`, 420, 822, 22, THEME.dim);
      text(c, `сетка ${s.N}³, Δx = ${(s.props.dx * 1000).toFixed(2)} мм`, 420, 854, 22, THEME.dim);
      const eps = s.props.eps;
      text(c, `ε₀ = ${eps.toFixed(2)}`, 56, 912, 34, THEME.accent, 700);
      text(c, 'доля жидкости, которая может испариться при T₀ (T_кип ≤ T₀)', 220, 906, 21, THEME.dim);
      text(c, `ρ = ${s.props.rho.toFixed(0)} кг/м³ · пористость ${(s.props.porosity * 100).toFixed(0)} % · масса ${(s.mass0 * 1000).toFixed(0)} г`, 56, 960, 22, THEME.dim);
    }
  };
  return p;
}

// ---------------------------------------------------------------- Вид
export function viewPanel(hooks) {
  const p = new Panel({ width: 0.5, height: 0.4, px: 1024, title: 'Вид' });
  MODES.forEach((m, i) => p.button(32 + i * 194, 108, 182, 56, m.name, () => { state.view.mode = m.id; hooks.mode(); }, { active: () => state.view.mode === m.id, size: 22 }));
  [['none', 'Без сечения'], ['x', 'Сечение X'], ['z', 'Сечение Z'], ['y', 'Сечение Y']].forEach(([id, name], i) =>
    p.button(32 + i * 242, 218, 230, 54, name, () => { state.view.slice = id; hooks.slice(); }, { active: () => state.view.slice === id, color: THEME.accent2, size: 22 }));
  p.slider(32, 288, 960, { label: 'Положение плоскости', min: 0.05, max: 0.95, step: 0.01, get: () => state.view.slicePos, set: (v) => { state.view.slicePos = v; hooks.slice(); }, format: (v) => `${(v * 100).toFixed(0)} %`, color: THEME.accent2 });
  const tg = (x, w, label, key) => p.button(x, 386, w, 54, label, () => { state.view[key] = !state.view[key]; hooks.toggle?.(key); }, { active: () => state.view[key], color: THEME.ok, size: 22 });
  tg(32, 230, 'Частицы', 'particles');
  tg(274, 230, 'Вытяжка', 'hood');
  tg(516, 230, 'Звук', 'sound');
  p.button(758, 386, 234, 54, 'Термопары ↺', () => hooks.probes(), { size: 22 });
  p.button(32, 454, 472, 54, 'Экспорт CSV (ПК)', () => exportCSV(), { size: 22 });
  p.button(520, 454, 472, 54, 'Очистить сравнение', () => actions.clearRuns(), { size: 22 });
  p.draw = (c) => {
    section(c, 'Режим отображения', 98);
    section(c, 'Сечение образца', 208);
    // легенда
    const y = 560, x = 32, w = 960;
    if (state.view.mode === 'thermal') {
      const g = c.createLinearGradient(x, 0, x + w, 0);
      ['#000004', '#320a5e', '#781c6d', '#bc3754', '#ed6925', '#fbb61a', '#fcffa4'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
      c.fillStyle = g; c.fillRect(x, y, w, 26);
      text(c, `${state.cfg.Tamb} °C`, x, y + 60, 22, THEME.dim);
      text(c, `${Math.max(state.cfg.Tf, 100)} °C`, x + w, y + 60, 22, THEME.dim, 500, 'right');
      text(c, `изотермы через ${Math.max(state.cfg.Tf, 100) > 320 ? 50 : 25} °C`, x + w / 2, y + 60, 22, THEME.dim, 500, 'center');
    } else {
      const leg = {
        real: 'Цвет — из модели: тёмный блеск = нефть, потемнение = влага, светлый = очищенный грунт, чёрный матовый = кокс, свечение — T > 500 °C',
        water: 'Синий — доля воды от исходной (S_w / S_w0)',
        oil: 'Янтарный — доля нефтепродуктов от исходной',
        coke: 'Чёрный — кокс, образовавшийся при пиролизе смол',
      }[state.view.mode];
      c.font = `500 22px ${F}`; c.fillStyle = THEME.dim;
      wrapText(c, leg, x, y + 10, w, 30);
    }
  };
  return p;
}

// ---------------------------------------------------------------- Приборы
export function instrumentPanel(probes) {
  const p = new Panel({ width: 0.5, height: 0.56, px: 1024, title: 'Приборы' });
  p.autoRefresh = 5;
  p.draw = (c) => {
    const s = state.snap;
    section(c, 'Термопары', 110);
    probes.forEach((pr, i) => {
      const x = 32 + (i % 2) * 484, y = 124 + Math.floor(i / 2) * 104;
      roundRect(c, x, y, 476, 92, 14); c.fillStyle = THEME.bg2; c.fill();
      c.fillStyle = PROBE_COLORS[i]; c.fillRect(x, y + 14, 6, 64);
      text(c, `T${i + 1}`, x + 24, y + 58, 28, PROBE_COLORS[i], 700);
      text(c, `${pr.value.toFixed(1)} °C`, x + 240, y + 62, 44, THEME.text, 700, 'center');
      const l = pr.inside ? `${(pr.local.y * 100).toFixed(0)}% высоты` : 'вне образца';
      text(c, l, x + 460, y + 58, 19, THEME.dim, 500, 'right');
    });
    if (state.replay !== null) {
      roundRect(c, 600, 22, 300, 48, 12); c.fillStyle = 'rgba(255,204,77,0.18)'; c.fill();
      text(c, `⏪ повтор ${fmt.t(state.history[state.replay]?.t ?? 0)}`, 750, 55, 24, THEME.warn, 700, 'center');
    }
    if (!s) return;
    let y = 380;
    section(c, 'Весы и баланс массы', y);
    const scaleG = (s.mass + s.acc.drained) * 1000;
    const loss = (1 - (s.mass + s.acc.drained) / s.mass0) * 100;
    text(c, `${scaleG.toFixed(1)} г`, 32, y + 52, 40, THEME.text, 700);
    text(c, `−${loss.toFixed(2)} % (ушло в газовую фазу)`, 270, y + 46, 24, THEME.accent, 600);
    text(c, `стекло в поддон: ${((s.acc.drained / 900) * 1e6).toFixed(1)} мл · кокс: ${(s.coke * 1000).toFixed(1)} г`, 32, y + 88, 22, THEME.dim);

    y = 520;
    section(c, 'Газоанализатор', y);
    const a = state.air;
    const row = (name, duct, room, lim, yy) => {
      text(c, name, 32, yy, 24, THEME.text, 600);
      text(c, state.view.hood ? `${duct.toFixed(duct < 10 ? 2 : 0)}` : '—', 400, yy, 26, THEME.text, 700, 'right');
      const col = room > lim ? THEME.bad : room > lim * 0.5 ? THEME.warn : THEME.ok;
      text(c, `${room.toFixed(room < 10 ? 2 : 0)}`, 660, yy, 26, col, 700, 'right');
      text(c, `ПДК ${lim}`, 990, yy, 22, THEME.dim, 500, 'right');
    };
    text(c, 'мг/м³', 32, y + 36, 19, THEME.dim);
    text(c, 'в вытяжке', 400, y + 36, 19, THEME.dim, 500, 'right');
    text(c, 'в рабочей зоне', 660, y + 36, 19, THEME.dim, 500, 'right');
    row('ЛОС (УВ C1–C10)', a.ductVoc, a.roomVoc, LIMITS.voc, y + 76);
    row('H₂S', a.ductH2s, a.roomH2s, LIMITS.h2s, y + 114);
    if (a.alarm) {
      roundRect(c, 32, y + 134, 960, 50, 12); c.fillStyle = 'rgba(255,93,93,0.18)'; c.fill();
      text(c, '⚠ Превышение ПДК в рабочей зоне — включите вытяжку / СИЗОД', 512, y + 168, 24, THEME.bad, 700, 'center');
    }

    y = 730;
    section(c, 'Выбросы, г/ч', y);
    const r = s.rates;
    const items = [['пар H₂O', r.steam, '#e8f2ff'], ['лёгкие УВ', r.voc, '#7fe0c0'], ['тяж. пары/смола', r.smoke, '#c9a46a'], ['пиролизный газ', r.gas, '#9aa5b5']];
    items.forEach(([n, v, col], i) => {
      const x = 32 + i * 244;
      text(c, (v * 3.6e6).toFixed(v * 3.6e6 < 10 ? 2 : 1), x, y + 52, 32, col, 700);
      text(c, n, x, y + 80, 19, THEME.dim);
    });

    y = 850;
    section(c, 'Энергетический баланс', y);
    const Q = s.acc.Qin / 1000, Ql = s.acc.Qlatent / 1000, Qp = s.acc.Qpyro / 1000;
    text(c, `Подведено ${Q.toFixed(1)} кДж`, 32, y + 46, 26, THEME.text, 700);
    const pct = (v) => (Q > 0 ? (v / Q) * 100 : 0).toFixed(0);
    text(c, `на испарение ${pct(Ql)} % · на пиролиз ${pct(Qp)} % · на нагрев ${pct(Math.max(0, Q - Ql - Qp - s.acc.Qloss / 1000))} %`, 32, y + 84, 22, THEME.dim);
    text(c, `h = ${s.props.h.toFixed(1)} Вт/(м²·К)   Bi = ${s.props.Bi.toFixed(2)}`, 32, y + 120, 22, THEME.accent2, 600);
  };
  return p;
}

// ---------------------------------------------------------------- Графики
// число делений, при котором шаг «круглый» (1, 2, 2.5, 5 × 10^k)
function niceTicks(ymax, pref) {
  for (const n of [pref, 5, 4, 6, 3, 8, 2]) {
    const s = ymax / n, e = 10 ** Math.floor(Math.log10(s)), f = Math.round((s / e) * 1000) / 1000;
    if ([1, 2, 2.5, 5, 10].includes(f)) return n;
  }
  return pref;
}
function axes(c, x0, y0, x1, y1, xmax, ymax, xl, yl, yTicks = 5) {
  yTicks = niceTicks(ymax, yTicks);
  c.strokeStyle = THEME.line; c.lineWidth = 2;
  c.font = `500 19px ${F}`; c.fillStyle = THEME.dim;
  for (let i = 0; i <= yTicks; i++) {
    const y = y1 - ((y1 - y0) * i) / yTicks;
    c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.globalAlpha = i ? 0.5 : 1; c.stroke(); c.globalAlpha = 1;
    c.textAlign = 'right'; c.fillText(fmtTick((ymax * i) / yTicks), x0 - 10, y + 6);
  }
  const xt = niceStep(xmax);
  for (let v = 0; xmax > 0 && v <= xmax + 1e-9; v += xt) {
    const x = x0 + ((x1 - x0) * v) / xmax;
    c.textAlign = 'center'; c.fillText(fmtTick(v), x, y1 + 28);
  }
  c.textAlign = 'right'; c.fillText(xl, x1, y1 + 54);
  c.textAlign = 'left'; c.fillText(yl, x0, y0 - 16);
}
const fmtTick = (v) => (Math.abs(v) >= 10 || v === 0 ? v.toFixed(0) : v.toFixed(1));
function niceStep(max) {
  const raw = max / 6, e = 10 ** Math.floor(Math.log10(raw)), f = raw / e;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
}
function plot(c, ser, fx, fy, x0, y0, x1, y1, xmax, ymax, color, width = 3, dash = []) {
  if (ser.length < 2) return;
  c.save(); c.beginPath(); c.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); c.clip();
  c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash);
  c.beginPath();
  ser.forEach((pt, i) => {
    const x = x0 + ((x1 - x0) * fx(pt)) / xmax, y = y1 - ((y1 - y0) * fy(pt)) / ymax;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  });
  c.stroke(); c.restore();
}
const ceilTo = (v, s) => Math.max(s, Math.ceil(v / s) * s);

export function graphPanel() {
  const p = new Panel({ width: 0.84, height: 0.52, px: 1280, title: 'Графики' });
  p.autoRefresh = 2;
  const tabs = [['temp', 'Температура'], ['mass', 'Масса (ТГА)'], ['fractions', 'Фракции'], ['compare', 'Сравнение']];
  tabs.forEach(([id, name], i) => p.button(220 + i * 236, 22, 224, 50, name, () => { state.view.graph = id; }, { active: () => state.view.graph === id, size: 22 }));
  p.draw = (c) => {
    const ser = state.series;
    const x0 = 100, y0 = 140, x1 = 1230, y1 = 690;
    const tmaxH = Math.max(0.5, ceilTo((ser.at(-1)?.t ?? 0) / 3600, 0.5));
    const g = state.view.graph;
    if (g === 'temp') {
      const ymax = ceilTo(Math.max(state.cfg.Tf, ...ser.map((s) => Math.max(...s.probes))) + 10, 50);
      axes(c, x0, y0, x1, y1, tmaxH, ymax, 't, ч', 'T, °C');
      const yb = y1 - ((y1 - y0) * 100) / ymax;
      c.setLineDash([6, 8]); c.strokeStyle = '#5aa9ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, yb); c.lineTo(x1, yb); c.stroke(); c.setLineDash([]);
      text(c, '100 °C — кипение воды', x0 + 10, yb - 8, 19, '#5aa9ff');
      const yf = y1 - ((y1 - y0) * state.cfg.Tf) / ymax;
      c.setLineDash([14, 8]); c.strokeStyle = THEME.accent; c.beginPath(); c.moveTo(x0, yf); c.lineTo(x1, yf); c.stroke(); c.setLineDash([]);
      text(c, `T₀ = ${state.cfg.Tf} °C (поток)`, x1 - 10, yf - 8, 19, THEME.accent, 600, 'right');
      for (let i = 0; i < 4; i++) plot(c, ser, (s) => s.t / 3600, (s) => s.probes[i], x0, y0, x1, y1, tmaxH, ymax, PROBE_COLORS[i]);
      plot(c, ser, (s) => s.t / 3600, (s) => s.meanT, x0, y0, x1, y1, tmaxH, ymax, '#ffffff', 2, [4, 6]);
      legend(c, [...PROBE_COLORS.map((col, i) => [col, `T${i + 1}`]), ['#ffffff', 'средняя']], x0 + 20, 760);
      replayCursor(c, x0, y0, x1, y1, tmaxH);
    } else if (g === 'mass') {
      const ymax = ceilTo(Math.max(5, ...ser.map((s) => s.loss)) * 1.1, 5);
      axes(c, x0, y0, x1, y1, tmaxH, ymax, 't, ч', 'Потеря массы, %');
      plot(c, ser, (s) => s.t / 3600, (s) => s.loss, x0, y0, x1, y1, tmaxH, ymax, THEME.accent, 4);
      const rmax = Math.max(1e-6, ...ser.map((s) => s.rate));
      plot(c, ser, (s) => s.t / 3600, (s) => (s.rate / rmax) * ymax * 0.9, x0, y0, x1, y1, tmaxH, ymax, THEME.accent2, 2.5);
      text(c, `ДТГ: скорость выделения летучих, макс. ${rmax.toFixed(1)} г/ч`, x1, y0 - 16, 19, THEME.accent2, 600, 'right');
      legend(c, [[THEME.accent, 'ТГ — потеря массы (весы)'], [THEME.accent2, 'ДТГ — скорость (норм.)']], x0 + 20, 760);
      replayCursor(c, x0, y0, x1, y1, tmaxH);
    } else if (g === 'fractions') {
      const last = ser.at(-1);
      const bw = 170, gap = 50, bx0 = x0 + 40;
      axes(c, x0, y0, x1, y1, 0, 100, '', 'Удалено из образца, %', 5);
      COMPONENTS.forEach((comp, i) => {
        const v = last ? last.removal[i] : 0;
        const ev = last ? last.evap[i] : 0;
        const x = bx0 + i * (bw + gap);
        const h = ((y1 - y0) * Math.min(100, v)) / 100;
        roundRect(c, x, y1 - h, bw, Math.max(h, 2), 8); c.fillStyle = comp.color; c.fill();
        text(c, `${v.toFixed(0)} %`, x + bw / 2, y1 - h - 12, 26, THEME.text, 700, 'center');
        text(c, comp.name.split(' (')[0], x + bw / 2, y1 + 32, 20, THEME.text, 600, 'center');
        const sub = comp.TbC !== null ? `T_кип ≈ ${comp.TbC} °C` : 'пиролиз > 400 °C';
        text(c, sub, x + bw / 2, y1 + 58, 18, THEME.dim, 500, 'center');
        const pyro = i === 4 && last ? last.pyroPct : 0;
        const drained = v - ev - pyro;
        let yy = y1 - h + 28;
        if (pyro > 0.5) { text(c, `пиролиз ${pyro.toFixed(0)} %`, x + bw / 2, yy, 17, '#10141a', 700, 'center'); yy += 24; }
        if (i > 0 && last && drained > 0.5) text(c, `стекло ${drained.toFixed(0)} %`, x + bw / 2, yy, 17, '#10141a', 700, 'center');
      });
      if (last) text(c, `кокс: ${last.coke.toFixed(1)} г · стекло: ${last.drainedMl.toFixed(1)} мл`, x1, y0 - 16, 20, THEME.dim, 600, 'right');
    } else {
      const runs = [...state.runs, ...(ser.length ? [{ label: runLabel(state.cfg) + ' (тек.)', series: ser, color: '#ffffff' }] : [])];
      const tm = Math.max(0.5, ceilTo(Math.max(0, ...runs.map((r) => r.series.at(-1)?.t ?? 0)) / 3600, 0.5));
      const mid = 655;
      const ymaxT = ceilTo(Math.max(100, ...runs.map((r) => Math.max(...r.series.map((s) => s.meanT)))) + 10, 50);
      axes(c, x0, y0, mid - 40, y1 - 40, tm, ymaxT, 't, ч', 'Средняя T, °C', 4);
      const ymaxM = ceilTo(Math.max(5, ...runs.map((r) => Math.max(...r.series.map((s) => s.loss)))) * 1.1, 5);
      axes(c, mid + 50, y0, x1, y1 - 40, tm, ymaxM, 't, ч', 'Потеря массы, %', 4);
      runs.forEach((r) => {
        plot(c, r.series, (s) => s.t / 3600, (s) => s.meanT, x0, y0, mid - 40, y1 - 40, tm, ymaxT, r.color, 3);
        plot(c, r.series, (s) => s.t / 3600, (s) => s.loss, mid + 50, y0, x1, y1 - 40, tm, ymaxM, r.color, 3);
      });
      if (!runs.length) text(c, 'Проведите несколько опытов: при «Сбросе» прогон сохраняется сюда', 640, 420, 26, THEME.dim, 500, 'center');
      runs.forEach((r, i) => {
        const x = 40 + (i % 3) * 410, y = 724 + Math.floor(i / 3) * 34;
        c.fillStyle = r.color; c.fillRect(x, y - 14, 26, 6);
        text(c, r.label, x + 36, y - 4, 19, THEME.text);
      });
    }
  };
  return p;
}
// вертикальный курсор момента перемотки
function replayCursor(c, x0, y0, x1, y1, tmaxH) {
  if (state.replay === null) return;
  const t = (state.history[state.replay]?.t ?? 0) / 3600;
  const x = x0 + ((x1 - x0) * t) / tmaxH;
  c.strokeStyle = THEME.warn; c.lineWidth = 3; c.setLineDash([10, 6]);
  c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); c.setLineDash([]);
  text(c, `повтор ${fmt.t(t * 3600)}`, Math.min(x + 8, x1 - 200), y0 + 22, 20, THEME.warn, 700);
}
function legend(c, items, x, y) {
  let xx = x;
  c.font = `500 20px ${F}`;
  items.forEach(([col, name]) => {
    c.fillStyle = col; c.fillRect(xx, y - 12, 30, 6);
    text(c, name, xx + 40, y - 2, 20, THEME.text);
    c.font = `500 20px ${F}`;
    xx += 40 + c.measureText(name).width + 36;
  });
}

// ---------------------------------------------------------------- Модель
const PAGES = ['Уравнения', 'Числа подобия', 'Допущения', 'Источники'];
export function modelPanel() {
  const p = new Panel({ width: 0.66, height: 0.62, px: 1100, title: 'Модель' });
  p.autoRefresh = 1;
  PAGES.forEach((name, i) => p.button(196 + i * 208, 22, 198, 50, name, () => { state.view.modelPage = i; }, { active: () => state.view.modelPage === i, size: 21 }));
  p.draw = (c) => {
    const pg = state.view.modelPage;
    let y = 130;
    const eq = (s, col = THEME.text) => { text(c, s, 48, y, 28, col, 600); y += 44; };
    const note = (s) => { c.font = `500 23px ${F}`; c.fillStyle = THEME.dim; y = wrapText(c, s, 48, y, 1010, 31) + 12; };
    const head = (s) => { y += 10; text(c, s, 32, y, 22, THEME.accent, 700); y += 38; };
    if (pg === 0) {
      head('Энергия (пористая среда, локальное тепловое равновесие)');
      eq('C_eff ∂T/∂t = ∇·(λ_eff ∇T) − Σᵢ ṁᵢ Lᵢ − r_p ΔH_p');
      note('C_eff = Σ mₖcₖ;  λ_eff = Π λₖ^vₖ + 4εσd_pT³·v_g  (геом. среднее + излучение в порах)');
      head('Испарение (Клапейрон–Клаузиус, закон Рауля)');
      eq('ṁᵢ = k_ev f_esc mᵢ · xᵢ p_sat,ᵢ(T)/p_атм');
      eq('p_sat,ᵢ = p_атм · exp[−(LᵢMᵢ/R)(1/T − 1/T_b,ᵢ)]');
      note('При Σ xᵢp_sat,ᵢ ≥ p_атм ячейка кипит: избыток тепла уходит в испарение (метод энтальпии) → плато.');
      head('Пиролиз смол и асфальтенов (Аррениус)');
      eq(`r_p = A·exp(−E/RT)·m_r,   A = ${fmt.sci(PYRO.A)} с⁻¹,  E = ${PYRO.E / 1000} кДж/моль`);
      head('Стекание нефти (Дарси, Кори, Андраде)');
      eq('q = k·k_ro(S_o)/μ_o(T) · ρ_o g,   k_ro = ((S_o − S_or)/(1 − S_or))³');
      head('Граница: поток горячего воздуха снизу');
      eq('−λ ∂T/∂n = h_x (T₀ − T_s),   Nu_x = 0.332 Re_x^½ Pr^⅓');
      note('Модель (1) Калменовой и соавт. — частный случай: λ, C = const, без стока −ṁL, без химии, 2D.');
    } else if (pg === 1) {
      const s = state.snap;
      if (!s) return;
      const P = s.props, a = P.lam / P.C, L = P.L;
      const rows = [
        ['Re_L = U₀L/ν', P.Re.toFixed(0), 'режим пограничного слоя (ламинарный < 5·10⁵)'],
        ['Pr', '0.70', 'число Прандтля воздуха'],
        ['Nu_L = 0.664 Re^½ Pr^⅓', P.Nu.toFixed(1), 'безразмерная теплоотдача'],
        ['h̄ = Nu λ_air / L', `${P.h.toFixed(1)} Вт/(м²К)`, 'средний коэффициент теплоотдачи'],
        ['λ_eff', `${P.lam.toFixed(3)} Вт/(м·К)`, 'эффективная теплопроводность (среднее)'],
        ['C_eff', `${(P.C / 1e6).toFixed(2)} МДж/(м³К)`, 'объёмная теплоёмкость'],
        ['α = λ/C', `${fmt.sci(a)} м²/с`, 'температуропроводность'],
        ['Bi = h̄L/λ', P.Bi.toFixed(2), Bi(P.Bi)],
        ['Fo = αt/L²', ((a * s.t) / (L * L)).toFixed(3), 'безразмерное время (Фурье)'],
        ['t_диф = L²/α', `${((L * L) / a / 3600).toFixed(1)} ч`, 'характерное время прогрева'],
        ['Ste = cΔT/L_w', ((P.C / P.rho) * (state.cfg.Tf - 20) / 2.257e6).toFixed(2), 'отношение явного тепла к скрытому'],
        ['ε₀', P.eps.toFixed(2), 'испаряемая доля жидкости при T₀'],
      ];
      rows.forEach(([n, v, d], i) => {
        const yy = 140 + i * 56;
        if (i % 2 === 0) { c.fillStyle = THEME.bg2; c.fillRect(32, yy - 34, 1036, 52); }
        text(c, n, 48, yy, 24, THEME.text, 600);
        text(c, v, 560, yy, 26, THEME.accent, 700, 'right');
        text(c, d, 590, yy, 20, THEME.dim);
      });
    } else if (pg === 2) {
      [
        '• Сетка 24³ ячеек, явная конечно-разностная схема по теплопроводности (шаг ограничен устойчивостью), источники — расщеплением по процессам.',
        '• Нефть — 4 псевдокомпонента (лёгкие, средние, тяжёлые, смолы и асфальтены) с T_кип 150 / 290 / 430 °C. Теплота испарения — по правилу Трутона.',
        '• Вода и нефть кипят независимо (эффект перегонки с паром не учитывается).',
        `• Пар уходит к ближайшей открытой грани (верх / решётка) квазистационарно: f_esc = 1/(1 + d/δ), δ = ${EVAP.delta * 1000} мм. Давление в порах не рассчитывается.`,
        '• Теплоотдача снизу — ламинарный пограничный слой на пластине (локальный h_x), воздух не остывает вдоль образца.',
        '• Верхняя грань открыта: естественная конвекция и излучение в помещение (20 °C, влажность 50 %) — иначе испарение охлаждало бы образец без предела.',
        `• Стекает только нефтяная фаза под действием тяжести, капиллярность не учитывается; S_or = ${DRAIN.Sor}.`,
        '• Окисление (горение) кокса и УВ не моделируется: среда считается инертной.',
        '• Усадка и растрескивание не учитываются, объём образца постоянен.',
        '• Все параметры — литературные диапазоны. Для количественных выводов нужна калибровка по ТГА и опытам на реальных образцах.',
      ].forEach((s) => note(s));
    } else {
      [
        '1. Balakayeva G., Kalmenova G., Phillips C. Numerical modelling of the process of thermal treatment of oil slime // Int. J. Oil, Gas and Coal Technology. 2023. Vol. 34, No. 2. P. 157–172.',
        '2. Балакаева Г.Т., Калменова Г.Б., Даркенбаев Д.К. Моделирование переработки нефтешламов для минимизации воздействия отходов на окружающую среду // Вестник КазНПУ им. Абая, сер. физ.-мат. 2023. №4(84).',
        '3. Hu G., Li J., Zeng G. Recent development in the treatment of oily sludge from petroleum industry: a review // J. Hazardous Materials. 2013. Vol. 261. P. 470–490.',
        '4. Incropera F.P., DeWitt D.P. Fundamentals of Heat and Mass Transfer — корреляции Nu для пластины, свойства воздуха.',
        '5. Bear J. Dynamics of Fluids in Porous Media — закон Дарси, относительные проницаемости.',
        '6. Voller V.R., Prakash C. (1987) — метод энтальпии для задач с фазовым переходом.',
      ].forEach((s) => note(s));
    }
  };
  return p;
}
const Bi = (b) => (b > 1 ? 'Bi > 1: внутреннее сопротивление доминирует → градиент в образце' : 'Bi < 1: прогрев почти равномерный');

// ---------------------------------------------------------------- Лабораторные работы
export function guidePanel(onChange) {
  const p = new Panel({ width: 0.62, height: 0.68, px: 1024, title: 'Лабораторные работы' });
  p.autoRefresh = 2;
  const rebuild = () => {
    p.clearWidgets();
    const L = LABS.find((l) => l.id === lab.current);
    if (!L) {
      LABS.forEach((l, i) => p.button(32, 112 + i * 92, 960, 78, l.title, () => { lab.current = l.id; lab.step = 0; rebuild(); onChange?.(); }, { size: 26 }));
      return;
    }
    p.button(32, 1006, 300, 64, '← К списку', () => { lab.current = null; rebuild(); });
    p.button(348, 1006, 300, 64, 'Настроить шаг', () => L.steps[lab.step]?.apply?.(), { disabled: () => !L.steps[lab.step]?.apply, color: THEME.accent, size: 24 });
    p.button(664, 1006, 328, 64, 'Пропустить шаг →', () => { if (lab.step < L.steps.length - 1) lab.step++; else lab.done.add(`${L.id}:end`); });
  };
  p.rebuild = rebuild;
  p.draw = (c) => {
    const L = LABS.find((l) => l.id === lab.current);
    if (!L) {
      c.font = `500 21px ${F}`; c.fillStyle = THEME.dim;
      wrapText(c, 'Выберите работу. Каждая повторяет или расширяет вычислительный эксперимент по термической обработке нефтешлама. Шаги отмечаются автоматически. Можно экспериментировать свободно с панелью «Эксперимент».', 32, 112 + LABS.length * 92 + 30, 960, 30);
      return;
    }
    text(c, L.title, 32, 120, 28, THEME.accent, 700);
    c.font = `500 22px ${F}`; c.fillStyle = THEME.dim;
    let y = wrapText(c, L.goal, 32, 162, 960, 30) + 12;
    L.steps.forEach((s, i) => {
      const done = lab.done.has(`${L.id}:${i}`);
      const cur = i === lab.step && !lab.done.has(`${L.id}:end`);
      c.font = `${cur ? 600 : 500} 22px ${F}`;
      const h = measureWrap(c, s.text, 880, 30) + 18;
      if (cur) { roundRect(c, 24, y - 28, 976, h + 6, 12); c.fillStyle = 'rgba(255,138,61,0.14)'; c.fill(); }
      text(c, done ? '✓' : `${i + 1}`, 48, y, 26, done ? THEME.ok : cur ? THEME.accent : THEME.dim, 700, 'center');
      c.font = `${cur ? 600 : 500} 22px ${F}`; c.fillStyle = done ? THEME.dim : THEME.text;
      y = wrapText(c, s.text, 84, y, 900, 30) + 18;
    });
    if (lab.done.has(`${L.id}:end`)) {
      y += 6;
      text(c, 'Вывод', 32, y, 22, THEME.ok, 700); y += 34;
      c.font = `500 21px ${F}`; c.fillStyle = THEME.text;
      wrapText(c, L.conclusion, 32, y, 960, 29);
    }
  };
  rebuild();
  return p;
}
function measureWrap(c, s, maxW, lh) {
  let lines = 0;
  for (const para of s.split('\n')) {
    let line = '';
    lines++;
    for (const w of para.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (c.measureText(t).width > maxW && line) { lines++; line = w; } else line = t;
    }
  }
  return lines * lh;
}

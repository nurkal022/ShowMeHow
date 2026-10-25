// Панели лаборатории.
import { Panel, THEME, roundRect, wrapText, fmt } from './panel.js';
import { state, actions, preset, exportCSV, runLabel } from '../state.js';
import { PRESETS, COMPONENTS, LIMITS, PYRO, EVAP, DRAIN } from '../physics/params.js';
import { MODES } from '../scene/sample.js';
import { PROBE_COLORS } from '../scene/probes.js';
import { LABS, lab } from '../labs.js';
import { tr } from '../i18n.js';

const F = THEME.font;
const text = (c, s, x, y, size = 24, color = THEME.text, weight = 500, align = 'left') => {
  c.font = `${weight} ${size}px ${F}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  c.fillText(s, x, y); c.textAlign = 'left';
};
const section = (c, s, y) => { text(c, s.toUpperCase(), 32, y, 19, THEME.dim, 700); };

// ---------------------------------------------------------------- Эксперимент
export function controlPanel() {
  const p = new Panel({ width: 0.62, height: 0.69, px: 1024, title: tr('Эксперимент', 'Тәжірибе', 'Experiment') });
  p.autoRefresh = 4;
  let pendL = state.cfg.L, pendK = null;
  const kNow = () => pendK ?? state.cfg.kPerm ?? preset().k;

  PRESETS.forEach((pr, i) => p.button(32 + i * 324, 116, 312, 58, pr.name, () => actions.setSample({ presetId: pr.id, kPerm: null }), { active: () => state.cfg.presetId === pr.id, size: 21 }));

  p.slider(32, 196, 460, { label: tr('Размер куба L', 'Текше өлшемі L', 'Cube size L'), min: 0.03, max: 0.1, step: 0.005, get: () => pendL, set: (v) => { pendL = v; }, format: (v) => tr(`${(v * 100).toFixed(1)} см`, `${(v * 100).toFixed(1)} см`, `${(v * 100).toFixed(1)} cm`), onRelease: () => { if (pendL !== state.cfg.L) actions.setSample({ L: pendL }); } });
  p.slider(532, 196, 460, { label: tr('Проницаемость k', 'Өткізгіштік k', 'Permeability k'), min: 1e-12, max: 1e-10, log: true, get: kNow, set: (v) => { pendK = v; }, format: (v) => tr(`${fmt.sci(v)} м²`, `${fmt.sci(v)} м²`, `${fmt.sci(v)} m²`), color: THEME.accent2, onRelease: () => { const v = pendK; pendK = null; actions.setSample({ kPerm: v }); } });
  p.slider(32, 290, 960, { label: tr('Температура потока T₀', 'Ағын температурасы T₀', 'Flow temperature T₀'), min: 50, max: 650, step: 5, marks: [150, 250, 450], snap: [150, 250, 450], get: () => state.cfg.Tf, set: (v) => actions.setLive({ Tf: v }), format: (v) => `${v.toFixed(0)} °C` });
  p.slider(32, 374, 960, { label: tr('Скорость потока U₀', 'Ағын жылдамдығы U₀', 'Flow velocity U₀'), min: 0.3, max: 5, step: 0.01, marks: [0.83, 1.6, 2.7], snap: [0.83, 1.6, 2.7], get: () => state.cfg.U, set: (v) => actions.setLive({ U: v }), format: (v) => tr(`${v.toFixed(2)} м/с`, `${v.toFixed(2)} м/с`, `${v.toFixed(2)} m/s`) });

  const tg = (x, y, label, key) => p.button(x, y, 472, 54, label, () => actions.setLive({ [key]: !state.cfg[key] }), { active: () => state.cfg[key], color: THEME.accent2, size: 21 });
  tg(32, 478, tr('Изоляция боковых граней (статья)', 'Бүйір беттерін оқшаулау (мақала)', 'Insulated side faces (paper)'), 'insulated');
  tg(520, 478, tr('Теплота испарения −ṁL', 'Булану жылуы −ṁL', 'Heat of vaporization −ṁL'), 'latentHeat');
  tg(32, 542, tr('Пиролиз (Аррениус)', 'Пиролиз (Аррениус)', 'Pyrolysis (Arrhenius)'), 'pyrolysis');
  tg(520, 542, tr('Стекание нефти (Дарси)', 'Мұнайдың ағып түсуі (Дарси)', 'Oil drainage (Darcy)'), 'drainage');

  p.button(32, 630, 300, 84, () => (state.running ? tr('⏸  Пауза', '⏸  Кідірту', '⏸  Pause') : tr('▶  Пуск', '▶  Іске қосу', '▶  Run')), () => actions.setRunning(!state.running), { active: () => state.running, color: THEME.ok, size: 32, weight: 700 });
  p.button(348, 630, 220, 84, tr('⟲  Сброс', '⟲  Қайта бастау', '⟲  Reset'), () => actions.reset(), { size: 28 });
  [1, 100, 500, 2000, 6000].forEach((v, i) => p.button(584 + i * 84, 650, 76, 50, `×${v >= 1000 ? v / 1000 + 'k' : v}`, () => actions.setSpeed(v), { active: () => state.speed === v, size: 20 }));

  const nH = () => state.history.length;
  p.slider(32, 1032, 760, {
    label: tr('Перемотка опыта', 'Тәжірибені кері айналдыру', 'Rewind the run'), min: 0, max: 1, color: THEME.warn,
    get: () => (nH() > 1 ? (state.replay ?? nH() - 1) / (nH() - 1) : 1),
    set: (f) => { if (nH() > 1) actions.setReplay(Math.round(f * (nH() - 1))); },
    format: () => (state.replay !== null ? `${tr('повтор', 'қайталау', 'replay')} ${fmt.t(state.history[state.replay]?.t ?? 0)}` : tr('текущий момент', 'ағымдағы сәт', 'current moment')),
  });
  p.button(816, 1030, 176, 62, 'Live ▶', () => actions.setReplay(null), { active: () => state.replay !== null, color: THEME.warn, size: 24 });
  p.draw = (c) => {
    section(c, tr('Образец', 'Үлгі', 'Sample'), 104);
    section(c, tr('Режим обработки', 'Өңдеу режимі', 'Treatment mode'), 288 - 18);
    section(c, tr('Физика модели', 'Модель физикасы', 'Model physics'), 466);
    text(c, tr('Ускорение времени', 'Уақытты жеделдету', 'Time acceleration'), 584, 640, 18, THEME.dim, 600);
    const s = state.snap;
    roundRect(c, 32, 744, 960, 248, 16); c.fillStyle = THEME.bg2; c.fill();
    text(c, s ? fmt.t(s.t) : '0:00:00', 56, 812, 56, THEME.text, 700);
    text(c, tr('модельное время', 'модельдік уақыт', 'model time'), 56, 842, 18, THEME.dim);
    if (s) {
      text(c, tr(`фактически ×${Math.round(s.speed || 0)}`, `нақты ×${Math.round(s.speed || 0)}`, `actual ×${Math.round(s.speed || 0)}`), 420, 790, 22, THEME.dim);
      text(c, tr(`шаг dt = ${s.props.dtStable.toFixed(1)} с (устойчивость явной схемы)`, `dt қадамы = ${s.props.dtStable.toFixed(1)} с (айқын сұлбаның орнықтылығы)`, `step dt = ${s.props.dtStable.toFixed(1)} s (explicit scheme stability)`), 420, 822, 22, THEME.dim);
      text(c, tr(`сетка ${s.N}³, Δx = ${(s.props.dx * 1000).toFixed(2)} мм`, `тор ${s.N}³, Δx = ${(s.props.dx * 1000).toFixed(2)} мм`, `grid ${s.N}³, Δx = ${(s.props.dx * 1000).toFixed(2)} mm`), 420, 854, 22, THEME.dim);
      const eps = s.props.eps;
      text(c, `ε₀ = ${eps.toFixed(2)}`, 56, 912, 34, THEME.accent, 700);
      text(c, tr('доля жидкости, которая может испариться при T₀ (T_кип ≤ T₀)', 'T₀ кезінде булана алатын сұйықтық үлесі (T_қайн ≤ T₀)', 'liquid fraction that can evaporate at T₀ (T_b ≤ T₀)'), 220, 906, 21, THEME.dim);
      text(c, tr(`ρ = ${s.props.rho.toFixed(0)} кг/м³ · пористость ${(s.props.porosity * 100).toFixed(0)} % · масса ${(s.mass0 * 1000).toFixed(0)} г`, `ρ = ${s.props.rho.toFixed(0)} кг/м³ · кеуектілігі ${(s.props.porosity * 100).toFixed(0)} % · массасы ${(s.mass0 * 1000).toFixed(0)} г`, `ρ = ${s.props.rho.toFixed(0)} kg/m³ · porosity ${(s.props.porosity * 100).toFixed(0)} % · mass ${(s.mass0 * 1000).toFixed(0)} g`), 56, 960, 22, THEME.dim);
    }
  };
  return p;
}

// ---------------------------------------------------------------- Вид
export function viewPanel(hooks) {
  const p = new Panel({ width: 0.5, height: 0.4, px: 1024, title: tr('Вид', 'Көрініс', 'View') });
  MODES.forEach((m, i) => p.button(32 + i * 194, 108, 182, 56, m.name, () => { state.view.mode = m.id; hooks.mode(); }, { active: () => state.view.mode === m.id, size: 22 }));
  [['none', tr('Без сечения', 'Қимасыз', 'No section')], ['x', tr('Сечение X', 'X қимасы', 'Section X')], ['z', tr('Сечение Z', 'Z қимасы', 'Section Z')], ['y', tr('Сечение Y', 'Y қимасы', 'Section Y')]].forEach(([id, name], i) =>
    p.button(32 + i * 242, 218, 230, 54, name, () => { state.view.slice = id; hooks.slice(); }, { active: () => state.view.slice === id, color: THEME.accent2, size: 22 }));
  p.slider(32, 288, 960, { label: tr('Положение плоскости', 'Жазықтықтың орны', 'Plane position'), min: 0.05, max: 0.95, step: 0.01, get: () => state.view.slicePos, set: (v) => { state.view.slicePos = v; hooks.slice(); }, format: (v) => `${(v * 100).toFixed(0)} %`, color: THEME.accent2 });
  const tg = (x, w, label, key) => p.button(x, 386, w, 54, label, () => { state.view[key] = !state.view[key]; hooks.toggle?.(key); }, { active: () => state.view[key], color: THEME.ok, size: 22 });
  tg(32, 230, tr('Частицы', 'Бөлшектер', 'Particles'), 'particles');
  tg(274, 230, tr('Вытяжка', 'Сорғыш', 'Exhaust hood'), 'hood');
  tg(516, 230, tr('Звук', 'Дыбыс', 'Sound'), 'sound');
  p.button(758, 386, 234, 54, tr('Термопары ↺', 'Термопаралар ↺', 'Thermocouples ↺'), () => hooks.probes(), { size: 22 });
  p.button(32, 454, 472, 54, tr('Экспорт CSV (ПК)', 'CSV экспорты (ДК)', 'Export CSV (PC)'), () => exportCSV(), { size: 22 });
  p.button(520, 454, 472, 54, tr('Очистить сравнение', 'Салыстыруды тазарту', 'Clear comparison'), () => actions.clearRuns(), { size: 22 });
  p.draw = (c) => {
    section(c, tr('Режим отображения', 'Көрсету режимі', 'Display mode'), 98);
    section(c, tr('Сечение образца', 'Үлгі қимасы', 'Sample section'), 208);
    // легенда
    const y = 560, x = 32, w = 960;
    if (state.view.mode === 'thermal') {
      const g = c.createLinearGradient(x, 0, x + w, 0);
      ['#000004', '#320a5e', '#781c6d', '#bc3754', '#ed6925', '#fbb61a', '#fcffa4'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
      c.fillStyle = g; c.fillRect(x, y, w, 26);
      text(c, `${state.cfg.Tamb} °C`, x, y + 60, 22, THEME.dim);
      text(c, `${Math.max(state.cfg.Tf, 100)} °C`, x + w, y + 60, 22, THEME.dim, 500, 'right');
      text(c, tr(`изотермы через ${Math.max(state.cfg.Tf, 100) > 320 ? 50 : 25} °C`, `изотермалар әр ${Math.max(state.cfg.Tf, 100) > 320 ? 50 : 25} °C сайын`, `isotherms every ${Math.max(state.cfg.Tf, 100) > 320 ? 50 : 25} °C`), x + w / 2, y + 60, 22, THEME.dim, 500, 'center');
    } else {
      const leg = {
        real: tr('Цвет — из модели: тёмный блеск = нефть, потемнение = влага, светлый = очищенный грунт, чёрный матовый = кокс, свечение — T > 500 °C', 'Түсі модельден алынады: күңгірт жылтыр = мұнай, қараю = ылғал, ашық = тазартылған топырақ, қара күңгірт = кокс, жарқырау — T > 500 °C', 'Colour comes from the model: dark gloss = oil, darkening = moisture, light = cleaned soil, matte black = coke, glow — T > 500 °C'),
        water: tr('Синий — доля воды от исходной (S_w / S_w0)', 'Көк — бастапқыға қатысты су үлесі (S_w / S_w0)', 'Blue — water fraction relative to initial (S_w / S_w0)'),
        oil: tr('Янтарный — доля нефтепродуктов от исходной', 'Сарғылт — бастапқыға қатысты мұнай өнімдерінің үлесі', 'Amber — petroleum fraction relative to initial'),
        coke: tr('Чёрный — кокс, образовавшийся при пиролизе смол', 'Қара — шайырлар пиролизі кезінде түзілген кокс', 'Black — coke formed by pyrolysis of resins'),
      }[state.view.mode];
      c.font = `500 22px ${F}`; c.fillStyle = THEME.dim;
      wrapText(c, leg, x, y + 10, w, 30);
    }
  };
  return p;
}

// ---------------------------------------------------------------- Приборы
export function instrumentPanel(probes) {
  const p = new Panel({ width: 0.5, height: 0.56, px: 1024, title: tr('Приборы', 'Аспаптар', 'Instruments') });
  p.autoRefresh = 5;
  p.draw = (c) => {
    const s = state.snap;
    section(c, tr('Термопары', 'Термопаралар', 'Thermocouples'), 110);
    probes.forEach((pr, i) => {
      const x = 32 + (i % 2) * 484, y = 124 + Math.floor(i / 2) * 104;
      roundRect(c, x, y, 476, 92, 14); c.fillStyle = THEME.bg2; c.fill();
      c.fillStyle = PROBE_COLORS[i]; c.fillRect(x, y + 14, 6, 64);
      text(c, `T${i + 1}`, x + 24, y + 58, 28, PROBE_COLORS[i], 700);
      text(c, `${pr.value.toFixed(1)} °C`, x + 240, y + 62, 44, THEME.text, 700, 'center');
      const l = pr.inside ? tr(`${(pr.local.y * 100).toFixed(0)}% высоты`, `биіктіктің ${(pr.local.y * 100).toFixed(0)}%`, `${(pr.local.y * 100).toFixed(0)}% height`) : tr('вне образца', 'үлгіден тыс', 'outside sample');
      text(c, l, x + 460, y + 58, 19, THEME.dim, 500, 'right');
    });
    if (state.replay !== null) {
      roundRect(c, 600, 22, 300, 48, 12); c.fillStyle = 'rgba(255,204,77,0.18)'; c.fill();
      text(c, `⏪ ${tr('повтор', 'қайталау', 'replay')} ${fmt.t(state.history[state.replay]?.t ?? 0)}`, 750, 55, 24, THEME.warn, 700, 'center');
    }
    if (!s) return;
    let y = 380;
    section(c, tr('Весы и баланс массы', 'Таразы және масса балансы', 'Balance and mass budget'), y);
    const scaleG = (s.mass + s.acc.drained) * 1000;
    const loss = (1 - (s.mass + s.acc.drained) / s.mass0) * 100;
    text(c, `${scaleG.toFixed(1)} ${tr('г', 'г', 'g')}`, 32, y + 52, 40, THEME.text, 700);
    text(c, tr(`−${loss.toFixed(2)} % (ушло в газовую фазу)`, `−${loss.toFixed(2)} % (газ фазасына өтті)`, `−${loss.toFixed(2)} % (to the gas phase)`), 270, y + 46, 24, THEME.accent, 600);
    text(c, tr(`стекло в поддон: ${((s.acc.drained / 900) * 1e6).toFixed(1)} мл · кокс: ${(s.coke * 1000).toFixed(1)} г`, `табаққа ағып түсті: ${((s.acc.drained / 900) * 1e6).toFixed(1)} мл · кокс: ${(s.coke * 1000).toFixed(1)} г`, `drained to tray: ${((s.acc.drained / 900) * 1e6).toFixed(1)} ml · coke: ${(s.coke * 1000).toFixed(1)} g`), 32, y + 88, 22, THEME.dim);

    y = 520;
    section(c, tr('Газоанализатор', 'Газ талдағыш', 'Gas analyzer'), y);
    const a = state.air;
    const row = (name, duct, room, lim, yy) => {
      text(c, name, 32, yy, 24, THEME.text, 600);
      text(c, state.view.hood ? `${duct.toFixed(duct < 10 ? 2 : 0)}` : '—', 400, yy, 26, THEME.text, 700, 'right');
      const col = room > lim ? THEME.bad : room > lim * 0.5 ? THEME.warn : THEME.ok;
      text(c, `${room.toFixed(room < 10 ? 2 : 0)}`, 660, yy, 26, col, 700, 'right');
      text(c, `${tr('ПДК', 'ШРК', 'OEL')} ${lim}`, 990, yy, 22, THEME.dim, 500, 'right');
    };
    text(c, tr('мг/м³', 'мг/м³', 'mg/m³'), 32, y + 36, 19, THEME.dim);
    text(c, tr('в вытяжке', 'сорғышта', 'in exhaust'), 400, y + 36, 19, THEME.dim, 500, 'right');
    text(c, tr('в рабочей зоне', 'жұмыс аймағында', 'in work zone'), 660, y + 36, 19, THEME.dim, 500, 'right');
    row(tr('ЛОС (УВ C1–C10)', 'ҰОҚ (КС C1–C10)', 'VOC (HC C1–C10)'), a.ductVoc, a.roomVoc, LIMITS.voc, y + 76);
    row('H₂S', a.ductH2s, a.roomH2s, LIMITS.h2s, y + 114);
    if (a.alarm) {
      roundRect(c, 32, y + 134, 960, 50, 12); c.fillStyle = 'rgba(255,93,93,0.18)'; c.fill();
      text(c, tr('⚠ Превышение ПДК в рабочей зоне — включите вытяжку / СИЗОД', '⚠ Жұмыс аймағында ШРК асты — сорғышты қосыңыз, респиратор киіңіз', '⚠ OEL exceeded in the work zone — turn on the exhaust / wear a respirator'), 512, y + 168, 24, THEME.bad, 700, 'center');
    }

    y = 730;
    section(c, tr('Выбросы, г/ч', 'Шығарындылар, г/сағ', 'Emissions, g/h'), y);
    const r = s.rates;
    const items = [[tr('пар H₂O', 'H₂O буы', 'H₂O steam'), r.steam, '#e8f2ff'], [tr('лёгкие УВ', 'жеңіл КС', 'light HC'), r.voc, '#7fe0c0'], [tr('тяж. пары/смола', 'ауыр бу/шайыр', 'heavy vapour/tar'), r.smoke, '#c9a46a'], [tr('пиролизный газ', 'пиролиз газы', 'pyrolysis gas'), r.gas, '#9aa5b5']];
    items.forEach(([n, v, col], i) => {
      const x = 32 + i * 244;
      text(c, (v * 3.6e6).toFixed(v * 3.6e6 < 10 ? 2 : 1), x, y + 52, 32, col, 700);
      text(c, n, x, y + 80, 19, THEME.dim);
    });

    y = 850;
    section(c, tr('Энергетический баланс', 'Энергия балансы', 'Energy balance'), y);
    const Q = s.acc.Qin / 1000, Ql = s.acc.Qlatent / 1000, Qp = s.acc.Qpyro / 1000;
    text(c, tr(`Подведено ${Q.toFixed(1)} кДж`, `Берілді ${Q.toFixed(1)} кДж`, `Supplied ${Q.toFixed(1)} kJ`), 32, y + 46, 26, THEME.text, 700);
    const pct = (v) => (Q > 0 ? (v / Q) * 100 : 0).toFixed(0);
    text(c, tr(`на испарение ${pct(Ql)} % · на пиролиз ${pct(Qp)} % · на нагрев ${pct(Math.max(0, Q - Ql - Qp - s.acc.Qloss / 1000))} %`, `булануға ${pct(Ql)} % · пиролизге ${pct(Qp)} % · қыздыруға ${pct(Math.max(0, Q - Ql - Qp - s.acc.Qloss / 1000))} %`, `evaporation ${pct(Ql)} % · pyrolysis ${pct(Qp)} % · heating ${pct(Math.max(0, Q - Ql - Qp - s.acc.Qloss / 1000))} %`), 32, y + 84, 22, THEME.dim);
    text(c, `h = ${s.props.h.toFixed(1)} ${tr('Вт/(м²·К)', 'Вт/(м²·К)', 'W/(m²·K)')}   Bi = ${s.props.Bi.toFixed(2)}`, 32, y + 120, 22, THEME.accent2, 600);
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
  const p = new Panel({ width: 0.84, height: 0.52, px: 1280, title: tr('Графики', 'Графиктер', 'Charts') });
  p.autoRefresh = 2;
  const tabs = [['temp', tr('Температура', 'Температура', 'Temperature')], ['mass', tr('Масса (ТГА)', 'Масса (ТГА)', 'Mass (TGA)')], ['fractions', tr('Фракции', 'Фракциялар', 'Fractions')], ['compare', tr('Сравнение', 'Салыстыру', 'Comparison')]];
  tabs.forEach(([id, name], i) => p.button(220 + i * 236, 22, 224, 50, name, () => { state.view.graph = id; }, { active: () => state.view.graph === id, size: 22 }));
  p.draw = (c) => {
    const ser = state.series;
    const x0 = 100, y0 = 140, x1 = 1230, y1 = 690;
    const tmaxH = Math.max(0.5, ceilTo((ser.at(-1)?.t ?? 0) / 3600, 0.5));
    const g = state.view.graph;
    if (g === 'temp') {
      const ymax = ceilTo(Math.max(state.cfg.Tf, ...ser.map((s) => Math.max(...s.probes))) + 10, 50);
      axes(c, x0, y0, x1, y1, tmaxH, ymax, tr('t, ч', 't, сағ', 't, h'), 'T, °C');
      const yb = y1 - ((y1 - y0) * 100) / ymax;
      c.setLineDash([6, 8]); c.strokeStyle = '#5aa9ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, yb); c.lineTo(x1, yb); c.stroke(); c.setLineDash([]);
      text(c, tr('100 °C — кипение воды', '100 °C — судың қайнауы', '100 °C — water boils'), x0 + 10, yb - 8, 19, '#5aa9ff');
      const yf = y1 - ((y1 - y0) * state.cfg.Tf) / ymax;
      c.setLineDash([14, 8]); c.strokeStyle = THEME.accent; c.beginPath(); c.moveTo(x0, yf); c.lineTo(x1, yf); c.stroke(); c.setLineDash([]);
      text(c, tr(`T₀ = ${state.cfg.Tf} °C (поток)`, `T₀ = ${state.cfg.Tf} °C (ағын)`, `T₀ = ${state.cfg.Tf} °C (flow)`), x1 - 10, yf - 8, 19, THEME.accent, 600, 'right');
      for (let i = 0; i < 4; i++) plot(c, ser, (s) => s.t / 3600, (s) => s.probes[i], x0, y0, x1, y1, tmaxH, ymax, PROBE_COLORS[i]);
      plot(c, ser, (s) => s.t / 3600, (s) => s.meanT, x0, y0, x1, y1, tmaxH, ymax, '#ffffff', 2, [4, 6]);
      legend(c, [...PROBE_COLORS.map((col, i) => [col, `T${i + 1}`]), ['#ffffff', tr('средняя', 'орташа', 'mean')]], x0 + 20, 760);
      replayCursor(c, x0, y0, x1, y1, tmaxH);
    } else if (g === 'mass') {
      const ymax = ceilTo(Math.max(5, ...ser.map((s) => s.loss)) * 1.1, 5);
      axes(c, x0, y0, x1, y1, tmaxH, ymax, tr('t, ч', 't, сағ', 't, h'), tr('Потеря массы, %', 'Масса шығыны, %', 'Mass loss, %'));
      plot(c, ser, (s) => s.t / 3600, (s) => s.loss, x0, y0, x1, y1, tmaxH, ymax, THEME.accent, 4);
      const rmax = Math.max(1e-6, ...ser.map((s) => s.rate));
      plot(c, ser, (s) => s.t / 3600, (s) => (s.rate / rmax) * ymax * 0.9, x0, y0, x1, y1, tmaxH, ymax, THEME.accent2, 2.5);
      text(c, tr(`ДТГ: скорость выделения летучих, макс. ${rmax.toFixed(1)} г/ч`, `ДТГ: ұшпа заттардың бөліну жылдамдығы, макс. ${rmax.toFixed(1)} г/сағ`, `DTG: volatiles release rate, max ${rmax.toFixed(1)} g/h`), x1, y0 - 16, 19, THEME.accent2, 600, 'right');
      legend(c, [[THEME.accent, tr('ТГ — потеря массы (весы)', 'ТГ — масса шығыны (таразы)', 'TG — mass loss (balance)')], [THEME.accent2, tr('ДТГ — скорость (норм.)', 'ДТГ — жылдамдық (норм.)', 'DTG — rate (norm.)')]], x0 + 20, 760);
      replayCursor(c, x0, y0, x1, y1, tmaxH);
    } else if (g === 'fractions') {
      const last = ser.at(-1);
      const bw = 170, gap = 50, bx0 = x0 + 40;
      axes(c, x0, y0, x1, y1, 0, 100, '', tr('Удалено из образца, %', 'Үлгіден жойылды, %', 'Removed from sample, %'), 5);
      COMPONENTS.forEach((comp, i) => {
        const v = last ? last.removal[i] : 0;
        const ev = last ? last.evap[i] : 0;
        const x = bx0 + i * (bw + gap);
        const h = ((y1 - y0) * Math.min(100, v)) / 100;
        roundRect(c, x, y1 - h, bw, Math.max(h, 2), 8); c.fillStyle = comp.color; c.fill();
        text(c, `${v.toFixed(0)} %`, x + bw / 2, y1 - h - 12, 26, THEME.text, 700, 'center');
        text(c, comp.name.split(' (')[0], x + bw / 2, y1 + 32, 20, THEME.text, 600, 'center');
        const sub = comp.TbC !== null ? `${tr('T_кип', 'T_қайн', 'T_b')} ≈ ${comp.TbC} °C` : tr('пиролиз > 400 °C', 'пиролиз > 400 °C', 'pyrolysis > 400 °C');
        text(c, sub, x + bw / 2, y1 + 58, 18, THEME.dim, 500, 'center');
        const pyro = i === 4 && last ? last.pyroPct : 0;
        const drained = v - ev - pyro;
        let yy = y1 - h + 28;
        if (pyro > 0.5) { text(c, tr(`пиролиз ${pyro.toFixed(0)} %`, `пиролиз ${pyro.toFixed(0)} %`, `pyrolysis ${pyro.toFixed(0)} %`), x + bw / 2, yy, 17, '#10141a', 700, 'center'); yy += 24; }
        if (i > 0 && last && drained > 0.5) text(c, tr(`стекло ${drained.toFixed(0)} %`, `ағып түсті ${drained.toFixed(0)} %`, `drained ${drained.toFixed(0)} %`), x + bw / 2, yy, 17, '#10141a', 700, 'center');
      });
      if (last) text(c, tr(`кокс: ${last.coke.toFixed(1)} г · стекло: ${last.drainedMl.toFixed(1)} мл`, `кокс: ${last.coke.toFixed(1)} г · ағып түсті: ${last.drainedMl.toFixed(1)} мл`, `coke: ${last.coke.toFixed(1)} g · drained: ${last.drainedMl.toFixed(1)} ml`), x1, y0 - 16, 20, THEME.dim, 600, 'right');
    } else {
      const runs = [...state.runs, ...(ser.length ? [{ label: runLabel(state.cfg) + tr(' (тек.)', ' (ағым.)', ' (cur.)'), series: ser, color: '#ffffff' }] : [])];
      const tm = Math.max(0.5, ceilTo(Math.max(0, ...runs.map((r) => r.series.at(-1)?.t ?? 0)) / 3600, 0.5));
      const mid = 655;
      const ymaxT = ceilTo(Math.max(100, ...runs.map((r) => Math.max(...r.series.map((s) => s.meanT)))) + 10, 50);
      axes(c, x0, y0, mid - 40, y1 - 40, tm, ymaxT, tr('t, ч', 't, сағ', 't, h'), tr('Средняя T, °C', 'Орташа T, °C', 'Mean T, °C'), 4);
      const ymaxM = ceilTo(Math.max(5, ...runs.map((r) => Math.max(...r.series.map((s) => s.loss)))) * 1.1, 5);
      axes(c, mid + 50, y0, x1, y1 - 40, tm, ymaxM, tr('t, ч', 't, сағ', 't, h'), tr('Потеря массы, %', 'Масса шығыны, %', 'Mass loss, %'), 4);
      runs.forEach((r) => {
        plot(c, r.series, (s) => s.t / 3600, (s) => s.meanT, x0, y0, mid - 40, y1 - 40, tm, ymaxT, r.color, 3);
        plot(c, r.series, (s) => s.t / 3600, (s) => s.loss, mid + 50, y0, x1, y1 - 40, tm, ymaxM, r.color, 3);
      });
      if (!runs.length) text(c, tr('Проведите несколько опытов: при «Сбросе» прогон сохраняется сюда', 'Бірнеше тәжірибе жүргізіңіз: «Қайта бастау» кезінде нәтиже осында сақталады', 'Run several experiments: on “Reset” the run is saved here'), 640, 420, 26, THEME.dim, 500, 'center');
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
  text(c, `${tr('повтор', 'қайталау', 'replay')} ${fmt.t(t * 3600)}`, Math.min(x + 8, x1 - 200), y0 + 22, 20, THEME.warn, 700);
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
const PAGES = [tr('Уравнения', 'Теңдеулер', 'Equations'), tr('Числа подобия', 'Ұқсастық сандары', 'Similarity numbers'), tr('Допущения', 'Жорамалдар', 'Assumptions'), tr('Источники', 'Дереккөздер', 'References')];
export function modelPanel() {
  const p = new Panel({ width: 0.66, height: 0.62, px: 1100, title: tr('Модель', 'Модель', 'Model') });
  p.autoRefresh = 1;
  PAGES.forEach((name, i) => p.button(196 + i * 208, 22, 198, 50, name, () => { state.view.modelPage = i; }, { active: () => state.view.modelPage === i, size: 21 }));
  p.draw = (c) => {
    const pg = state.view.modelPage;
    let y = 130;
    const eq = (s, col = THEME.text) => { text(c, s, 48, y, 28, col, 600); y += 44; };
    const note = (s) => { c.font = `500 23px ${F}`; c.fillStyle = THEME.dim; y = wrapText(c, s, 48, y, 1010, 31) + 12; };
    const head = (s) => { y += 10; text(c, s, 32, y, 22, THEME.accent, 700); y += 38; };
    if (pg === 0) {
      head(tr('Энергия (пористая среда, локальное тепловое равновесие)', 'Энергия (кеуекті орта, жергілікті жылулық тепе-теңдік)', 'Energy (porous medium, local thermal equilibrium)'));
      eq('C_eff ∂T/∂t = ∇·(λ_eff ∇T) − Σᵢ ṁᵢ Lᵢ − r_p ΔH_p');
      note(tr('C_eff = Σ mₖcₖ;  λ_eff = Π λₖ^vₖ + 4εσd_pT³·v_g  (геом. среднее + излучение в порах)', 'C_eff = Σ mₖcₖ;  λ_eff = Π λₖ^vₖ + 4εσd_pT³·v_g  (геом. орташа + кеуектердегі сәулелену)', 'C_eff = Σ mₖcₖ;  λ_eff = Π λₖ^vₖ + 4εσd_pT³·v_g  (geom. mean + radiation in pores)'));
      head(tr('Испарение (Клапейрон–Клаузиус, закон Рауля)', 'Булану (Клапейрон–Клаузиус, Рауль заңы)', 'Evaporation (Clausius–Clapeyron, Raoult’s law)'));
      eq(tr('ṁᵢ = k_ev f_esc mᵢ · xᵢ p_sat,ᵢ(T)/p_атм', 'ṁᵢ = k_ev f_esc mᵢ · xᵢ p_sat,ᵢ(T)/p_атм', 'ṁᵢ = k_ev f_esc mᵢ · xᵢ p_sat,ᵢ(T)/p_atm'));
      eq(tr('p_sat,ᵢ = p_атм · exp[−(LᵢMᵢ/R)(1/T − 1/T_b,ᵢ)]', 'p_sat,ᵢ = p_атм · exp[−(LᵢMᵢ/R)(1/T − 1/T_b,ᵢ)]', 'p_sat,ᵢ = p_atm · exp[−(LᵢMᵢ/R)(1/T − 1/T_b,ᵢ)]'));
      note(tr('При Σ xᵢp_sat,ᵢ ≥ p_атм ячейка кипит: избыток тепла уходит в испарение (метод энтальпии) → плато.', 'Σ xᵢp_sat,ᵢ ≥ p_атм болғанда ұяшық қайнайды: артық жылу булануға жұмсалады (энтальпия әдісі) → плато.', 'When Σ xᵢp_sat,ᵢ ≥ p_atm the cell boils: excess heat goes into evaporation (enthalpy method) → plateau.'));
      head(tr('Пиролиз смол и асфальтенов (Аррениус)', 'Шайырлар мен асфальтендердің пиролизі (Аррениус)', 'Pyrolysis of resins and asphaltenes (Arrhenius)'));
      eq(tr(`r_p = A·exp(−E/RT)·m_r,   A = ${fmt.sci(PYRO.A)} с⁻¹,  E = ${PYRO.E / 1000} кДж/моль`, `r_p = A·exp(−E/RT)·m_r,   A = ${fmt.sci(PYRO.A)} с⁻¹,  E = ${PYRO.E / 1000} кДж/моль`, `r_p = A·exp(−E/RT)·m_r,   A = ${fmt.sci(PYRO.A)} s⁻¹,  E = ${PYRO.E / 1000} kJ/mol`));
      head(tr('Стекание нефти (Дарси, Кори, Андраде)', 'Мұнайдың ағып түсуі (Дарси, Кори, Андраде)', 'Oil drainage (Darcy, Corey, Andrade)'));
      eq('q = k·k_ro(S_o)/μ_o(T) · ρ_o g,   k_ro = ((S_o − S_or)/(1 − S_or))³');
      head(tr('Граница: поток горячего воздуха снизу', 'Шекара: астынан ыстық ауа ағыны', 'Boundary: hot air flow from below'));
      eq('−λ ∂T/∂n = h_x (T₀ − T_s),   Nu_x = 0.332 Re_x^½ Pr^⅓');
      note(tr('Модель (1) Калменовой и соавт. — частный случай: λ, C = const, без стока −ṁL, без химии, 2D.', 'Калменова және бірлескен авторлардың (1) моделі — дербес жағдай: λ, C = const, −ṁL ағынсыз, химиясыз, 2D.', 'Model (1) of Kalmenova et al. is a special case: λ, C = const, no −ṁL sink, no chemistry, 2D.'));
    } else if (pg === 1) {
      const s = state.snap;
      if (!s) return;
      const P = s.props, a = P.lam / P.C, L = P.L;
      const rows = [
        ['Re_L = U₀L/ν', P.Re.toFixed(0), tr('режим пограничного слоя (ламинарный < 5·10⁵)', 'шекаралық қабат режимі (ламинарлы < 5·10⁵)', 'boundary-layer regime (laminar < 5·10⁵)')],
        ['Pr', '0.70', tr('число Прандтля воздуха', 'ауаның Прандтль саны', 'Prandtl number of air')],
        ['Nu_L = 0.664 Re^½ Pr^⅓', P.Nu.toFixed(1), tr('безразмерная теплоотдача', 'өлшемсіз жылу беру', 'dimensionless heat transfer')],
        ['h̄ = Nu λ_air / L', `${P.h.toFixed(1)} ${tr('Вт/(м²К)', 'Вт/(м²К)', 'W/(m²K)')}`, tr('средний коэффициент теплоотдачи', 'орташа жылу беру коэффициенті', 'mean heat transfer coefficient')],
        ['λ_eff', `${P.lam.toFixed(3)} ${tr('Вт/(м·К)', 'Вт/(м·К)', 'W/(m·K)')}`, tr('эффективная теплопроводность (среднее)', 'тиімді жылуөткізгіштік (орташа)', 'effective thermal conductivity (mean)')],
        ['C_eff', `${(P.C / 1e6).toFixed(2)} ${tr('МДж/(м³К)', 'МДж/(м³К)', 'MJ/(m³K)')}`, tr('объёмная теплоёмкость', 'көлемдік жылу сыйымдылығы', 'volumetric heat capacity')],
        ['α = λ/C', `${fmt.sci(a)} ${tr('м²/с', 'м²/с', 'm²/s')}`, tr('температуропроводность', 'температура өткізгіштік', 'thermal diffusivity')],
        ['Bi = h̄L/λ', P.Bi.toFixed(2), Bi(P.Bi)],
        ['Fo = αt/L²', ((a * s.t) / (L * L)).toFixed(3), tr('безразмерное время (Фурье)', 'өлшемсіз уақыт (Фурье)', 'dimensionless time (Fourier)')],
        [tr('t_диф = L²/α', 't_диф = L²/α', 't_diff = L²/α'), `${((L * L) / a / 3600).toFixed(1)} ${tr('ч', 'сағ', 'h')}`, tr('характерное время прогрева', 'қызудың сипаттамалық уақыты', 'characteristic heating time')],
        ['Ste = cΔT/L_w', ((P.C / P.rho) * (state.cfg.Tf - 20) / 2.257e6).toFixed(2), tr('отношение явного тепла к скрытому', 'айқын жылудың жасырын жылуға қатынасы', 'ratio of sensible to latent heat')],
        ['ε₀', P.eps.toFixed(2), tr('испаряемая доля жидкости при T₀', 'T₀ кезінде буланатын сұйықтық үлесі', 'evaporable liquid fraction at T₀')],
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
        tr('• Сетка 24³ ячеек, явная конечно-разностная схема по теплопроводности (шаг ограничен устойчивостью), источники — расщеплением по процессам.', '• 24³ ұяшықты тор, жылуөткізгіштік үшін айқын ақырлы-айырымдық сұлба (қадам орнықтылықпен шектелген), көздер — процестер бойынша ыдырату әдісімен.', '• 24³ cell grid, explicit finite-difference scheme for conduction (step limited by stability), sources via operator splitting by process.'),
        tr('• Нефть — 4 псевдокомпонента (лёгкие, средние, тяжёлые, смолы и асфальтены) с T_кип 150 / 290 / 430 °C. Теплота испарения — по правилу Трутона.', '• Мұнай — 4 псевдокомпонент (жеңіл, орташа, ауыр, шайырлар мен асфальтендер), T_қайн 150 / 290 / 430 °C. Булану жылуы — Трутон ережесі бойынша.', '• Oil — 4 pseudo-components (light, medium, heavy, resins and asphaltenes) with T_b 150 / 290 / 430 °C. Heat of vaporization — by Trouton’s rule.'),
        tr('• Вода и нефть кипят независимо (эффект перегонки с паром не учитывается).', '• Су мен мұнай бір-біріне тәуелсіз қайнайды (бумен айдау әсері ескерілмейді).', '• Water and oil boil independently (steam distillation is not modelled).'),
        tr(`• Пар уходит к ближайшей открытой грани (верх / решётка) квазистационарно: f_esc = 1/(1 + d/δ), δ = ${EVAP.delta * 1000} мм. Давление в порах не рассчитывается.`, `• Бу ең жақын ашық бетке (жоғарғы бет / тор) квазистационар түрде шығады: f_esc = 1/(1 + d/δ), δ = ${EVAP.delta * 1000} мм. Кеуектердегі қысым есептелмейді.`, `• Vapour leaves through the nearest open face (top / grate) quasi-steadily: f_esc = 1/(1 + d/δ), δ = ${EVAP.delta * 1000} mm. Pore pressure is not computed.`),
        tr('• Теплоотдача снизу — ламинарный пограничный слой на пластине (локальный h_x), воздух не остывает вдоль образца.', '• Астыңғы жылу беру — пластинадағы ламинарлы шекаралық қабат (жергілікті h_x), ауа үлгі бойымен суымайды.', '• Heat transfer from below — laminar boundary layer on a flat plate (local h_x); the air does not cool along the sample.'),
        tr('• Верхняя грань открыта: естественная конвекция и излучение в помещение (20 °C, влажность 50 %) — иначе испарение охлаждало бы образец без предела.', '• Жоғарғы бет ашық: бөлмеге табиғи конвекция және сәулелену (20 °C, ылғалдылық 50 %) — әйтпесе булану үлгіні шексіз суытар еді.', '• The top face is open: natural convection and radiation to the room (20 °C, 50 % humidity) — otherwise evaporation would cool the sample without limit.'),
        tr(`• Стекает только нефтяная фаза под действием тяжести, капиллярность не учитывается; S_or = ${DRAIN.Sor}.`, `• Ауырлық күшімен тек мұнай фазасы ағып түседі, капиллярлық ескерілмейді; S_or = ${DRAIN.Sor}.`, `• Only the oil phase drains under gravity; capillarity is neglected; S_or = ${DRAIN.Sor}.`),
        tr('• Окисление (горение) кокса и УВ не моделируется: среда считается инертной.', '• Кокс пен КС-тың тотығуы (жануы) модельденбейді: орта инертті деп есептеледі.', '• Oxidation (combustion) of coke and HC is not modelled: the atmosphere is treated as inert.'),
        tr('• Усадка и растрескивание не учитываются, объём образца постоянен.', '• Шөгу мен жарылу ескерілмейді, үлгі көлемі тұрақты.', '• Shrinkage and cracking are neglected; the sample volume is constant.'),
        tr('• Все параметры — литературные диапазоны. Для количественных выводов нужна калибровка по ТГА и опытам на реальных образцах.', '• Барлық параметрлер — әдебиеттегі ауқымдар. Сандық қорытындылар үшін ТГА және нақты үлгілердегі тәжірибелер бойынша калибрлеу қажет.', '• All parameters are literature ranges. Quantitative conclusions require calibration against TGA and experiments on real samples.'),
      ].forEach((s) => note(s));
    } else {
      [
        '1. Balakayeva G., Kalmenova G., Phillips C. Numerical modelling of the process of thermal treatment of oil slime // Int. J. Oil, Gas and Coal Technology. 2023. Vol. 34, No. 2. P. 157–172.',
        '2. Балакаева Г.Т., Калменова Г.Б., Даркенбаев Д.К. Моделирование переработки нефтешламов для минимизации воздействия отходов на окружающую среду // Вестник КазНПУ им. Абая, сер. физ.-мат. 2023. №4(84).',
        '3. Hu G., Li J., Zeng G. Recent development in the treatment of oily sludge from petroleum industry: a review // J. Hazardous Materials. 2013. Vol. 261. P. 470–490.',
        `4. Incropera F.P., DeWitt D.P. Fundamentals of Heat and Mass Transfer — ${tr('корреляции Nu для пластины, свойства воздуха', 'пластина үшін Nu корреляциялары, ауа қасиеттері', 'Nu correlations for a flat plate, air properties')}.`,
        `5. Bear J. Dynamics of Fluids in Porous Media — ${tr('закон Дарси, относительные проницаемости', 'Дарси заңы, салыстырмалы өткізгіштіктер', 'Darcy’s law, relative permeabilities')}.`,
        `6. Voller V.R., Prakash C. (1987) — ${tr('метод энтальпии для задач с фазовым переходом', 'фазалық ауысуы бар есептерге арналған энтальпия әдісі', 'enthalpy method for phase-change problems')}.`,
      ].forEach((s) => note(s));
    }
  };
  return p;
}
const Bi = (b) => (b > 1 ? tr('Bi > 1: внутреннее сопротивление доминирует → градиент в образце', 'Bi > 1: ішкі кедергі басым → үлгіде градиент бар', 'Bi > 1: internal resistance dominates → gradient inside the sample') : tr('Bi < 1: прогрев почти равномерный', 'Bi < 1: қызу дерлік біркелкі', 'Bi < 1: nearly uniform heating'));

// ---------------------------------------------------------------- Лабораторные работы
export function guidePanel(onChange) {
  const p = new Panel({ width: 0.62, height: 0.68, px: 1024, title: tr('Лабораторные работы', 'Зертханалық жұмыстар', 'Lab assignments') });
  p.autoRefresh = 2;
  const rebuild = () => {
    p.clearWidgets();
    const L = LABS.find((l) => l.id === lab.current);
    if (!L) {
      LABS.forEach((l, i) => p.button(32, 112 + i * 92, 960, 78, l.title, () => { lab.current = l.id; lab.step = 0; rebuild(); onChange?.(); }, { size: 26 }));
      return;
    }
    p.button(32, 1006, 300, 64, tr('← К списку', '← Тізімге', '← To list'), () => { lab.current = null; rebuild(); });
    p.button(348, 1006, 300, 64, tr('Настроить шаг', 'Қадамды баптау', 'Set up step'), () => L.steps[lab.step]?.apply?.(), { disabled: () => !L.steps[lab.step]?.apply, color: THEME.accent, size: 24 });
    p.button(664, 1006, 328, 64, tr('Пропустить шаг →', 'Қадамды өткізу →', 'Skip step →'), () => { if (lab.step < L.steps.length - 1) lab.step++; else lab.done.add(`${L.id}:end`); });
  };
  p.rebuild = rebuild;
  p.draw = (c) => {
    const L = LABS.find((l) => l.id === lab.current);
    if (!L) {
      c.font = `500 21px ${F}`; c.fillStyle = THEME.dim;
      wrapText(c, tr('Выберите работу. Каждая повторяет или расширяет вычислительный эксперимент по термической обработке нефтешлама. Шаги отмечаются автоматически. Можно экспериментировать свободно с панелью «Эксперимент».', 'Жұмысты таңдаңыз. Әрқайсысы мұнай шламын термиялық өңдеу бойынша есептеу тәжірибесін қайталайды немесе кеңейтеді. Қадамдар автоматты түрде белгіленеді. «Тәжірибе» панелімен еркін тәжірибе жасауға болады.', 'Choose an assignment. Each one repeats or extends the computational experiment on thermal treatment of oil sludge. Steps are checked off automatically. You can also experiment freely with the “Experiment” panel.'), 32, 112 + LABS.length * 92 + 30, 960, 30);
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
      text(c, tr('Вывод', 'Қорытынды', 'Conclusion'), 32, y, 22, THEME.ok, 700); y += 34;
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

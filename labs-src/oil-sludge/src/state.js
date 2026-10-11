// Состояние приложения, связь с потоком физики, запись прогонов, газоанализатор.
import { DataUtils } from 'three';
import { PRESETS, LIMITS } from './physics/params.js';

export const RUN_COLORS = ['#ff8a3d', '#3dc3ff', '#5bd68a', '#c77dff', '#ffcc4d', '#ff5d8f'];

export const state = {
  cfg: {
    presetId: 'pit', L: 0.05, Tf: 250, U: 1.6, Tamb: 20, N: 24,
    insulated: true, latentHeat: true, pyrolysis: true, drainage: true, evaporation: true, kPerm: null,
  },
  running: false,
  speed: 2000,
  view: { mode: 'real', slice: 'none', slicePos: 0.5, particles: true, hood: true, sound: true, graph: 'temp', modelPage: 0 },
  snap: null,
  air: { ductVoc: 0, ductH2s: 0, roomVoc: 0, roomH2s: 0, maxRoomH2s: 0, maxRoomVoc: 0 },
  series: [],     // текущий прогон
  runs: [],       // архив прогонов для сравнения
  history: [],    // ключевые кадры полей текущего опыта (для перемотки)
  replay: null,   // индекс просматриваемого кадра или null (живой режим)
  events: new Set(),
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const emit = (what) => listeners.forEach((fn) => fn(what));

export const preset = () => PRESETS.find((p) => p.id === state.cfg.presetId) ?? PRESETS[0];

let worker;
let gen = 0; // поколение образца: снимки от прежнего образца отбрасываются
export function initWorker() {
  worker = new Worker(new URL('./physics/sim.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => onSnap(e.data);
  worker.postMessage({ type: 'init', cfg: { ...state.cfg }, gen });
  worker.postMessage({ type: 'speed', speed: state.speed });
}

const sanitize = (c) => ({ ...c });

export const actions = {
  setRunning(v) {
    state.running = v;
    if (v && state.replay !== null) { state.replay = null; emit('replay'); }
    worker.postMessage({ type: 'run', running: v });
    emit('run');
  },
  setSpeed(v) { state.speed = v; worker.postMessage({ type: 'speed', speed: v }); emit('speed'); },
  // параметры, меняемые на лету
  setLive(patch) {
    Object.assign(state.cfg, patch);
    worker.postMessage({ type: 'live', cfg: sanitize(state.cfg) });
    emit('cfg');
  },
  // параметры, требующие нового образца
  setSample(patch) {
    archiveRun(); // прогон сохраняется с прежними параметрами
    Object.assign(state.cfg, patch);
    actions.reset(true);
  },
  reset(archived = false) {
    if (!archived) archiveRun();
    state.series = [];
    state.history = [];
    state.replay = null;
    lastKeyT = -1;
    state.air = { ductVoc: 0, ductH2s: 0, roomVoc: 0, roomH2s: 0, maxRoomH2s: 0, maxRoomVoc: 0 };
    state.snap = null;
    lastRecT = -1;
    lastSnapT = 0;
    gen++;
    worker.postMessage({ type: 'reset', cfg: sanitize(state.cfg), gen });
    actions.setRunning(false);
    emit('reset');
  },
  clearRuns() { state.runs = []; emit('runs'); },
  // перемотка: i — индекс кадра истории, null — вернуться к текущему моменту
  setReplay(i) {
    if (i !== null) {
      if (!state.history.length) return;
      i = Math.max(0, Math.min(state.history.length - 1, Math.round(i)));
      if (state.running) actions.setRunning(false);
      if (i === state.history.length - 1 && state.replay === null) return;
    }
    state.replay = i;
    emit('replay');
  },
};

// ---- приём снимков ----
let lastRecT = -1;
let lastSnapT = 0;
function onSnap(s) {
  let maxT = -1e9;
  for (let i = 0; i < s.T.length; i++) if (s.T[i] > maxT) maxT = s.T[i];
  s.maxT = maxT;
  if (s.gen !== gen) return; // запоздалый снимок от прежнего образца
  state.snap = s;
  updateAir(s, Math.max(0, s.t - lastSnapT));
  lastSnapT = s.t;
  record(s);
  keyframe(s);
  emit('snap');
}

// Газоанализатор: концентрация в воздуховоде вытяжки и в рабочей зоне (модель полного перемешивания)
//   V dC/dt = (1−η)·G − Q·C,  C_duct = η·G/Q_hood
const ROOM = { V: 60, ach: 3, Qhood: 0.3, capture: 0.995 };
function updateAir(s, dtSim) {
  const a = state.air;
  const gVoc = (s.rates.voc + s.rates.gas + s.rates.smoke) * 1e6; // мг/с
  const gH2s = s.rates.h2s * 1e6;
  const hood = state.view.hood;
  const eta = hood ? ROOM.capture : 0;
  const Q = ROOM.ach * ROOM.V / 3600;
  a.ductVoc = hood ? (eta * gVoc) / ROOM.Qhood : 0;
  a.ductH2s = hood ? (eta * gH2s) / ROOM.Qhood : 0;
  if (dtSim > 0) {
    const k = Q / ROOM.V, e = Math.exp(-k * dtSim);
    const ssVoc = ((1 - eta) * gVoc) / Q, ssH2s = ((1 - eta) * gH2s) / Q;
    a.roomVoc = ssVoc + (a.roomVoc - ssVoc) * e;
    a.roomH2s = ssH2s + (a.roomH2s - ssH2s) * e;
    a.maxRoomVoc = Math.max(a.maxRoomVoc, a.roomVoc);
    a.maxRoomH2s = Math.max(a.maxRoomH2s, a.roomH2s);
  }
  a.alarm = a.roomH2s > LIMITS.h2s || a.roomVoc > LIMITS.voc;
}

export function seriesPoint(s, probes) {
  const loss = (1 - s.mass / s.mass0) * 100;
  return {
    t: s.t,
    probes: probes.map((p) => p.value),
    meanT: s.meanT,
    maxT: s.maxT,
    loss,
    removal: s.comp.map((m, i) => (s.comp0[i] > 0 ? (1 - m / s.comp0[i]) * 100 : 0)),
    evap: s.acc.evap.map((m, i) => (s.comp0[i] > 0 ? (m / s.comp0[i]) * 100 : 0)),
    rate: (s.rates.steam + s.rates.voc + s.rates.smoke + s.rates.gas) * 3.6e6, // г/ч
    drainedMl: (s.acc.drained / 900) * 1e6,
    coke: s.coke * 1000,
    pyroPct: s.comp0[4] > 0 ? ((s.acc.pyroGas + s.acc.tar + s.coke) / s.comp0[4]) * 100 : 0,
    Qin: s.acc.Qin / 1000,
  };
}

// ---- история для перемотки ----
let lastKeyT = -1;
function keyframe(s) {
  if (s.t <= 0) return;
  const step = Math.max(30, s.t / 160);
  if (s.t - lastKeyT < step) return;
  lastKeyT = s.t;
  state.history.push({ t: s.t, N: s.N, tex: s.tex.slice() });
  if (state.history.length > 240) state.history = state.history.filter((_, i) => i % 2 === 0 || i === state.history.length - 1);
}
// температура кадра истории (из канала R половинной точности), с кэшем
let decoded = { frame: null, T: null };
export function replayFrame() {
  if (state.replay === null) return null;
  const f = state.history[state.replay];
  if (!f) return null;
  if (decoded.frame !== f) {
    const n = f.N ** 3, T = new Float32Array(n);
    for (let p = 0; p < n; p++) T[p] = DataUtils.fromHalfFloat(f.tex[4 * p]);
    decoded = { frame: f, T };
  }
  return { ...f, T: decoded.T };
}

let probesRef = [];
export const setProbes = (p) => { probesRef = p; };

function record(s) {
  if (s.t <= 0) return;
  const step = Math.max(10, Math.min(120, s.t / 400));
  if (s.t - lastRecT < step) return;
  lastRecT = s.t;
  const pt = seriesPoint(s, probesRef);
  // ДТГ — по приращению массы между записями (гладко, не зависит от разбиения шага)
  const prev = state.series[state.series.length - 1];
  const mg = (s.mass + s.acc.drained) * 1000;
  pt.massG = mg;
  if (prev) pt.rate = Math.max(0, ((prev.massG - mg) / (s.t - prev.t)) * 3600);
  state.series.push(pt);
  if (state.series.length > 1500) state.series = state.series.filter((_, i) => i % 2 === 0 || i === state.series.length - 1);
}

export function runLabel(cfg) {
  const p = PRESETS.find((x) => x.id === cfg.presetId);
  return `${Math.round(cfg.Tf)}°C · ${cfg.U.toFixed(2)} м/с · ${(cfg.L * 100).toFixed(0)} см${cfg.latentHeat ? '' : ' · без L'}${p && p.id !== 'pit' ? ' · ' + p.name.split(' ')[0] : ''}`;
}

function archiveRun() {
  if (state.series.length < 3) return;
  const last = state.series[state.series.length - 1];
  if (last.t < 300) return;
  state.runs.push({
    label: runLabel(state.cfg), cfg: { ...state.cfg }, series: state.series, tEnd: last.t,
    color: RUN_COLORS[state.runs.length % RUN_COLORS.length],
  });
  if (state.runs.length > 6) state.runs.shift();
  state.runs.forEach((r, i) => { r.color = RUN_COLORS[i % RUN_COLORS.length]; });
  emit('runs');
}

// все прогоны, включая текущий — для проверок в лабораторных
export function allRuns() {
  const cur = state.series.length ? [{ cfg: { ...state.cfg }, tEnd: state.series[state.series.length - 1].t, series: state.series, current: true }] : [];
  return [...state.runs, ...cur];
}

export function exportCSV() {
  const rows = [['run', 't_s', 'T1', 'T2', 'T3', 'T4', 'T_mean', 'mass_loss_pct', 'water_rem', 'light_rem', 'medium_rem', 'heavy_rem', 'resid_rem', 'drained_ml', 'coke_g', 'Qin_kJ']];
  const all = [...state.runs.map((r) => [r.label, r.series]), [runLabel(state.cfg) + ' (текущий)', state.series]];
  for (const [label, ser] of all) for (const p of ser) {
    rows.push([label, p.t.toFixed(0), ...p.probes.map((v) => v.toFixed(2)), p.meanT.toFixed(2), p.loss.toFixed(3), ...p.removal.map((v) => v.toFixed(2)), p.drainedMl.toFixed(2), p.coke.toFixed(3), p.Qin.toFixed(2)]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = 'oil-sludge-vr-lab.csv';
  a.click();
}

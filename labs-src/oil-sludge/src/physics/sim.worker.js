// Физика в отдельном потоке: рендер в очках не зависит от стоимости расчёта.
import { DataUtils } from 'three';
import { Sim } from './solver.js';
import { NC, PRESETS } from './params.js';

let sim = null;
let gen = 0;
let running = false;
let speed = 2000;          // модельных секунд за реальную секунду
let lastReal = performance.now();
const CHUNK = 20;          // с — фиксированный шаг расщепления (результат не зависит от ускорения)
let carry = 0;             // накопленное, ещё не просчитанное модельное время
let needSnap = true;       // снимок нужен после сброса/изменения параметров
const BUDGET_MS = 30;      // бюджет счёта на тик

function build(cfg) {
  const preset = PRESETS.find((p) => p.id === cfg.presetId) ?? PRESETS[0];
  sim = new Sim({ N: cfg.N ?? 24, ...cfg, preset });
}

function snapshot(achievedSpeed) {
  const { n, N } = sim;
  const tex = new Uint16Array(n * 4);
  const T = new Float32Array(n);
  const m0w = sim.m0[0], m0o = sim.m0[1] + sim.m0[2] + sim.m0[3] + sim.m0[4];
  const cokeMax = Math.max(1e-9, 0.4 * sim.m0[4]);
  const h = DataUtils.toHalfFloat;
  for (let p = 0; p < n; p++) {
    const Tc = sim.T[p] - 273.15;
    T[p] = Tc;
    const w = m0w > 0 ? sim.m[p] / m0w : 0;
    const o = m0o > 0 ? (sim.m[n + p] + sim.m[2 * n + p] + sim.m[3 * n + p] + sim.m[4 * n + p]) / m0o : 0;
    tex[4 * p] = h(Tc);
    tex[4 * p + 1] = h(w);
    tex[4 * p + 2] = h(o);
    tex[4 * p + 3] = h(Math.min(1, sim.coke[p] / cokeMax));
  }
  const cols = N * N;
  const emitTop = new Float32Array(4 * cols), emitBot = new Float32Array(4 * cols);
  for (let g = 0; g < 4; g++) { emitTop.set(sim.emitTop[g], g * cols); emitBot.set(sim.emitBot[g], g * cols); }
  const drip = new Float32Array(sim.dripCols);
  const comp = [];
  for (let c = 0; c < NC; c++) comp.push(sim.componentMass(c));
  const comp0 = sim.m0.map((v) => v * sim.Vc * n);
  const a = sim.acc;
  const msg = {
    type: 'snap', gen, t: sim.t, N, running, speed: achievedSpeed,
    T, tex, emitTop, emitBot, drip,
    rates: { ...sim.rates },
    acc: { evap: [...a.evap], pyroGas: a.pyroGas, tar: a.tar, h2s: a.h2s, drained: a.drained, Qin: a.Qin, Qlatent: a.Qlatent, Qpyro: a.Qpyro, Qloss: a.Qloss },
    mass: sim.totalMass(), mass0: sim.mass0, comp, comp0, coke: sim.cokeMass(),
    meanT: sim.mean(sim.T) - 273.15,
    props: {
      h: sim.hMean, Bi: sim.Bi, Re: sim.ReL, Nu: sim.NuL, lam: sim.lamMean,
      C: sim.mean(sim.C), dtStable: sim.dtStable ?? sim.stableDt(), substeps: sim.lastSubsteps ?? 0,
      rho: sim.rhoBulk0, porosity: sim.porosity, k: sim.k, eps: sim.evaporableFraction(),
      dx: sim.dx, L: sim.cfg.L,
    },
  };
  postMessage(msg, [T.buffer, tex.buffer, emitTop.buffer, emitBot.buffer, drip.buffer]);
}

function tick() {
  const now = performance.now();
  const realDt = Math.min(0.25, (now - lastReal) / 1000);
  lastReal = now;
  let achieved = 0;
  if (sim && running) {
    // шаг расщепления: не больше CHUNK; при малом ускорении меньше — для плавности
    const chunk = Math.min(CHUNK, Math.max(0.5, speed * 0.05));
    carry = Math.min(carry + realDt * speed, 40 * chunk);
    const t0 = performance.now();
    const tStart = sim.t;
    while (carry >= chunk && performance.now() - t0 < BUDGET_MS) {
      sim.step(chunk);
      carry -= chunk;
    }
    achieved = realDt > 0 ? (sim.t - tStart) / realDt : 0;
  }
  // на паузе снимки не шлются (кроме первого после изменения)
  if (sim && (running || needSnap)) { snapshot(achieved); needSnap = false; }
  setTimeout(tick, 50);
}

onmessage = (e) => {
  const d = e.data;
  switch (d.type) {
    case 'init':
    case 'reset': gen = d.gen; build(d.cfg); carry = 0; needSnap = true; break;
    case 'live': if (sim) { sim.configure(d.cfg); sim.updateBC(); } needSnap = true; break; // параметры без сброса (T_f, U, флаги)
    case 'run': running = d.running; lastReal = performance.now(); needSnap = true; break;
    case 'speed': speed = d.speed; break;
  }
};

tick();

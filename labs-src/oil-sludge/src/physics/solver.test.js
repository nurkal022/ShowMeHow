import { describe, it, expect } from 'vitest';
import { Sim } from './solver.js';
import { PRESETS, PYRO, R, T0K, COMPONENTS } from './params.js';

// erf — Абрамовиц–Стиган 7.1.26
function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

const inert = { preset: null, m0: [0, 0, 0, 0, 0], solid0: 1500 };

describe('теплопроводность', () => {
  it('совпадает с аналитическим решением для полубесконечного тела (T_s = const)', () => {
    const lam = 0.5, C = 2e6, alpha = lam / C;
    const sim = new Sim({ N: 40, L: 0.1, Tf: 200, Tamb: 20, ...inert });
    sim.updateProps = function () { this.C.fill(C); this.lam.fill(lam); };
    sim.updateBC = function () { this.hx.fill(1e7); };
    sim.reset();
    const tEnd = 1800;
    for (let t = 0; t < tEnd; t += 60) sim.step(60);
    let maxErr = 0;
    for (let j = 0; j < 15; j++) {
      const y = (j + 0.5) * sim.dx;
      const exact = 200 + (20 - 200) * erf(y / (2 * Math.sqrt(alpha * tEnd)));
      const num = sim.T[sim.idx(5, j, 5)] - T0K;
      maxErr = Math.max(maxErr, Math.abs(num - exact));
    }
    expect(maxErr).toBeLessThan(1.5); // °C при перепаде 180 °C
  });

  it('сохраняет энергию в полностью изолированном кубе', () => {
    const sim = new Sim({ N: 12, L: 0.05, topOpen: false, ...inert });
    sim.updateBC = function () { this.hx.fill(0); };
    sim.reset();
    for (let p = 0; p < sim.n; p++) sim.T[p] = 300 + 100 * Math.sin(p);
    sim.updateProps();
    const E0 = sim.energy();
    for (let s = 0; s < 50; s++) sim.step(5);
    expect(Math.abs(sim.energy() - E0) / E0).toBeLessThan(1e-3);
  });

  it('теплообмен растёт со скоростью потока (h ∝ √U)', () => {
    const a = new Sim({ N: 8, U: 0.83, preset: PRESETS[0] });
    const b = new Sim({ N: 8, U: 2.7, preset: PRESETS[0] });
    expect(b.hMean / a.hMean).toBeCloseTo(Math.sqrt(2.7 / 0.83), 2);
    expect(a.hMean).toBeGreaterThan(5);
    expect(a.hMean).toBeLessThan(60);
  });
});

describe('массо- и теплоперенос', () => {
  it('сохраняет массу: образец + испарено + газ + стекло = исходная масса', () => {
    const sim = new Sim({ N: 12, L: 0.05, Tf: 550, U: 2.7, preset: PRESETS[0] });
    for (let s = 0; s < 400; s++) sim.step(30);
    const a = sim.acc;
    const lost = a.evap.reduce((x, y) => x + y, 0) + a.pyroGas + a.tar + a.drained;
    expect(Math.abs(sim.totalMass() + lost - sim.mass0) / sim.mass0).toBeLessThan(1e-9);
    expect(lost).toBeGreaterThan(0.1 * sim.mass0);
  });

  it('держит плато ≈100 °C у нагреваемой грани, пока в ячейке есть вода', () => {
    const water = { preset: null, m0: [400, 0, 0, 0, 0], solid0: 1200 };
    const sim = new Sim({ N: 16, L: 0.06, Tf: 400, U: 2.7, ...water });
    let sawPlateau = false;
    for (let s = 0; s < 2000; s++) {
      sim.step(10);
      const p = sim.idx(8, 0, 8);
      if (sim.m[p] > 1) expect(sim.T[p] - T0K).toBeLessThan(100.5);
      if (sim.m[p] > 1 && sim.T[p] - T0K > 99) sawPlateau = true;
    }
    expect(sawPlateau).toBe(true);
  });

  it('без теплоты испарения образец прогревается быстрее (сравнение с моделью без связи)', () => {
    const a = new Sim({ N: 12, L: 0.06, Tf: 250, preset: PRESETS[1] });
    const b = new Sim({ N: 12, L: 0.06, Tf: 250, preset: PRESETS[1], latentHeat: false });
    for (let s = 0; s < 300; s++) { a.step(20); b.step(20); }
    expect(b.mean(b.T)).toBeGreaterThan(a.mean(a.T) + 5);
  });

  it('испарение без нагрева даёт ограниченное охлаждение (температура мокрого термометра)', () => {
    const sim = new Sim({ N: 12, L: 0.05, Tf: 20, U: 1.6, preset: PRESETS[1] });
    for (let s = 0; s < 1200; s++) sim.step(30); // 10 ч
    let minT = Infinity;
    for (let p = 0; p < sim.n; p++) minT = Math.min(minT, sim.T[p] - T0K);
    expect(minT).toBeGreaterThan(12);
    expect(minT).toBeLessThan(20);
  });

  it('пиролиз идёт с константой Аррениуса k = A·exp(−E/RT)', () => {
    const resid = { preset: null, m0: [0, 0, 0, 0, 300], solid0: 1200, drainage: false, evaporation: false };
    const sim = new Sim({ N: 6, L: 0.03, ...resid });
    sim.diffuse = () => {};
    const T = 723.15;
    sim.T.fill(T);
    const k = PYRO.A * Math.exp(-PYRO.E / (R * T));
    sim.sources(100);
    const left = sim.componentMass(4) / (300 * sim.Vc * sim.n);
    expect(left).toBeCloseTo(Math.exp(-k * 100), 6);
    expect(sim.cokeMass()).toBeGreaterThan(0);
  });

  it('при 150 °C лёгкие УВ уходят сильнее тяжёлых (фракционная десорбция)', () => {
    const sim = new Sim({ N: 10, L: 0.04, Tf: 150, U: 2.7, preset: PRESETS[0] });
    for (let s = 0; s < 600; s++) sim.step(30);
    const frac = (c) => sim.acc.evap[c] / (sim.m0[c] * sim.Vc * sim.n);
    expect(frac(1)).toBeGreaterThan(5 * frac(3));
    expect(COMPONENTS[3].TbC).toBeGreaterThan(150);
  });
});

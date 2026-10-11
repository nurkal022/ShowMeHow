// 3D-модель термической обработки нефтешлама (куб L×L×L, нагрев потоком горячего воздуха снизу).
//
// Энергия:   C_eff ∂T/∂t = ∇·(λ_eff ∇T) − Σ ṁ_i L_i − r_p ΔH_p
// Масса:     ∂m_i/∂t = −ṁ_i (испарение) − r_p (пиролиз) − ∇·(дренаж нефти)
// Испарение: ṁ_i = k_ev f_esc m_i x_i p_sat,i(T)/p_атм,  p_sat — Клапейрон–Клаузиус;
//            при достижении точки кипения (Σ x_i p_sat,i ≥ p_атм) избыток тепла уходит в испарение (метод энтальпии).
// Пиролиз:   r_p = A exp(−E/RT) m_resid → газ + смола + кокс
// Дренаж:    q = k k_ro(S_o)/μ_o(T) · ρ_o g  (Дарси, только сила тяжести)
// ГУ снизу:  −λ ∂T/∂n = h_x (T_f − T_s),  Nu_x = 0.332 Re_x^½ Pr^⅓ (ламинарный пограничный слой)
//
// Сетка: N³ ячеек, j — вертикаль (j=0 — нагреваемая грань). Явная схема по теплопроводности
// с устойчивым шагом dt ≤ dx²/(6α_max); источники — расщеплением по физическим процессам.

import {
  COMPONENTS, NC, OIL, SOLID, COKE, PYRO, EVAP, DRAIN, PORE_RAD, air,
  R, SIGMA, P_ATM, G, T0K, presetDensities,
} from './params.js';

const wsumOil = (m, n, p) => m[n + p] + m[2 * n + p] + m[3 * n + p];

export const GROUPS = ['steam', 'voc', 'smoke', 'gas']; // визуальные группы выбросов

export class Sim {
  constructor(opts = {}) {
    this.N = opts.N ?? 24;
    const n = this.N ** 3;
    this.n = n;
    this.T = new Float64Array(n);
    this.m = new Float64Array(NC * n);
    this.coke = new Float64Array(n);
    this.C = new Float64Array(n);
    this.lam = new Float64Array(n);
    this.dT = new Float64Array(n);
    this.fEsc = new Float64Array(n);
    this.drainFlux = new Float64Array(n); // объёмная доля, уходящая вниз за шаг
    const cols = this.N * this.N;
    this.emitTop = GROUPS.map(() => new Float64Array(cols));
    this.emitBot = GROUPS.map(() => new Float64Array(cols));
    this.dripCols = new Float64Array(cols);
    this.hx = new Float64Array(this.N);
    this.configure(opts);
    this.reset();
  }

  configure(o = {}) {
    const d = {
      L: 0.08, Tf: 250, U: 1.6, Tamb: 20, RH: 0.5, preset: null, insulated: true, topOpen: true,
      latentHeat: true, poreRadiation: true, drainage: true, pyrolysis: true,
      evaporation: true, kPerm: null,
    };
    this.cfg = Object.assign(d, this.cfg ?? {}, o);
    return this;
  }

  reset() {
    const { N, n, cfg } = this;
    this.dx = cfg.L / N;
    this.Vc = this.dx ** 3;
    this.t = 0;
    const pr = cfg.preset;
    const dens = pr ? presetDensities(pr) : { m: cfg.m0, solid: cfg.solid0 };
    this.solid = dens.solid;
    this.porosity = dens.porosity;
    this.rhoBulk0 = dens.rhoBulk;
    this.k = cfg.kPerm ?? pr?.k ?? 2e-11;
    this.sulfur = pr?.sulfur ?? 0;
    const T0 = cfg.Tamb + T0K;
    this.T.fill(T0);
    this.coke.fill(0);
    for (let c = 0; c < NC; c++) this.m.fill(dens.m[c], c * n, (c + 1) * n);
    this.m0 = dens.m.slice();
    this.mass0 = (dens.m.reduce((a, b) => a + b, 0) + this.solid) * this.Vc * n;
    // Сера сосредоточена в смолах/асфальтенах
    this.sulfurInResid = this.m0[4] > 0 ? (this.sulfur * OIL.reduce((a, c) => a + this.m0[c], 0)) / this.m0[4] : 0;

    // Фактор выхода пара: пар уходит к ближайшей открытой грани (верх или решётка снизу)
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const y = (j + 0.5) * this.dx;
      const dist = Math.min(y, cfg.L - y);
      this.fEsc[i + N * j + N * N * k] = 1 / (1 + dist / EVAP.delta);
    }

    this.acc = {
      evap: new Float64Array(NC), pyroGas: 0, tar: 0, h2s: 0, drained: 0,
      Qin: 0, Qlatent: 0, Qpyro: 0, Qloss: 0,
    };
    this.rates = { steam: 0, voc: 0, smoke: 0, gas: 0, h2s: 0, drip: 0 };
    this.updateProps();
    this.updateBC();
  }

  idx(i, j, k) { return i + this.N * j + this.N * this.N * k; }

  // Свойства среды: C = Σ m_k c_k, λ = Π λ_k^{v_k} (геом. среднее) + излучение в порах
  updateProps() {
    const { n, m, coke, T, C, lam, cfg } = this;
    const ms = this.solid;
    const lnS = Math.log(SOLID.lambda), lnC = Math.log(COKE.lambda);
    const lnL = COMPONENTS.map((c) => Math.log(c.lambda));
    const vs = ms / SOLID.rho;
    const lnAir0 = Math.log(air.lambda(300));
    for (let p = 0; p < n; p++) {
      let Cp = ms * SOLID.c + coke[p] * COKE.c;
      let vsum = vs + coke[p] / COKE.rho;
      let lnLam = vs * lnS + (coke[p] / COKE.rho) * lnC;
      for (let c = 0; c < NC; c++) {
        const mc = m[c * n + p];
        Cp += mc * COMPONENTS[c].c;
        const v = mc / COMPONENTS[c].rho;
        vsum += v;
        lnLam += v * lnL[c];
      }
      const vg = Math.max(0, 1 - vsum);
      const Tp = T[p];
      lnLam += vg * (lnAir0 + 0.835 * Math.log(Tp / 300));
      let l = Math.exp(lnLam);
      if (cfg.poreRadiation) l += vg * 4 * PORE_RAD.eps * SIGMA * PORE_RAD.dp * Tp * Tp * Tp;
      C[p] = Math.max(Cp, 1e3);
      lam[p] = l;
    }
  }

  // Локальный коэффициент теплоотдачи снизу: h_x = Nu_x·λ_air/x, x — от кромки сопла
  updateBC() {
    const { N, cfg, dx } = this;
    const Tf = cfg.Tf + T0K;
    const Tfilm = (Tf + this.meanBottomT()) / 2;
    const nu = air.nu(Tfilm), la = air.lambda(Tfilm), Pr = air.Pr;
    const x0 = 0.01;
    for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * dx;
      const Rex = Math.max(cfg.U, 1e-3) * x / nu;
      this.hx[i] = (0.332 * Math.sqrt(Rex) * Math.cbrt(Pr) * la) / x;
    }
    const ReL = Math.max(cfg.U, 1e-3) * cfg.L / nu;
    this.ReL = ReL;
    this.NuL = 0.664 * Math.sqrt(ReL) * Math.cbrt(Pr);
    this.hMean = (this.NuL * la) / cfg.L;
    this.lamMean = this.mean(this.lam);
    this.Bi = (this.hMean * cfg.L) / this.lamMean;
  }

  meanBottomT() {
    const { N } = this;
    let s = 0;
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) s += this.T[i + N * N * k];
    return s / (N * N);
  }

  mean(a) { let s = 0; for (let p = 0; p < this.n; p++) s += a[p]; return s / this.n; }

  stableDt() {
    let amax = 0;
    for (let p = 0; p < this.n; p++) { const a = this.lam[p] / this.C[p]; if (a > amax) amax = a; }
    // запас 2×: гармоническое среднее на грани ≤ 2λ, плюс граничный член Робена
    return (0.45 * this.dx * this.dx) / (6 * amax);
  }

  // Шаг теплопроводности (явная схема, проводимость на грани — гармоническое среднее)
  diffuse(dt) {
    const { N, n, T, lam, C, dT, dx, cfg } = this;
    dT.fill(0);
    const NN = N * N;
    const inv = 1 / dx;
    // внутренние грани по трём направлениям
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = i + N * j + NN * k;
      const lp = lam[p], tp = T[p];
      if (i + 1 < N) { const q = p + 1; const f = (2 * lp * lam[q]) / (lp + lam[q]) * (T[q] - tp) * inv; dT[p] += f; dT[q] -= f; }
      if (j + 1 < N) { const q = p + N; const f = (2 * lp * lam[q]) / (lp + lam[q]) * (T[q] - tp) * inv; dT[p] += f; dT[q] -= f; }
      if (k + 1 < N) { const q = p + NN; const f = (2 * lp * lam[q]) / (lp + lam[q]) * (T[q] - tp) * inv; dT[p] += f; dT[q] -= f; }
    }
    // нижняя грань: конвекция горячего воздуха (Робен), с учётом половины ячейки
    const Tf = cfg.Tf + T0K;
    let Qin = 0;
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
      const p = i + NN * k;
      const q = (Tf - T[p]) / (1 / this.hx[i] + dx / (2 * lam[p]));
      dT[p] += q; Qin += q;
    }
    this.acc.Qin += Qin * dx * dx * dt;
    // Верхняя грань открыта (через неё уходит пар): естественная конвекция + излучение в помещение.
    // Боковые грани: изоляция (как в статье) или те же потери.
    if (cfg.topOpen || !cfg.insulated) {
      const Ta = cfg.Tamb + T0K;
      let Ql = 0;
      const loss = (p) => {
        const Ts = T[p];
        const dTa = Math.abs(Ts - Ta);
        const h = 1.32 * Math.pow(dTa / cfg.L, 0.25) + 0.9 * SIGMA * (Ts * Ts + Ta * Ta) * (Ts + Ta);
        const q = (Ta - Ts) / (1 / h + dx / (2 * lam[p]));
        dT[p] += q; Ql -= q;
      };
      if (cfg.topOpen) for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) loss(i + N * (N - 1) + NN * k);
      if (!cfg.insulated) {
        for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
          loss(N * j + NN * k); loss(N - 1 + N * j + NN * k);
        }
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          loss(i + N * j); loss(i + N * j + NN * (N - 1));
        }
      }
      this.acc.Qloss += Ql * dx * dx * dt;
    }
    const s = dt / dx;
    for (let p = 0; p < n; p++) T[p] += (s * dT[p]) / C[p];
  }

  // Испарение, кипение, пиролиз, дренаж — за интервал dt (безусловно устойчивые формы)
  sources(dt) {
    const { N, n, T, m, C, coke, fEsc, cfg, Vc } = this;
    const NN = N * N;
    const acc = this.acc;
    const eT = this.emitTop, eB = this.emitBot;
    for (const g of eT) g.fill(0);
    for (const g of eB) g.fill(0);
    let rSteam = 0, rVoc = 0, rSmoke = 0, rGas = 0, rH2s = 0;
    const latent = cfg.latentHeat, evapOn = cfg.evaporation, pyroOn = cfg.pyrolysis;
    const B = COMPONENTS.map((c) => c.B);
    const invTb = COMPONENTS.map((c) => (c.TbC === null ? 0 : 1 / (c.TbC + T0K)));
    const Lh = COMPONENTS.map((c) => c.L);
    const invM = COMPONENTS.map((c) => 1 / c.M);
    const M = COMPONENTS.map((c) => c.M);
    const kEv = EVAP.kEv * dt;
    // парциальное давление водяного пара в воздухе помещения (относительная влажность RH)
    const psiAmbW = (cfg.RH ?? 0) * Math.exp(-B[0] * (1 / (cfg.Tamb + T0K) - invTb[0]));
    const Tbw = COMPONENTS[0].TbC + T0K;
    const Tamb = cfg.Tamb + T0K;
    const kPyro = PYRO.A * dt, EoR = PYRO.E / R;
    const h2sY = PYRO.h2sRelease * this.sulfurInResid * (34 / 32);
    const dm = this._dm ?? (this._dm = new Float64Array(4));
    const psi = this._psi ?? (this._psi = new Float64Array(4));
    const n1 = n, n2 = 2 * n, n3 = 3 * n, n4 = 4 * n;

    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
      const fTop = (j + 0.5) / N; // доля пара, уходящего вверх (меньшее сопротивление пути)
      for (let i = 0; i < N; i++) {
        const p = i + N * j + NN * k;
        const col = i + N * k;
        let Tp = T[p];
        const Cp = C[p];
        dm[0] = dm[1] = dm[2] = dm[3] = 0;
        const invT = 1 / Tp;

        if (evapOn) {
          // 1) Испарение ниже точки кипения (Клапейрон–Клаузиус, закон Рауля для нефти)
          const nOil = m[n1 + p] * invM[1] + m[n2 + p] * invM[2] + m[n3 + p] * invM[3] + m[n4 + p] * invM[4];
          const ke = kEv * fEsc[p];
          for (let c = 0; c < 4; c++) {
            const mc = m[c * n + p];
            if (mc <= 0) continue;
            const arg = -B[c] * (invT - invTb[c]);
            if (arg < -25) continue;
            const x = c === 0 ? 1 : (mc * invM[c]) / nOil;
            const ps = x * Math.exp(arg) - (c === 0 ? psiAmbW : 0);
            if (ps <= 0) continue;
            const z = ke * (ps < 1 ? ps : 1);
            const d = mc * (z < 1e-4 ? z : 1 - Math.exp(-z));
            dm[c] += d;
            m[c * n + p] = mc - d;
            if (latent) Tp -= (d * Lh[c]) / Cp;
          }

          // 2) Кипение воды: T не превышает 100 °C, пока есть вода (метод энтальпии)
          const mw = m[p];
          if (Tp > Tbw && mw > 0) {
            // без стока теплоты кипение ограничено скоростью (иначе перегрев «тратится» повторно на каждом шаге)
            const d = latent ? Math.min(mw, (Cp * (Tp - Tbw)) / Lh[0]) : mw * (1 - Math.exp(-EVAP.kEv * 10 * dt));
            m[p] = mw - d; dm[0] += d;
            if (latent) Tp -= (d * Lh[0]) / Cp;
          }

          // 3) Кипение нефтяной смеси: Σ x_i p_sat,i(T) ≥ p_атм → T возвращается к точке начала кипения
          const nO = m[n1 + p] * invM[1] + m[n2 + p] * invM[2] + m[n3 + p] * invM[3] + m[n4 + p] * invM[4];
          if (nO > 0) {
            let S = 0, dS = 0;
            const iT = 1 / Tp;
            for (let c = 1; c < 4; c++) {
              const arg = -B[c] * (iT - invTb[c]);
              psi[c] = arg < -25 ? 0 : ((m[c * n + p] * invM[c]) / nO) * Math.exp(arg);
              S += psi[c];
              dS += psi[c] * B[c] * iT * iT;
            }
            if (S > 1) {
              const dTex = Math.min(Math.log(S) / (dS / S), Tp - Tamb);
              // массовый состав пара и средняя теплота испарения
              let wsum = 0, Lmix = 0;
              for (let c = 1; c < 4; c++) { psi[c] *= M[c]; wsum += psi[c]; }
              for (let c = 1; c < 4; c++) { psi[c] /= wsum; Lmix += psi[c] * Lh[c]; }
              const dTot = latent ? (Cp * dTex) / Lmix : wsumOil(m, n, p) * (1 - Math.exp(-EVAP.kEv * 10 * dt));
              for (let c = 1; c < 4; c++) {
                const d = Math.min(m[c * n + p], psi[c] * dTot);
                m[c * n + p] -= d; dm[c] += d;
                if (latent) Tp -= (d * Lh[c]) / Cp;
              }
            }
          }
        }

        // 4) Пиролиз смол/асфальтенов (Аррениус, 1-й порядок)
        if (pyroOn && Tp > 500) {
          const mr = m[n4 + p];
          if (mr > 0) {
            const z = kPyro * Math.exp(-EoR / Tp);
            const d = mr * (z < 1e-4 ? z : 1 - Math.exp(-z));
            m[n4 + p] = mr - d;
            coke[p] += PYRO.yCoke * d;
            Tp -= (d * PYRO.dH) / Cp;
            acc.Qpyro += d * PYRO.dH * Vc;
            const gas = PYRO.yGas * d * Vc, tar = PYRO.yTar * d * Vc, h2s = h2sY * d * Vc;
            acc.pyroGas += gas; acc.tar += tar; acc.h2s += h2s;
            rGas += gas; rSmoke += tar; rH2s += h2s;
            eT[3][col] += gas * fTop; eB[3][col] += gas * (1 - fTop);
            eT[2][col] += tar * fTop; eB[2][col] += tar * (1 - fTop);
          }
        }

        T[p] = Tp;
        if (evapOn) {
          for (let c = 0; c < 4; c++) {
            if (dm[c] <= 0) continue;
            acc.evap[c] += dm[c] * Vc;
            acc.Qlatent += dm[c] * Lh[c] * Vc;
          }
          const st = dm[0] * Vc, vo = (dm[1] + dm[2]) * Vc, sm = dm[3] * Vc;
          if (st > 0) { rSteam += st; eT[0][col] += st * fTop; eB[0][col] += st * (1 - fTop); }
          if (vo > 0) { rVoc += vo; eT[1][col] += vo * fTop; eB[1][col] += vo * (1 - fTop); }
          if (sm > 0) { rSmoke += sm; eT[2][col] += sm * fTop; eB[2][col] += sm * (1 - fTop); }
        }
      }
    }

    const drip = cfg.drainage ? this.drain(dt) : (this.dripCols.fill(0), 0);

    // перевод в кг/с
    const r = this.rates, inv = 1 / dt;
    r.steam = rSteam * inv; r.voc = rVoc * inv; r.smoke = rSmoke * inv; r.gas = rGas * inv; r.h2s = rH2s * inv; r.drip = drip * inv;
    for (let g = 0; g < GROUPS.length; g++) {
      const a = eT[g], b = eB[g];
      for (let c = 0; c < a.length; c++) { a[c] *= inv; b[c] *= inv; }
    }
  }

  // Гравитационный дренаж нефтяной фазы (вязкость по Андраде, отн. проницаемость по Кори)
  drain(dt) {
    const { N, n, T, m, coke, drainFlux } = this;
    const NN = N * N;
    const vs = this.solid / SOLID.rho;
    drainFlux.fill(0);
    this.dripCols.fill(0);
    // 1) поток из каждой ячейки вниз (объёмная доля)
    for (let p = 0; p < n; p++) {
      let vo = 0, mo = 0;
      for (const c of OIL) { const mc = m[c * n + p]; vo += mc / COMPONENTS[c].rho; mo += mc; }
      if (vo <= 0) continue;
      const pore = 1 - vs - coke[p] / COKE.rho;
      const So = vo / pore;
      if (So <= DRAIN.Sor) continue;
      const se = (So - DRAIN.Sor) / (1 - DRAIN.Sor);
      const kro = se * se * se; // Кори, n = 3
      const mu = DRAIN.muRef * Math.exp(DRAIN.Bvisc * (1 / T[p] - 1 / DRAIN.TRef));
      const rhoO = mo / vo;
      const q = (this.k * kro * rhoO * G) / mu; // скорость Дарси, м/с
      drainFlux[p] = Math.min((q * dt) / this.dx, 0.5 * (So - DRAIN.Sor) * pore);
    }
    // 2) ограничение свободным поровым объёмом принимающей ячейки
    for (let k = 0; k < N; k++) for (let j = 1; j < N; j++) for (let i = 0; i < N; i++) {
      const p = i + N * j + NN * k, q = p - N;
      if (drainFlux[p] <= 0) continue;
      let vq = vs + coke[q] / COKE.rho;
      for (let c = 0; c < NC; c++) vq += m[c * n + q] / COMPONENTS[c].rho;
      drainFlux[p] = Math.min(drainFlux[p], Math.max(0, 0.98 - vq));
    }
    // 3) перенос (сверху вниз, от исходного состава ячейки-донора)
    let out = 0;
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = i + N * j + NN * k;
      const f = drainFlux[p];
      if (f <= 0) continue;
      let vo = 0;
      for (const c of OIL) vo += m[c * n + p] / COMPONENTS[c].rho;
      const share = f / vo;
      let moved = 0;
      for (const c of OIL) {
        const d = m[c * n + p] * share;
        m[c * n + p] -= d;
        moved += d;
        if (j > 0) m[c * n + p - N] += d;
      }
      if (j === 0) { out += moved * this.Vc; this.dripCols[i + N * k] += (moved * this.Vc) / dt; }
    }
    this.acc.drained += out;
    return out;
  }

  // Продвинуть модель на dtTotal секунд модельного времени
  step(dtTotal) {
    if (dtTotal <= 0) return;
    this.updateProps();
    this.updateBC();
    const dtS = this.stableDt();
    const nsub = Math.max(1, Math.ceil(dtTotal / dtS));
    const h = dtTotal / nsub;
    for (let s = 0; s < nsub; s++) this.diffuse(h);
    this.sources(dtTotal);
    this.t += dtTotal;
    this.lastSubsteps = nsub;
    this.dtStable = dtS;
  }

  // ---- диагностика ----
  totalMass() {
    let s = 0;
    for (let i = 0; i < NC * this.n; i++) s += this.m[i];
    for (let p = 0; p < this.n; p++) s += this.coke[p];
    return (s + this.solid * this.n) * this.Vc;
  }
  componentMass(c) {
    let s = 0;
    for (let p = 0; p < this.n; p++) s += this.m[c * this.n + p];
    return s * this.Vc;
  }
  cokeMass() { let s = 0; for (let p = 0; p < this.n; p++) s += this.coke[p]; return s * this.Vc; }
  energy() {
    let s = 0;
    for (let p = 0; p < this.n; p++) s += this.C[p] * this.T[p];
    return s * this.Vc;
  }

  // Температура в точке (локальные координаты 0..1), трилинейная интерполяция
  sampleT(u, v, w) {
    const N = this.N;
    const fx = Math.min(N - 1, Math.max(0, u * N - 0.5));
    const fy = Math.min(N - 1, Math.max(0, v * N - 0.5));
    const fz = Math.min(N - 1, Math.max(0, w * N - 0.5));
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
    const i1 = Math.min(N - 1, i0 + 1), j1 = Math.min(N - 1, j0 + 1), k1 = Math.min(N - 1, k0 + 1);
    const a = fx - i0, b = fy - j0, c = fz - k0;
    const T = this.T, I = (i, j, k) => T[i + N * j + N * N * k];
    const l = (x, y, t) => x + (y - x) * t;
    return l(
      l(l(I(i0, j0, k0), I(i1, j0, k0), a), l(I(i0, j1, k0), I(i1, j1, k0), a), b),
      l(l(I(i0, j0, k1), I(i1, j0, k1), a), l(I(i0, j1, k1), I(i1, j1, k1), a), b),
      c,
    ) - T0K;
  }

  // ε₀ из наброска: доля жидкости, способной испариться при температуре потока T_f
  evaporableFraction() {
    let tot = 0, ev = 0;
    for (let c = 0; c < NC; c++) {
      tot += this.m0[c];
      if (COMPONENTS[c].TbC !== null && COMPONENTS[c].TbC <= this.cfg.Tf) ev += this.m0[c];
    }
    return tot > 0 ? ev / tot : 0;
  }
}

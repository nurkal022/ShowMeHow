// Звук, синтезируемый из состояния модели: гул воздуходувки ∝ U₀, шипение ∝ скорости испарения воды.
export class Sound {
  constructor() { this.ctx = null; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
    const src = (filterType, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = filterType; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(flt).connect(g).connect(ctx.destination);
      s.start();
      return { g, flt };
    };
    this.blower = src('lowpass', 500, 0.7);
    this.sizzle = src('highpass', 4000, 0.5);
  }

  // короткий щелчок интерфейса
  click() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.04);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.07);
  }

  update(state) {
    this.muted = !state.view.sound;
    if (!this.ctx) return;
    const on = state.view.sound && state.running;
    const t = this.ctx.currentTime;
    const U = state.cfg.U;
    this.blower.g.gain.setTargetAtTime(on ? 0.05 + 0.05 * Math.min(1, U / 5) : 0, t, 0.2);
    this.blower.flt.frequency.setTargetAtTime(300 + 150 * U, t, 0.2);
    const steam = state.snap ? state.snap.rates.steam * state.speed : 0;
    const s = 1 - Math.exp(-steam / 3e-3);
    const flick = 0.7 + 0.3 * Math.random();
    this.sizzle.g.gain.setTargetAtTime(on ? 0.06 * s * flick : 0, t, 0.08);
  }
}

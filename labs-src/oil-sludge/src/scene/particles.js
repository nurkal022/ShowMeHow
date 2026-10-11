// Частицы, управляемые моделью:
//  • пар/дым — число частиц ∝ потоку массы через грань (кг/с), по колонкам сетки;
//  • струя горячего воздуха — скорость ∝ U₀, цвет — T₀;
//  • капли — из потока дренажа нефти через нижнюю грань.
import * as THREE from 'three';
import { LAYOUT } from './lab.js';

// Билборды (инстансы квада): размер в метрах, не зависит от ограничений gl_PointSize — одинаково в браузере и в очках.
const vert = /* glsl */ `
attribute vec3 iPos;
attribute vec4 aColor;
attribute float aSize;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vColor = aColor;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  a *= a;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  if (gl_FragColor.a < 0.003) discard;
  #include <colorspace_fragment>
}`;

// Визуальные группы выбросов (порядок совпадает с GROUPS решателя)
export const GROUP_STYLE = [
  { name: 'Водяной пар', color: [0.97, 0.98, 1.0], alpha: 0.45, size: 0.05, grow: 0.12, life: 2.6, rise: 0.22, ref: 4e-6 },
  { name: 'Пары лёгких УВ', color: [0.72, 0.86, 0.95], alpha: 0.16, size: 0.04, grow: 0.06, life: 2.0, rise: 0.15, ref: 4e-6 },
  { name: 'Тяжёлые пары / смола', color: [0.62, 0.5, 0.28], alpha: 0.42, size: 0.045, grow: 0.08, life: 3.6, rise: 0.12, ref: 2e-6 },
  { name: 'Пиролизный газ', color: [0.55, 0.58, 0.64], alpha: 0.2, size: 0.04, grow: 0.07, life: 3.0, rise: 0.18, ref: 1e-6 },
];

class Pool {
  constructor(count, blending) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 4);
    this.size = new Float32Array(count);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count).fill(-1);
    this.meta = new Array(count);
    this.cursor = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Mesh(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  spawn() {
    for (let k = 0; k < this.count; k++) {
      const i = (this.cursor + k) % this.count;
      if (this.life[i] < 0) { this.cursor = (i + 1) % this.count; return i; }
    }
    const i = this.cursor; this.cursor = (i + 1) % this.count; return i;
  }
  flush() {
    // в простое (нет живых частиц) повторно не загружаем
    let alive = false;
    for (let i = 0; i < this.count; i++) if (this.life[i] >= 0) { alive = true; break; }
    if (!alive && !this.wasAlive) return;
    this.wasAlive = alive;
    const a = this.points.geometry.attributes;
    a.iPos.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = true;
  }
}

// Выбор колонки сетки пропорционально потоку (обратная функция распределения)
function pickColumn(cdf, total) {
  const r = Math.random() * total;
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
  return lo;
}

export class Effects {
  constructor(scene, apparatus) {
    this.app = apparatus;
    this.vapor = new Pool(2200, THREE.NormalBlending);
    this.air = new Pool(500, THREE.AdditiveBlending);
    scene.add(this.vapor.points, this.air.points);
    this.acc = new Float32Array(8); // накопители дробных частиц
    this.airAcc = 0;
    this.cdfTop = []; this.cdfBot = []; this.totTop = []; this.totBot = [];
    this.N = 24;

    // капли
    this.dropGeo = new THREE.SphereGeometry(0.0035, 8, 6);
    this.drops = new THREE.InstancedMesh(this.dropGeo, new THREE.MeshStandardMaterial({ color: 0x140b05, roughness: 0.05, metalness: 0.3 }), 80);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    scene.add(this.drops);
    this.dropState = Array.from({ length: 80 }, () => ({ on: false, p: new THREE.Vector3(), v: 0, s: 1 }));
    this.dropAcc = 0;
    this.dripCdf = null; this.dripTot = 0;
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
  }

  setSnapshot(s) {
    const N = s.N, cols = N * N;
    this.N = N;
    for (let g = 0; g < 4; g++) {
      for (const [src, cdfs, tots] of [[s.emitTop, this.cdfTop, this.totTop], [s.emitBot, this.cdfBot, this.totBot]]) {
        const cdf = cdfs[g] ?? (cdfs[g] = new Float32Array(cols));
        let acc = 0;
        for (let c = 0; c < cols; c++) { acc += src[g * cols + c]; cdf[c] = acc; }
        tots[g] = acc;
      }
    }
    if (!this.dripCdf || this.dripCdf.length !== cols) this.dripCdf = new Float32Array(cols);
    let a = 0;
    for (let c = 0; c < cols; c++) { a += s.drip[c]; this.dripCdf[c] = a; }
    this.dripTot = a;
  }

  // dt — реальные секунды; speed — модельных секунд в реальную
  update(dt, state) {
    const S = LAYOUT.sampleSize, c = LAYOUT.sampleCenter, N = this.N;
    const running = state.running, speed = running ? state.speed : 0;
    const hood = state.view.hood;
    const show = state.view.particles;
    const ex = LAYOUT.exhaust;

    // --- выбросы ---
    if (show && running) {
      for (let g = 0; g < 4; g++) {
        const st = GROUP_STYLE[g];
        for (let face = 0; face < 2; face++) {
          const tot = (face === 0 ? this.totTop : this.totBot)[g] ?? 0;
          if (tot <= 0) continue;
          // интенсивность: насыщающая функция реального (ускоренного) потока массы
          const perSec = 140 * (1 - Math.exp(-(tot * speed) / (st.ref * 1000)));
          const k = g * 2 + face;
          this.acc[k] += perSec * dt;
          while (this.acc[k] >= 1) {
            this.acc[k] -= 1;
            const col = pickColumn(face === 0 ? this.cdfTop[g] : this.cdfBot[g], tot);
            const i = col % N, kk = Math.floor(col / N);
            const x = c.x + ((i + Math.random()) / N - 0.5) * S;
            const z = c.z + ((kk + Math.random()) / N - 0.5) * S;
            const p = this.vapor.spawn();
            const P = this.vapor.pos, V = this.vapor.vel;
            if (face === 0) {
              P[3 * p] = x; P[3 * p + 1] = c.y + S / 2 + 0.003; P[3 * p + 2] = z;
              V[3 * p] = (Math.random() - 0.5) * 0.03; V[3 * p + 1] = st.rise * (0.6 + 0.6 * Math.random()); V[3 * p + 2] = (Math.random() - 0.5) * 0.03;
            } else {
              // снизу пар подхватывается потоком горячего воздуха
              P[3 * p] = x; P[3 * p + 1] = c.y - S / 2 - 0.012; P[3 * p + 2] = z;
              V[3 * p] = 0.08 + 0.12 * Math.min(1, state.cfg.U / 3); V[3 * p + 1] = st.rise * 0.3; V[3 * p + 2] = (Math.random() - 0.5) * 0.03;
            }
            this.vapor.age[p] = 0;
            this.vapor.life[p] = st.life * (0.7 + 0.6 * Math.random());
            this.vapor.meta[p] = g;
          }
        }
      }
    }

    // --- движение пара ---
    const vp = this.vapor;
    for (let p = 0; p < vp.count; p++) {
      if (vp.life[p] < 0) { vp.col[4 * p + 3] = 0; vp.size[p] = 0; continue; }
      vp.age[p] += dt;
      const f = vp.age[p] / vp.life[p];
      if (f >= 1) { vp.life[p] = -1; vp.col[4 * p + 3] = 0; vp.size[p] = 0; continue; }
      const st = GROUP_STYLE[vp.meta[p]];
      const i3 = 3 * p;
      const P = vp.pos, V = vp.vel;
      // всплытие + турбулентность + тяга вытяжки
      V[i3 + 1] += 0.04 * dt;
      V[i3] += (Math.random() - 0.5) * 0.12 * dt;
      V[i3 + 2] += (Math.random() - 0.5) * 0.12 * dt;
      if (hood) {
        const dx = ex.x - P[i3], dy = ex.y - P[i3 + 1], dz = ex.z - P[i3 + 2];
        const d = Math.hypot(dx, dy, dz) + 0.05;
        const pull = 0.35 / (d * d + 0.15);
        V[i3] += (dx / d) * pull * dt; V[i3 + 1] += (dy / d) * pull * dt; V[i3 + 2] += (dz / d) * pull * dt;
      } else {
        V[i3 + 2] += 0.03 * dt; // без тяги дым расползается в комнату
      }
      const drag = Math.exp(-0.6 * dt);
      V[i3] *= drag; V[i3 + 1] *= drag; V[i3 + 2] *= drag;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      vp.col[4 * p] = st.color[0]; vp.col[4 * p + 1] = st.color[1]; vp.col[4 * p + 2] = st.color[2];
      vp.col[4 * p + 3] = st.alpha * Math.min(1, f * 6) * (1 - f);
      vp.size[p] = st.size + st.grow * f;
    }
    vp.flush();

    // --- струя горячего воздуха ---
    const ap = this.air;
    const n0 = this.app.nozzle;
    if (show && running && state.cfg.U > 0) {
      this.airAcc += dt * (40 + 40 * Math.min(1, state.cfg.U / 3));
      while (this.airAcc >= 1) {
        this.airAcc -= 1;
        const p = ap.spawn();
        ap.pos[3 * p] = n0.x; ap.pos[3 * p + 1] = n0.y + (Math.random() - 0.5) * 0.03; ap.pos[3 * p + 2] = n0.z + (Math.random() - 0.5) * 0.04;
        const v = 0.15 + 0.12 * state.cfg.U; // визуальная скорость (масштаб ≈ 1:10)
        ap.vel[3 * p] = v * (0.85 + 0.3 * Math.random());
        ap.vel[3 * p + 1] = (Math.random() - 0.3) * 0.02;
        ap.vel[3 * p + 2] = (Math.random() - 0.5) * 0.06 * v;
        ap.age[p] = 0; ap.life[p] = (S + 0.12) / v;
      }
    }
    const Tf = state.cfg.Tf;
    const tcol = this._c.setHSL(Math.max(0, 0.13 - Tf / 4000), 1, 0.5);
    for (let p = 0; p < ap.count; p++) {
      if (ap.life[p] < 0) { ap.col[4 * p + 3] = 0; ap.size[p] = 0; continue; }
      ap.age[p] += dt;
      const f = ap.age[p] / ap.life[p];
      if (f >= 1) { ap.life[p] = -1; ap.col[4 * p + 3] = 0; ap.size[p] = 0; continue; }
      const i3 = 3 * p;
      ap.pos[i3] += ap.vel[i3] * dt; ap.pos[i3 + 1] += ap.vel[i3 + 1] * dt; ap.pos[i3 + 2] += ap.vel[i3 + 2] * dt;
      ap.col[4 * p] = tcol.r; ap.col[4 * p + 1] = tcol.g; ap.col[4 * p + 2] = tcol.b;
      ap.col[4 * p + 3] = 0.16 * Math.min(1, Tf / 300) * Math.sin(Math.PI * f);
      ap.size[p] = 0.018 + 0.02 * f;
    }
    ap.flush();

    // --- капли нефти ---
    if (show && running && this.dripTot > 0) {
      const dropMass = 5e-5; // кг (≈ 0.05 мл)
      this.dropAcc += Math.min(20, (this.dripTot * speed) / dropMass) * dt;
      while (this.dropAcc >= 1) {
        this.dropAcc -= 1;
        const d = this.dropState.find((q) => !q.on);
        if (!d) break;
        const col = pickColumn(this.dripCdf, this.dripTot);
        const i = col % N, kk = Math.floor(col / N);
        d.on = true; d.v = 0; d.hang = 0.25 + Math.random() * 0.3;
        d.p.set(c.x + ((i + 0.5) / N - 0.5) * S, c.y - S / 2 - 0.004, c.z + ((kk + 0.5) / N - 0.5) * S);
      }
    }
    const trayTop = this.app.oilPool.visible ? this.app.oilPool.position.y : this.app.trayY;
    this.dropState.forEach((d, k) => {
      if (d.on) {
        if (d.hang > 0) { d.hang -= dt; d.s = 1 - d.hang; }
        else { d.v += 9.81 * dt; d.p.y -= d.v * dt; d.s = 1; }
        if (d.p.y < trayTop) d.on = false;
      }
      this._m.makeScale(d.on ? d.s : 0, d.on ? d.s * (d.hang > 0 ? 1 : 1.6) : 0, d.on ? d.s : 0);
      this._m.setPosition(d.p);
      this.drops.setMatrixAt(k, this._m);
    });
    this.drops.instanceMatrix.needsUpdate = true;
  }
}

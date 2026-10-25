// Прямое управление в сцене: ручка T₀ и рычаг U₀ на фене, кнопка питания,
// ручка секущей плоскости, «щуп» по образцу (подсказка значений + установка термопары кликом).
import * as THREE from 'three';
import { DataUtils } from 'three';
import { LAYOUT, Display } from './lab.js';
import { axisDrag } from '../interaction.js';
import { sampleField, PROBE_COLORS } from './probes.js';
import { tr } from '../i18n.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function label(text, w = 0.05, h = 0.018, color = '#cfe8ff') {
  const d = new Display(w, h, 256);
  d.draw((c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,14,20,0.85)'; c.fillRect(0, 0, W, H);
    c.fillStyle = color; c.font = `700 ${Math.round(H * 0.62)}px Inter, Roboto, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, H / 2 + 2);
  });
  return d.mesh;
}

export class SceneControls {
  constructor({ scene, state, actions, sample, probes, interaction, hooks, getField }) {
    Object.assign(this, { scene, state, actions, sample, probes, interaction, hooks, getField });
    const c = LAYOUT.sampleCenter, S = LAYOUT.sampleSize;
    const nozzleX = c.x - S / 2 - 0.035, ny = LAYOUT.grateY - 0.03, zf = c.z + 0.046;
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.4, metalness: 0.6 });

    // --- ручка температуры (сверху на корпусе фена) ---
    this.knob = new THREE.Group();
    const kb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.018, 32), metal);
    this.knob.add(kb);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.016), new THREE.MeshBasicMaterial({ color: 0xff8a3d }));
    mark.position.set(0, 0.0095, -0.009);
    this.knob.add(mark);
    this.knob.position.set(nozzleX - 0.235, ny + 0.054, c.z);
    scene.add(this.knob);
    const knobHit = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 12), new THREE.MeshBasicMaterial({ visible: false }));
    knobHit.position.copy(this.knob.position);
    knobHit.userData.handler = axisDrag({
      axis: Y, scale: 2500, // 24 см хода руки — весь диапазон
      get: () => state.cfg.Tf,
      set: (v) => { const t = clamp(Math.round(v / 5) * 5, 50, 650); if (t !== state.cfg.Tf) actions.setLive({ Tf: t }); },
      onStep: () => {},
    });
    scene.add(knobHit);
    interaction.add(knobHit);
    const kl = label('T₀ ↕', 0.05, 0.018, '#ffb27a');
    kl.position.set(this.knob.position.x, this.knob.position.y + 0.04, this.knob.position.z);
    scene.add(kl);
    this.knobLabel = kl;

    // --- рычаг скорости потока (передняя сторона корпуса) ---
    this.leverX0 = nozzleX - 0.235; this.leverX1 = nozzleX - 0.105;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(this.leverX1 - this.leverX0 + 0.02, 0.008, 0.004), new THREE.MeshStandardMaterial({ color: 0x111316 }));
    slot.position.set((this.leverX0 + this.leverX1) / 2, ny + 0.018, zf);
    scene.add(slot);
    this.lever = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.016), new THREE.MeshStandardMaterial({ color: 0x3dc3ff, roughness: 0.4 }));
    this.lever.position.set(this.leverX0, ny + 0.018, zf + 0.008);
    scene.add(this.lever);
    const leverHit = new THREE.Mesh(new THREE.BoxGeometry(this.leverX1 - this.leverX0 + 0.04, 0.05, 0.04), new THREE.MeshBasicMaterial({ visible: false }));
    leverHit.position.set((this.leverX0 + this.leverX1) / 2, ny + 0.018, zf + 0.01);
    const span = this.leverX1 - this.leverX0;
    leverHit.userData.handler = axisDrag({
      axis: X, scale: 4.7 / (2 * span),
      get: () => state.cfg.U,
      set: (v) => {
        let u = clamp(Math.round(v * 100) / 100, 0.3, 5);
        for (const s of [0.83, 1.6, 2.7]) if (Math.abs(u - s) < 0.05) u = s;
        if (u !== state.cfg.U) actions.setLive({ U: u });
      },
      onStep: () => {},
    });
    scene.add(leverHit);
    interaction.add(leverHit);
    const ll = label('U₀ ↔', 0.05, 0.018, '#7fd8ff');
    ll.position.set(this.leverX0 - 0.035, ny + 0.018, zf + 0.004);
    scene.add(ll);

    // --- кнопка питания ---
    this.power = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.01, 24),
      new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x440000, roughness: 0.4 }),
    );
    this.power.rotation.x = Math.PI / 2;
    this.power.position.set(nozzleX - 0.075, ny - 0.02, zf + 0.004);
    this.power.userData.handler = { down: () => actions.setRunning(!state.running) };
    scene.add(this.power);
    interaction.add(this.power);
    const pl = label(tr('ПУСК', 'ҚОСУ', 'START'), 0.04, 0.016, '#ffd0d0');
    pl.position.set(this.power.position.x, ny - 0.045, zf + 0.002);
    scene.add(pl);

    // --- ручка сечения ---
    this.sliceHandle = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.04, 6), new THREE.MeshBasicMaterial({ color: 0x3dc3ff }));
    stem.position.y = -0.02;
    this.sliceHandle.add(stem);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 20, 14), new THREE.MeshStandardMaterial({ color: 0x3dc3ff, emissive: 0x0b3a52, roughness: 0.3 }));
    this.sliceHandle.add(ball);
    const ballHit = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.sliceHandle.add(ballHit);
    const axisOf = () => ({ x: X, y: Y, z: Z }[state.view.slice] ?? X);
    ballHit.userData.handler = axisDrag({
      axis: axisOf, scale: 1 / S,
      get: () => state.view.slicePos,
      set: (v) => { const p = clamp(Math.round(v * 100) / 100, 0.05, 0.95); if (p !== state.view.slicePos) { state.view.slicePos = p; hooks.slice(); } },
      onStep: () => {},
    });
    this.sliceHit = ballHit;
    scene.add(this.sliceHandle);
    interaction.add(ballHit);

    // --- щуп по образцу ---
    this.tip = new Display(0.17, 0.085, 512);
    this.tip.mesh.visible = false;
    this.tip.mesh.renderOrder = 20;
    this.tip.mesh.material.depthTest = false;
    this.tip.mesh.material.transparent = true;
    scene.add(this.tip.mesh);
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.marker.renderOrder = 21;
    this.marker.visible = false;
    scene.add(this.marker);
    this.hovering = new Set();
    this.flash = null;
    const sampleHandler = {
      accept: (h) => this.acceptHit(h),
      hover: (h, ptr) => { this.hovering.add(ptr.id); this.showTip(h); },
      leave: (ptr) => { this.hovering.delete(ptr.id); if (!this.hovering.size) this.hideTip(); },
      down: (h) => this.placeProbe(h),
    };
    sample.box.userData.handler = sampleHandler;
    sample.cap.userData.handler = sampleHandler;
    interaction.add(sample.box);
    interaction.add(sample.cap);
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  local(p) {
    const c = LAYOUT.sampleCenter, S = LAYOUT.sampleSize;
    return new THREE.Vector3((p.x - c.x) / S + 0.5, (p.y - c.y) / S + 0.5, (p.z - c.z) / S + 0.5);
  }

  // попадание в «вырезанную» часть куба не считается
  acceptHit(h) {
    const { slice, slicePos } = this.state.view;
    if (slice === 'none' || h.object === this.sample.cap) return true;
    const l = this.local(h.point);
    return l[slice] <= slicePos + 1e-3;
  }

  showTip(h) {
    const l = this.local(h.point);
    const f = this.getField(l.x, l.y, l.z);
    if (!f) return;
    this.marker.visible = true;
    this.marker.position.copy(h.point);
    const head = this.interaction.head(this._v);
    const toHead = this._w.copy(head).sub(h.point).normalize();
    this.tip.mesh.visible = true;
    this.tip.mesh.position.copy(h.point).addScaledVector(toHead, 0.05).add(new THREE.Vector3(0, 0.06, 0));
    this.tip.mesh.lookAt(head);
    const next = this.state.view.nextProbe ?? 0;
    this.tip.draw((c, W, H) => {
      c.fillStyle = 'rgba(12,16,22,0.94)'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#3dc3ff'; c.lineWidth = 4; c.strokeRect(2, 2, W - 4, H - 4);
      c.fillStyle = '#ffffff'; c.font = '700 54px Inter, Roboto, sans-serif';
      c.fillText(`${f.T.toFixed(1)} °C`, 20, 66);
      if (this.state.replay !== null) { c.fillStyle = '#ffcc4d'; c.font = '700 24px Inter, Roboto, sans-serif'; c.fillText(tr('ПОВТОР', 'ҚАЙТАЛАУ', 'REPLAY'), W - 130, 52); }
      c.font = '600 27px Inter, Roboto, sans-serif';
      const items = [['#7fbfff', `${tr('вода', 'су', 'water')} ${(f.w * 100).toFixed(0)}%`], ['#ffc266', `${tr('нефть', 'мұнай', 'oil')} ${(f.o * 100).toFixed(0)}%`], ['#b0b0b0', `${tr('кокс', 'кокс', 'coke')} ${(f.k * 100).toFixed(0)}%`]];
      let x = 20;
      for (const [col, s] of items) { c.fillStyle = col; c.fillText(s, x, 116); x += c.measureText(s).width + 22; }
      c.font = '500 24px Inter, Roboto, sans-serif';
      c.fillStyle = PROBE_COLORS[next];
      c.fillText(this.flash ?? tr(`высота ${(l.y * 100).toFixed(0)}% · клик — поставить T${next + 1}`, `биіктігі ${(l.y * 100).toFixed(0)}% · басу — T${next + 1} қою`, `height ${(l.y * 100).toFixed(0)}% · click to place T${next + 1}`), 20, 156);
    });
  }
  hideTip() { this.tip.mesh.visible = false; this.marker.visible = false; }

  placeProbe(h) {
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    const p = h.point.clone().addScaledVector(n, -0.004);
    const i = this.state.view.nextProbe ?? 0;
    this.probes[i].group.position.copy(p);
    this.state.view.nextProbe = (i + 1) % this.probes.length;
    this.flash = tr(`T${i + 1} установлена сюда`, `T${i + 1} осы жерге қойылды`, `T${i + 1} placed here`);
    clearTimeout(this._ft);
    this._ft = setTimeout(() => { this.flash = null; }, 1200);
    this.showTip(h);
  }

  update() {
    const { cfg, running, view } = this.state;
    this.knob.rotation.y = -((cfg.Tf - 50) / 600) * Math.PI * 1.5;
    this.lever.position.x = this.leverX0 + ((cfg.U - 0.3) / 4.7) * (this.leverX1 - this.leverX0);
    this.power.material.color.setHex(running ? 0x22cc55 : 0xcc2222);
    this.power.material.emissive.setHex(running ? 0x0c4a1c : 0x440000);
    // ручка сечения — над краем плоскости разреза
    const on = view.slice !== 'none';
    this.sliceHandle.visible = on;
    this.sliceHit.visible = on;
    if (on) {
      const c = LAYOUT.sampleCenter, S = LAYOUT.sampleSize, h = S / 2, d = (view.slicePos - 0.5) * S;
      const pos = { x: [d, h + 0.04, 0], y: [h + 0.04, d, 0], z: [0, h + 0.04, d] }[view.slice];
      this.sliceHandle.position.set(c.x + pos[0], c.y + pos[1], c.z + pos[2]);
      this.sliceHandle.rotation.set(0, 0, view.slice === 'y' ? Math.PI / 2 : 0);
    }
  }
}

// Значения полей в точке: T — трилинейно, доли — из ближайшей ячейки текстуры
export function fieldAt(T, tex, N, u, v, w) {
  if (!T || !tex) return null;
  const i = Math.min(N - 1, Math.max(0, Math.floor(u * N)));
  const j = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
  const k = Math.min(N - 1, Math.max(0, Math.floor(w * N)));
  const p = 4 * (i + N * j + N * N * k);
  return {
    T: sampleField(T, N, u, v, w),
    w: DataUtils.fromHalfFloat(tex[p + 1]),
    o: DataUtils.fromHalfFloat(tex[p + 2]),
    k: DataUtils.fromHalfFloat(tex[p + 3]),
  };
}

// Термопары: стержень с ручкой, показание — температура модели в точке кончика (трилинейная интерполяция).
import * as THREE from 'three';
import { LAYOUT, Display } from './lab.js';

export const PROBE_COLORS = ['#ff5d5d', '#ffcc4d', '#5bd68a', '#3dc3ff'];

export function sampleField(T, N, u, v, w) {
  const cl = (x) => Math.min(N - 1, Math.max(0, x * N - 0.5));
  const fx = cl(u), fy = cl(v), fz = cl(w);
  const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
  const i1 = Math.min(N - 1, i0 + 1), j1 = Math.min(N - 1, j0 + 1), k1 = Math.min(N - 1, k0 + 1);
  const a = fx - i0, b = fy - j0, c = fz - k0;
  const I = (i, j, k) => T[i + N * j + N * N * k];
  const l = (x, y, t) => x + (y - x) * t;
  return l(
    l(l(I(i0, j0, k0), I(i1, j0, k0), a), l(I(i0, j1, k0), I(i1, j1, k0), a), b),
    l(l(I(i0, j0, k1), I(i1, j0, k1), a), l(I(i0, j1, k1), I(i1, j1, k1), a), b),
    c,
  );
}

const ROD = 0.3;

export class Probe {
  constructor(idx, scene) {
    this.idx = idx;
    this.color = PROBE_COLORS[idx];
    const g = (this.group = new THREE.Group()); // начало координат — кончик термопары
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0022, 0.0022, ROD, 8),
      new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.9, roughness: 0.25 }),
    );
    rod.position.y = ROD / 2;
    g.add(rod);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), new THREE.MeshBasicMaterial({ color: this.color }));
    g.add(tip);
    this.handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.07, 16),
      new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.5, emissive: new THREE.Color(this.color), emissiveIntensity: 0.15 }),
    );
    this.handle.position.y = ROD + 0.035;
    this.handle.userData.probe = this;
    g.add(this.handle);
    // увеличенная невидимая зона захвата
    this.grabZone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.grabZone.position.y = ROD + 0.035;
    this.grabZone.userData.probe = this;
    g.add(this.grabZone);
    this.label = new Display(0.085, 0.034, 340);
    this.label.mesh.position.set(0, ROD + 0.095, 0);
    g.add(this.label.mesh);
    scene.add(g);
    this.value = 20;
    this.inside = false;
    this.local = new THREE.Vector3();
  }

  // Положение кончика в долях куба (0..1); вне куба — null
  localCoords() {
    const S = LAYOUT.sampleSize, c = LAYOUT.sampleCenter;
    const p = this.group.position;
    this.local.set((p.x - c.x) / S + 0.5, (p.y - c.y) / S + 0.5, (p.z - c.z) / S + 0.5);
    const l = this.local;
    this.inside = l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1 && l.z >= 0 && l.z <= 1;
    return this.inside ? l : null;
  }

  read(snap, state) {
    const l = this.localCoords();
    if (l && snap) this.value = sampleField(snap.T, snap.N, l.x, l.y, l.z);
    else {
      // в струе под образцом — температура потока, иначе — воздух помещения
      const S = LAYOUT.sampleSize, c = LAYOUT.sampleCenter, p = this.group.position;
      const inJet = state.running && Math.abs(p.z - c.z) < S / 2 && p.x > c.x - S / 2 - 0.05 && p.x < c.x + S / 2 && p.y < c.y - S / 2 && p.y > c.y - S / 2 - 0.05;
      this.value = inJet ? state.cfg.Tf : state.cfg.Tamb;
    }
    return this.value;
  }

  setTipLocal(u, v, w) {
    const S = LAYOUT.sampleSize, c = LAYOUT.sampleCenter;
    this.group.position.set(c.x + (u - 0.5) * S, c.y + (v - 0.5) * S, c.z + (w - 0.5) * S);
  }

  drawLabel(camera) {
    this.label.draw((c, w, h) => {
      c.fillStyle = this.color;
      c.fillRect(0, 0, 14, h);
      c.fillStyle = '#e8edf3';
      c.font = '700 64px "Roboto Mono", monospace';
      c.fillText(`T${this.idx + 1} ${this.value.toFixed(0)}°`, 28, 92);
    });
    // табличка повёрнута к зрителю
    const q = camera.getWorldQuaternion(new THREE.Quaternion());
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    this.label.mesh.rotation.set(0, e.y, 0);
  }
}

// Расстановка по умолчанию: вдоль вертикали через центр, разные глубины
export const DEFAULT_TIPS = [
  [0.15, 0.08, 0.62],
  [0.38, 0.33, 0.4],
  [0.62, 0.6, 0.62],
  [0.85, 0.9, 0.4],
];

// Помещение лаборатории: пол, стены, столы, вытяжной шкаф, плакаты.
import * as THREE from 'three';
import { tr } from '../i18n.js';

export const LAYOUT = {
  benchY: 0.92,
  benchZ: -0.8,
  hood: { x0: -0.78, x1: 0.78, zBack: -1.2, zFront: -0.4, h: 1.3 },
  sampleSize: 0.2,                 // визуальный размер куба, м
  grateY: 0.92 + 0.3,
  sampleCenter: new THREE.Vector3(0, 0.92 + 0.3 + 0.006 + 0.1, -0.82),
  exhaust: new THREE.Vector3(0, 0.92 + 1.25, -1.05),
};

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

const mat = {
  floor: () => new THREE.MeshStandardMaterial({
    map: canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#c9ccd0'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        c.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0.025)`;
        c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      c.strokeStyle = '#a9adb3'; c.lineWidth = 3;
      c.strokeRect(0, 0, w, h);
    }, [12, 12]),
    roughness: 0.55, metalness: 0,
  }),
  wall: new THREE.MeshStandardMaterial({ color: 0xdde3e8, roughness: 0.9 }),
  wallLow: new THREE.MeshStandardMaterial({ color: 0x5e7486, roughness: 0.8 }),
  benchTop: new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.35, metalness: 0.1 }),
  cabinet: new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6 }),
  handle: new THREE.MeshStandardMaterial({ color: 0x8a939d, roughness: 0.3, metalness: 0.8 }),
  hood: new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.5 }),
  hoodInner: new THREE.MeshStandardMaterial({ color: 0x5d666f, roughness: 0.45, metalness: 0.4 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.18, depthWrite: false }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.35, metalness: 0.85 }),
};

function box(w, h, d, m, x, y, z, parent) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

export function buildLab(scene) {
  const room = new THREE.Group();
  room.name = 'room';
  scene.add(room);

  // пол, стены, потолок
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat.floor());
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);
  const W = 9, D = 8, H = 3.2;
  const wall = (w, x, z, ry) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat.wall);
    m.position.y = H / 2; g.add(m);
    const low = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), mat.wallLow);
    low.position.set(0, 0.06, 0.002); g.add(low);
    g.position.set(x, 0, z); g.rotation.y = ry;
    room.add(g);
  };
  wall(W, 0, -1.6, 0);
  wall(W, 0, D - 1.6, Math.PI);
  wall(D, -W / 2, D / 2 - 1.6, Math.PI / 2);
  wall(D, W / 2, D / 2 - 1.6, -Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, D / 2 - 1.6); room.add(ceil);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  for (const [x, z] of [[-2, 0], [2, 0], [-2, 3], [2, 3], [0, -0.6]]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), lampMat);
    l.rotation.x = Math.PI / 2; l.position.set(x, H - 0.01, z); room.add(l);
  }

  // основной стол
  const { benchY, benchZ, hood } = LAYOUT;
  box(3.0, 0.04, 0.82, mat.benchTop, 0, benchY - 0.02, benchZ, room);
  box(2.96, benchY - 0.1, 0.76, mat.cabinet, 0, (benchY - 0.1) / 2 + 0.06, benchZ - 0.02, room);
  for (let i = 0; i < 4; i++) {
    const x = -1.11 + i * 0.74;
    box(0.7, benchY - 0.18, 0.005, new THREE.MeshStandardMaterial({ color: 0xf6f7f8, roughness: 0.5 }), x, (benchY - 0.18) / 2 + 0.08, benchZ + 0.36, room);
    box(0.18, 0.015, 0.02, mat.handle, x, benchY - 0.2, benchZ + 0.37, room);
  }

  // вытяжной шкаф
  const hw = hood.x1 - hood.x0, hd = hood.zFront - hood.zBack;
  const hz = (hood.zFront + hood.zBack) / 2;
  const top = benchY + hood.h;
  box(0.05, hood.h, hd, mat.hood, hood.x0, benchY + hood.h / 2, hz, room);
  box(0.05, hood.h, hd, mat.hood, hood.x1, benchY + hood.h / 2, hz, room);
  // внутренняя облицовка (тёмная нержавейка — на ней виден пар)
  box(0.005, hood.h - 0.06, hd - 0.04, mat.hoodInner, hood.x0 + 0.028, benchY + hood.h / 2, hz, room);
  box(0.005, hood.h - 0.06, hd - 0.04, mat.hoodInner, hood.x1 - 0.028, benchY + hood.h / 2, hz, room);
  box(hw + 0.05, 0.05, hd, mat.hood, 0, top, hz, room);
  box(hw, hood.h, 0.03, mat.hoodInner, 0, benchY + hood.h / 2, hood.zBack, room);
  box(hw + 0.05, 0.28, 0.06, mat.hood, 0, top - 0.14, hood.zFront, room); // козырёк
  // поднятая створка (стекло)
  const sash = box(hw - 0.04, 0.24, 0.012, mat.glass, 0, top - 0.17, hood.zFront + 0.035, room);
  sash.renderOrder = 10;
  box(hw - 0.04, 0.02, 0.03, mat.handle, 0, top - 0.3, hood.zFront + 0.045, room);
  // воздуховод
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, H - top, 24), mat.steel);
  duct.position.set(0, top + (H - top) / 2, hz - 0.1);
  room.add(duct);
  // подсветка шкафа
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(hw - 0.2, 0.12), lampMat);
  hl.rotation.x = Math.PI / 2; hl.position.set(0, top - 0.03, hz - 0.05); room.add(hl);
  // табличка на шкафу
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), new THREE.MeshBasicMaterial({
    map: canvasTex(1000, 200, (c, w, h) => {
      c.fillStyle = '#ffcc00'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.font = '700 64px Inter, Roboto, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(tr('⚠  H₂S · ЛОС · РАБОТАТЬ ПОД ТЯГОЙ', '⚠  H₂S · ҰОҚ · СОРУМЕН ЖҰМЫС ІСТЕУ', '⚠  H₂S · VOC · WORK UNDER EXHAUST'), w / 2, h / 2 + 4);
    }), toneMapped: false,
  }));
  sign.position.set(0, top - 0.14, hood.zFront + 0.035);
  room.add(sign);

  // боковой стол с посудой
  box(1.6, 0.04, 0.7, mat.benchTop, -3.3, benchY - 0.02, -1.2, room);
  box(1.56, benchY - 0.1, 0.64, mat.cabinet, -3.3, (benchY - 0.1) / 2 + 0.06, -1.22, room);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f6ff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
  const liq = [0x3b2a1a, 0x7a5a2a, 0xd9c08a, 0x1d4f7a];
  for (let i = 0; i < 6; i++) {
    const r = 0.035 + (i % 3) * 0.01, hh = 0.1 + (i % 2) * 0.06;
    const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 20, 1, true), glassMat);
    g.position.set(-3.85 + i * 0.2, benchY + hh / 2, -1.25 + (i % 2) * 0.12);
    room.add(g);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, hh * 0.5, 20), new THREE.MeshStandardMaterial({ color: liq[i % 4], roughness: 0.2 }));
    l.position.set(g.position.x, benchY + hh * 0.25, g.position.z);
    room.add(l);
  }

  // плакат с исходным наброском
  const loader = new THREE.TextureLoader();
  const sketchTex = loader.load(`${import.meta.env.BASE_URL}sketch.jpg`);
  sketchTex.colorSpace = THREE.SRGBColorSpace;
  const frame = box(0.92, 1.22, 0.02, new THREE.MeshStandardMaterial({ color: 0x2b2f36 }), -2.2, 1.65, -1.585, room);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.12), new THREE.MeshBasicMaterial({ map: sketchTex, toneMapped: false }));
  poster.position.set(-2.2, 1.65, -1.573);
  room.add(poster);
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.12), new THREE.MeshBasicMaterial({
    map: canvasTex(840, 120, (c, w, h) => {
      c.fillStyle = '#2b2f36'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = '600 36px Inter, Roboto, sans-serif';
      c.fillText(tr('Исходная постановка: куб нефтешлама,', 'Бастапқы қойылым: мұнай шламы текшесі,', 'Original setup: a cube of oil sludge,'), 16, 48);
      c.fillStyle = '#ffb27a'; c.fillText(tr('нагрев потоком (U₀, T₀, ε₀) снизу', 'астынан ағынмен (U₀, T₀, ε₀) қыздыру', 'heated from below by a flow (U₀, T₀, ε₀)'), 16, 96);
    }), toneMapped: false,
  }));
  cap.position.set(-2.2, 0.97, -1.573);
  room.add(cap);
  frame.name = 'poster';

  // контактная тень под установкой
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }), transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(-0.08, benchY + 0.002, LAYOUT.sampleCenter.z);
  scene.add(shadow);

  return { room, shadow };
}

// Маленький «ЖК-дисплей» прибора (только вывод)
export class Display {
  constructor(w, h, px = 512) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px; this.canvas.height = Math.round((px * h) / w);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
  }
  draw(fn) {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = '#0b1a14'; c.fillRect(0, 0, w, h);
    fn(c, w, h);
    this.tex.needsUpdate = true;
  }
}

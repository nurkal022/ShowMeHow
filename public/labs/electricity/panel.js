/** Плоский экран с canvas-текстурой: табло, схема, график. draw(ctx, w, h) перерисовывает. */
import * as THREE from 'three';

export function canvasPanel(width, height, px = 512, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * height) / width);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = opts.lit
    ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 })
    : new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return {
    mesh, ctx, canvas,
    draw(fn) { fn(ctx, canvas.width, canvas.height); tex.needsUpdate = true; },
  };
}

/** Мягкое круглое свечение для ореолов ламп и искр. */
export function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,160,40,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

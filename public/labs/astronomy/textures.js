/**
 * Процедурные текстуры планет на canvas: без загрузки картинок, по 256×128 —
 * этого хватает для шаров размером в несколько сантиметров и не грузит Quest.
 */
import * as THREE from 'three';

function canvas(w = 256, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Детерминированный шум, чтобы планета выглядела одинаково при каждом заходе.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Полосатая планета (Юпитер, Сатурн, Нептун): горизонтальные полосы с лёгким шумом. */
export function bandsTexture(colors, seed = 1, spot = null) {
  const [c, ctx] = canvas();
  const r = rng(seed);
  let y = 0;
  while (y < c.height) {
    const h = 3 + r() * 12;
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.fillRect(0, y, c.width, h + 1);
    y += h;
  }
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.fillRect(r() * c.width, r() * c.height, 10 + r() * 40, 1 + r() * 2);
  }
  ctx.globalAlpha = 1;
  if (spot) {
    ctx.fillStyle = spot;
    ctx.beginPath(); ctx.ellipse(c.width * 0.62, c.height * 0.64, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  return tex(c);
}

/** Каменистая поверхность: базовый цвет и пятна-кратеры. */
export function rockyTexture(base, spots, seed = 2) {
  const [c, ctx] = canvas();
  const r = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 140; i++) {
    ctx.globalAlpha = 0.15 + r() * 0.35;
    ctx.fillStyle = spots[Math.floor(r() * spots.length)];
    ctx.beginPath(); ctx.arc(r() * c.width, r() * c.height, 1 + r() * 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return tex(c);
}

/** Земля: океан, материки-кляксы, полярные шапки, облака. */
export function earthTexture() {
  const [c, ctx] = canvas(512, 256);
  const r = rng(7);
  ctx.fillStyle = '#1d4f9a'; ctx.fillRect(0, 0, c.width, c.height);
  const land = ['#3f7d3a', '#5a8f3c', '#8a7a48', '#4d7a34'];
  for (let k = 0; k < 9; k++) {
    const cx = r() * c.width, cy = 50 + r() * 150;
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = land[Math.floor(r() * land.length)];
      ctx.beginPath();
      ctx.ellipse(cx + (r() - 0.5) * 90, cy + (r() - 0.5) * 60, 8 + r() * 22, 6 + r() * 16, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#eef4fb';
  ctx.fillRect(0, 0, c.width, 16); ctx.fillRect(0, c.height - 18, c.width, 18);
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 70; i++) {
    ctx.beginPath(); ctx.ellipse(r() * c.width, 20 + r() * 216, 10 + r() * 30, 2 + r() * 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return tex(c);
}

/** Солнце: оранжево-жёлтая грануляция и пара пятен. */
export function sunTexture() {
  const [c, ctx] = canvas();
  const r = rng(11);
  ctx.fillStyle = '#ffb627'; ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = r() > 0.5 ? '#fff1a8' : '#ff8a1e';
    ctx.beginPath(); ctx.arc(r() * c.width, r() * c.height, 1 + r() * 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 0.7; ctx.fillStyle = '#7a3300';
  ctx.beginPath(); ctx.arc(80, 60, 3, 0, Math.PI * 2); ctx.arc(170, 74, 2, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  return tex(c);
}

/** Мягкое свечение: радиальный градиент для аддитивного спрайта. */
export function glowTexture(inner = 'rgba(255,220,120,1)', mid = 'rgba(255,150,40,0.35)') {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** Кольца Сатурна: полосы с прозрачностью вдоль радиуса (u — радиус после переразметки). */
export function ringTexture() {
  const [c, ctx] = canvas(256, 4);
  const r = rng(5);
  for (let x = 0; x < 256; x++) {
    const gap = x > 150 && x < 162; // щель Кассини
    const a = gap ? 0.05 : 0.35 + r() * 0.5;
    const l = 180 + Math.floor(r() * 50);
    ctx.fillStyle = `rgba(${l},${l - 20},${l - 50},${a})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  return tex(c);
}

/** RingGeometry с u, идущим по радиусу, — чтобы полосатая текстура легла кольцами. */
export function ringGeometry(inner, outer) {
  const g = new THREE.RingGeometry(inner, outer, 96, 1);
  const pos = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  return g;
}

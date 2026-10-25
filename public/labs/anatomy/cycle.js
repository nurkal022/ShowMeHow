/**
 * Сердечный цикл: одни часы на всю лабораторию. Удар начинается с систолы
 * предсердий (зубец P), затем систола желудочков (QRS … T), затем диастола.
 * При учащении пульса укорачивается в основном диастола — как у живого сердца.
 */
import * as THREE from 'three';
import { tr } from '../common.js';

export const PHASES = {
  atrial: { name: tr('Систола предсердий', 'Жүрекшелер систоласы', 'Atrial systole'), color: '#ffcc4d',
    text: tr('Предсердия сжимаются и дожимают кровь в желудочки.\nТрёхстворчатый и митральный клапаны открыты.', 'Жүрекшелер жиырылып, қанды қарыншаларға толық айдайды.\nҮшжармалы және митралды қақпақшалар ашық.', 'The atria contract and top up the ventricles with blood.\nThe tricuspid and mitral valves are open.') },
  ventricular: { name: tr('Систола желудочков', 'Қарыншалар систоласы', 'Ventricular systole'), color: '#ff5d6c',
    text: tr('Желудочки сжимаются: створчатые клапаны захлопнулись («лаб»),\nаортальный и лёгочный открыты — кровь уходит в артерии.', 'Қарыншалар жиырылады: жармалы қақпақшалар жабылды («лаб»),\nқолқа мен өкпе қақпақшалары ашық — қан артерияларға кетеді.', 'The ventricles contract: the AV valves snap shut ("lub"),\nthe aortic and pulmonary valves open — blood leaves into the arteries.') },
  diastole: { name: tr('Диастола', 'Диастола', 'Diastole'), color: '#6fb6ff',
    text: tr('Сердце расслаблено: полулунные клапаны закрылись («даб»),\nкровь из вен свободно наполняет предсердия и желудочки.', 'Жүрек босаңсыған: жарты ай тәрізді қақпақшалар жабылды («даб»),\nвеналардан келген қан жүрекшелер мен қарыншаларды еркін толтырады.', 'The heart relaxes: the semilunar valves close ("dub"),\nblood from the veins freely fills the atria and ventricles.') },
};

export function timing(bpm) {
  const T = 60 / bpm;
  const s = Math.sqrt(T / 0.857);
  return { T, Ta: 0.11 * s, Ts: 0.32 * s };
}

/** Состояние сердца в момент t ∈ [0, T) от начала удара. */
export function cycleState(t, tm) {
  const { T, Ta, Ts } = tm;
  let phase, k;
  if (t < Ta) { phase = 'atrial'; k = t / Ta; }
  else if (t < Ta + Ts) { phase = 'ventricular'; k = (t - Ta) / Ts; }
  else { phase = 'diastole'; k = (t - Ta - Ts) / Math.max(0.01, T - Ta - Ts); }
  const atria = phase === 'atrial' ? Math.sin(Math.PI * k) : 0;
  const vent = phase === 'ventricular' ? Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.08)), 0.75) : 0;
  return {
    phase, k, atria, vent,
    avOpen: phase !== 'ventricular',
    slOpen: phase === 'ventricular' && k > 0.1 && k < 0.92,
  };
}

/** ЭКГ (II отведение, условные мВ) в тот же момент цикла. */
export function ecg(t, tm) {
  const { Ta, Ts } = tm;
  const g = (c, w, a) => a * Math.exp(-((t - c) ** 2) / (2 * w * w));
  return g(0.045, 0.02, 0.15) + g(Ta - 0.004, 0.007, -0.12) + g(Ta + 0.016, 0.009, 1.0)
    + g(Ta + 0.04, 0.01, -0.3) + g(Ta + Ts - 0.085, 0.038, 0.3);
}

/** Спрайт с надписью, которая перерисовывается в том же canvas — без утечки текстур. */
export function liveSign({ width = 1200, height = 200, scale = 0.0021 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(width * scale, height * scale, 1);
  sprite.renderOrder = 998;
  sprite.raycast = () => {};
  sprite.set = (title, body = '', color = '#eef2f7') => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(14, 18, 28, 0.86)';
    ctx.beginPath(); ctx.roundRect(0, 0, width, height, 26); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(0, 0, 10, height);
    ctx.textBaseline = 'top';
    ctx.font = "700 50px Inter, system-ui, sans-serif";
    ctx.fillText(title, 40, 22);
    ctx.fillStyle = '#c3cbd8';
    ctx.font = "500 36px Inter, system-ui, sans-serif";
    String(body).split('\n').forEach((l, i) => ctx.fillText(l, 40, 92 + i * 46));
    tex.needsUpdate = true;
  };
  return sprite;
}

/**
 * Монитор ЭКГ: бегущая развёртка как у прикроватного монитора, сверху ЧСС и фаза,
 * снизу полоса цикла с бегунком. Холст маленький — на Quest обновляется каждый кадр.
 */
export function ecgMonitor() {
  const W = 640, H = 320, TOP = 62, BOT = 268;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Сетка — отдельным холстом, ею же «стираем» место перед бегунком.
  const grid = document.createElement('canvas');
  grid.width = W; grid.height = H;
  const g = grid.getContext('2d');
  g.fillStyle = '#04120c'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) { g.fillStyle = x % 80 === 0 ? '#0f3a26' : '#0a2419'; g.fillRect(x, TOP, 1, BOT - TOP); }
  for (let y = TOP; y < BOT; y += 16) { g.fillStyle = (y - TOP) % 80 === 0 ? '#0f3a26' : '#0a2419'; g.fillRect(0, y, W, 1); }
  ctx.drawImage(grid, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.66, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.5, metalness: 0.4 }));
  frame.position.z = -0.035;
  group.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.58), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  group.add(screen);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
  stand.position.set(0, -0.9, -0.05);
  group.add(stand);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0x2a3445 }));
  foot.position.set(0, -1.5, -0.05);
  group.add(foot);

  let x = 0, lastY = null;
  const pxPerSec = W / 3.2;
  const yOf = (v) => TOP + (BOT - TOP) * 0.62 - v * (BOT - TOP) * 0.5;

  group.update = (dt, tBeat, tm, st, bpm) => {
    const nx = x + dt * pxPerSec;
    const y = yOf(ecg(tBeat, tm));
    // «Стираем» полосу впереди развёртки.
    const clearW = 26;
    const cx = Math.floor(nx) % W;
    ctx.drawImage(grid, cx, TOP, Math.min(clearW, W - cx), BOT - TOP, cx, TOP, Math.min(clearW, W - cx), BOT - TOP);
    if (cx + clearW > W) ctx.drawImage(grid, 0, TOP, cx + clearW - W, BOT - TOP, 0, TOP, cx + clearW - W, BOT - TOP);
    ctx.strokeStyle = '#5bf28a'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (lastY !== null && nx < W) { ctx.moveTo(x, lastY); ctx.lineTo(nx, y); }
    ctx.stroke();
    x = nx >= W ? nx - W : nx;
    lastY = y;

    // Шапка: ЧСС и фаза.
    const ph = PHASES[st.phase];
    ctx.fillStyle = '#071019'; ctx.fillRect(0, 0, W, TOP);
    ctx.textBaseline = 'middle';
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.fillStyle = '#5bf28a';
    ctx.fillText(`♥ ${Math.round(bpm)}`, 18, TOP / 2);
    ctx.font = "500 18px Inter, system-ui, sans-serif";
    ctx.fillStyle = '#7fae95';
    ctx.fillText(tr('уд/мин · II отв.', 'соқ/мин · II тіркеме', 'bpm · lead II'), 128, TOP / 2 + 6);
    ctx.font = "700 26px Inter, system-ui, sans-serif";
    ctx.fillStyle = ph.color;
    ctx.textAlign = 'right';
    ctx.fillText(ph.name, W - 18, TOP / 2);
    ctx.textAlign = 'left';

    // Полоса цикла.
    ctx.fillStyle = '#071019'; ctx.fillRect(0, BOT, W, H - BOT);
    const bx = 18, bw = W - 36, by = BOT + 14, bh = 14;
    const seg = [['atrial', tm.Ta], ['ventricular', tm.Ts], ['diastole', tm.T - tm.Ta - tm.Ts]];
    let ox = bx;
    ctx.font = "600 15px Inter, system-ui, sans-serif";
    for (const [k, d] of seg) {
      const w = (d / tm.T) * bw;
      ctx.globalAlpha = st.phase === k ? 1 : 0.35;
      ctx.fillStyle = PHASES[k].color; ctx.fillRect(ox, by, w - 2, bh);
      ctx.globalAlpha = 1;
      if (w > 60) { ctx.fillStyle = '#9fb0c4'; ctx.fillText(k === 'atrial' ? tr('предс.', 'жүрекш.', 'atria') : k === 'ventricular' ? tr('систола Ж', 'систола Қ', 'V systole') : tr('диастола', 'диастола', 'diastole'), ox + 4, by + 30); }
      ox += w;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx + (tBeat / tm.T) * bw - 1.5, by - 5, 3, bh + 10);
    tex.needsUpdate = true;
  };
  return group;
}

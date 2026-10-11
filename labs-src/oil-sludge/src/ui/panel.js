// Панель интерфейса в 3D: рисуется на canvas, отображается текстурой, ввод — по UV луча.
import * as THREE from 'three';

export const THEME = {
  bg: 'rgba(14,18,24,0.94)',
  bg2: '#1b222d',
  line: '#2c3644',
  text: '#e8edf3',
  dim: '#93a1b3',
  accent: '#ff8a3d',
  accent2: '#3dc3ff',
  ok: '#5bd68a',
  warn: '#ffcc4d',
  bad: '#ff5d5d',
  font: '"Inter", "Roboto", "Segoe UI", system-ui, sans-serif',
};

export class Panel {
  constructor({ width = 0.6, height = 0.45, px = 1024, title = '' }) {
    this.w = px;
    this.h = Math.round((px * height) / width);
    this.title = title;
    this.canvas = document.createElement('canvas');
    // логические координаты — px; физический canvas меньше (для Quest достаточно ~0.7)
    this.res = 0.7;
    this.canvas.width = Math.round(this.w * this.res);
    this.canvas.height = Math.round(this.h * this.res);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    this.mesh.userData.panel = this;
    this.widgets = [];
    this.hover = null;            // объединённое наведение (для отрисовки)
    this.hovers = new Map();      // наведение по каждому указателю
    this.active = null;
    this.dirty = true;
    this.autoRefresh = 0; // Гц, для живых данных
    this.movable = true;  // перенос за заголовок
    this._last = 0;
  }

  // ---- виджеты ----
  button(x, y, w, h, label, onClick, opts = {}) {
    const b = { kind: 'button', x, y, w, h, label, onClick, ...opts };
    this.widgets.push(b);
    return b;
  }
  slider(x, y, w, opts) {
    const s = { kind: 'slider', x, y, w, h: 56, ...opts };
    this.widgets.push(s);
    return s;
  }
  clearWidgets() { this.widgets = []; this.hover = null; this.hovers.clear(); this.active = null; }
  setHover(id, w) {
    if (this.hovers.get(id) === w) return;
    if (w) this.hovers.set(id, w); else this.hovers.delete(id);
    const set = new Set(this.hovers.values());
    const key = [...set].map((x) => this.widgets.indexOf(x)).sort().join();
    if (key !== this._hoverKey) { this._hoverKey = key; this.dirty = true; }
    this.hoverSet = set;
    this.hover = w ?? [...set][0] ?? null;
  }
  isHover(w) { return this.hoverSet?.has(w) ?? false; }

  // ---- ввод ----
  hit(px, py) {
    for (let i = this.widgets.length - 1; i >= 0; i--) {
      const wd = this.widgets[i];
      if (wd.hidden?.()) continue;
      const pad = wd.kind === 'slider' ? 10 : 0;
      if (px >= wd.x - pad && px <= wd.x + wd.w + pad && py >= wd.y - pad && py <= wd.y + wd.h + pad) return wd;
    }
    return null;
  }

  pointer(type, uv, id = 'p') {
    const px = uv.x * this.w, py = (1 - uv.y) * this.h;
    if (type === 'move') {
      if (this.active?.kind === 'slider') { this.setSlider(this.active, px); return; }
      this.setHover(id, this.hit(px, py));
    } else if (type === 'down') {
      const h = this.hit(px, py);
      if (!h && this.movable && py < 92) return 'move'; // заголовок — ручка переноса
      this.active = h;
      if (h?.kind === 'slider') this.setSlider(h, px);
      this.dirty = true;
    } else if (type === 'up') {
      const a = this.active;
      this.active = null;
      if (a?.kind === 'button' && this.hit(px, py) === a && !a.disabled?.()) a.onClick?.();
      if (a?.kind === 'slider') a.onRelease?.();
      this.dirty = true;
    }
  }
  leave(id = 'p') { this.setHover(id, null); }
  isTitle(uv) { const py = (1 - uv.y) * this.h; return this.movable && py < 92 && !this.hit(uv.x * this.w, py); }
  release() { if (this.active) { this.active.onRelease?.(); this.active = null; this.dirty = true; } }

  setSlider(s, px) {
    let f = Math.min(1, Math.max(0, (px - s.x) / s.w));
    let v = s.log ? Math.exp(Math.log(s.min) + f * (Math.log(s.max) - Math.log(s.min))) : s.min + f * (s.max - s.min);
    if (s.step) v = Math.round(v / s.step) * s.step;
    if (s.snap) for (const sv of s.snap) if (Math.abs(v - sv) < (s.max - s.min) * 0.015) v = sv;
    if (v !== s.get()) { s.set(v); this.dirty = true; }
  }

  // ---- отрисовка ----
  // возвращает true, если текстура перерисована (в кадре допускается ограниченное число загрузок)
  update(now, allowDraw = true) {
    // живые данные перерисовываются только во время опыта (экономия загрузок текстур на Quest)
    if (this.autoRefresh && (this.live?.() ?? true) && now - this._last > 1000 / this.autoRefresh) this.dirty = true;
    if (!this.dirty || !allowDraw) return false;
    this._last = now;
    this.dirty = false;
    const c = this.ctx;
    c.setTransform(this.res, 0, 0, this.res, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    roundRect(c, 0, 0, this.w, this.h, 28);
    c.fillStyle = THEME.bg; c.fill();
    c.lineWidth = 3; c.strokeStyle = THEME.line; c.stroke();
    if (this.title) {
      c.fillStyle = THEME.text;
      c.font = `700 34px ${THEME.font}`;
      c.textBaseline = 'middle';
      c.fillText(this.title, 32, 44);
      c.fillStyle = THEME.accent;
      c.fillRect(32, 72, 64, 4);
    }
    if (this.movable) {
      // значок «перенести» — шесть точек в правом верхнем углу
      c.fillStyle = '#56657a';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { c.beginPath(); c.arc(this.w - 40 + j * 14, 30 + i * 14, 4, 0, 7); c.fill(); }
    }
    this.draw?.(c);
    for (const wd of this.widgets) {
      if (wd.hidden?.()) continue;
      if (wd.kind === 'button') this.drawButton(c, wd);
      else this.drawSlider(c, wd);
    }
    this.texture.needsUpdate = true;
    return true;
  }

  drawButton(c, b) {
    const on = b.active?.() ?? false;
    const dis = b.disabled?.() ?? false;
    const hov = this.isHover(b);
    roundRect(c, b.x, b.y, b.w, b.h, 12);
    c.fillStyle = on ? (b.color ?? THEME.accent) : hov ? '#2a3442' : THEME.bg2;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = on ? (b.color ?? THEME.accent) : hov ? '#4a5a70' : THEME.line;
    c.stroke();
    c.fillStyle = dis ? '#55606f' : on ? '#10141a' : THEME.text;
    c.font = `${b.weight ?? 600} ${b.size ?? 24}px ${THEME.font}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const label = typeof b.label === 'function' ? b.label() : b.label;
    c.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    c.textAlign = 'left';
  }

  drawSlider(c, s) {
    const v = s.get();
    const f = s.log ? (Math.log(v) - Math.log(s.min)) / (Math.log(s.max) - Math.log(s.min)) : (v - s.min) / (s.max - s.min);
    c.font = `500 22px ${THEME.font}`;
    c.fillStyle = THEME.dim;
    c.textBaseline = 'alphabetic';
    c.fillText(s.label, s.x, s.y + 16);
    c.textAlign = 'right';
    c.fillStyle = THEME.text;
    c.font = `700 24px ${THEME.font}`;
    c.fillText(s.format ? s.format(v) : v.toFixed(2), s.x + s.w, s.y + 16);
    c.textAlign = 'left';
    const ty = s.y + 38;
    roundRect(c, s.x, ty - 5, s.w, 10, 5);
    c.fillStyle = '#2a3442'; c.fill();
    roundRect(c, s.x, ty - 5, Math.max(10, s.w * f), 10, 5);
    c.fillStyle = s.color ?? THEME.accent; c.fill();
    for (const mk of s.marks ?? []) {
      const mf = (mk - s.min) / (s.max - s.min);
      c.fillStyle = '#6c7a8d';
      c.fillRect(s.x + s.w * mf - 1, ty + 8, 2, 8);
    }
    c.beginPath();
    c.arc(s.x + s.w * f, ty, this.active === s || this.isHover(s) ? 15 : 12, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill();
  }
}

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Перенос текста по ширине; возвращает y после последней строки
export function wrapText(c, text, x, y, maxW, lineH) {
  for (const para of String(text).split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > maxW && line) { c.fillText(line, x, y); y += lineH; line = w; }
      else line = test;
    }
    c.fillText(line, x, y);
    y += lineH;
  }
  return y;
}

export const fmt = {
  t(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  },
  n(v, d = 1) { return Number.isFinite(v) ? v.toFixed(d) : '—'; },
  sci(v, d = 1) {
    if (!Number.isFinite(v) || v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    const mnt = v / 10 ** e;
    const sup = String(e).replace(/-/g, '⁻').replace(/\d/g, (ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[ch]);
    return `${mnt.toFixed(d)}·10${sup}`;
  },
};

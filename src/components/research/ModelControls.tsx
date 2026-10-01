'use client';
import { useEffect, useRef, useState } from 'react';
import type { ModelFigure, ModelParam } from '@/lib/research/doc';
import { IconPlay } from '@/components/icons';
import { useT } from '@/i18n/client';
import { researchEditor } from '@/i18n/messages/research-editor';

/**
 * Части редактора модели: слайдер параметра и бегущая по решению точка.
 * Вынесены из ModelEditor, чтобы 60 кадров в секунду анимации перерисовывали
 * только маленький блок с подписью, а не весь редактор с формулами.
 */

const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '—');

/* ------------------------------------ слайдер параметра ------------------------------------ */

export function ParamSlider({ p, value, readOnly, animating, onLive, onCommit, onRange, onAnimate }: {
  p: ModelParam; value: number; readOnly: boolean; animating: boolean;
  onLive: (v: number) => void; onCommit: (v: number) => void;
  onRange: (patch: Partial<ModelParam>) => void; onAnimate: () => void;
}) {
  const t = useT(researchEditor);
  const [editing, setEditing] = useState<string | null>(null);
  const span = p.max - p.min;
  const step = span / 500 || 0.01;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - p.min) / span) * 100)) : 0;
  const clamp = (v: number) => Math.min(p.max, Math.max(p.min, v));

  /** Точное число: вне пределов — раздвигаем пределы, а не обрезаем то, что человек ввёл. */
  const applyTyped = () => {
    const v = Number((editing ?? '').replace(',', '.'));
    setEditing(null);
    if (!Number.isFinite(v) || editing === null || editing.trim() === '') return;
    if (v < p.min || v > p.max) onRange({ min: Math.min(p.min, v), max: Math.max(p.max, v), value: v });
    else onCommit(v);
  };

  return (
    <div className="rs-param">
      <div className="rs-param-head">
        <span className="rs-param-title">
          <span className="rs-mono rs-param-name">{p.name}</span>
          {p.hint && <span className="rs-param-hint">{p.hint}</span>}
        </span>
        {editing !== null ? (
          <input className="rs-param-edit rs-mono" autoFocus inputMode="decimal" aria-label={t('exactValue', { name: p.name })} value={editing}
            onChange={(e) => setEditing(e.target.value)} onBlur={applyTyped}
            onKeyDown={(e) => { if (e.key === 'Enter') applyTyped(); if (e.key === 'Escape') setEditing(null); }} />
        ) : (
          <button type="button" className="rs-mono rs-param-value" title={t('dblClick')}
            onDoubleClick={() => setEditing(String(Number(value.toPrecision(6))))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditing(String(Number(value.toPrecision(6)))); } }}>{fmt(value)}</button>
        )}
        <button type="button" className={animating ? 'icon-btn on' : 'icon-btn'} aria-label={t('sweep', { name: p.name })}
          title={t('sweepTitle')} onClick={onAnimate}><IconPlay size={13} /></button>
      </div>
      <div className="rs-slider-row">
        {readOnly ? <span className="rs-slider-lim">{fmt(p.min)}</span>
          : <input type="number" className="rs-slider-lim-input" aria-label={t('minOf', { name: p.name })} value={p.min} onChange={(e) => onRange({ min: Number(e.target.value) })} />}
        <div className="rs-slider" style={{ '--pct': `${pct}%` } as React.CSSProperties}>
          <input type="range" min={p.min} max={p.max} step={step} value={value} aria-label={p.hint ? `${p.name} — ${p.hint}` : p.name}
            aria-valuetext={fmt(value)}
            onChange={(e) => onLive(Number(e.target.value))}
            onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
            onKeyDown={(e) => {
              // Тонкая подстройка: стрелка — 1/500 диапазона, Shift — ×10, Alt — ×0,1.
              const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
              onCommit(clamp(Number((value + dir * step * k).toPrecision(10))));
            }}
            onKeyUp={(e) => { if (!e.key.startsWith('Arrow')) onCommit(Number((e.target as HTMLInputElement).value)); }} />
          <output className="rs-slider-bubble" style={{ left: `calc(${pct}% + ${(8 - pct * 0.16).toFixed(2)}px)` }}>{fmt(value)}</output>
        </div>
        {readOnly ? <span className="rs-slider-lim">{fmt(p.max)}</span>
          : <input type="number" className="rs-slider-lim-input" aria-label={t('maxOf', { name: p.name })} value={p.max} onChange={(e) => onRange({ max: Number(e.target.value) })} />}
      </div>
    </div>
  );
}

/* ------------------------------------ бегущая точка ------------------------------------ */

const DURATION = 6000;

/** Значение кривой при данном x (x растёт): двоичный поиск и линейная интерполяция. */
function valueAt(points: { x: number; y: number }[], x: number): number {
  const n = points.length;
  if (!n || x < points[0].x || x > points[n - 1].x) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid].x <= x) lo = mid; else hi = mid; }
  const a = points[lo];
  const b = points[hi];
  return b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

interface Frame { t: number; items: { label: string; value: number; color: string; x: number; y: number }[] }

/** Положение точки в момент u ∈ [0, 1]: для времени — по оси x, для фазы — по индексу траектории. */
function frameAt(built: ModelFigure, u: number): Frame | null {
  const cur = built.current.filter((c) => c.points.length > 1);
  if (!cur.length) return null;
  if (built.view === 'phase') {
    const pts = cur[0].points;
    const f = u * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const k = f - i;
    const lerp = (a: number, b: number) => a + (b - a) * k;
    const x = lerp(pts[i].x, pts[i + 1].x);
    const y = lerp(pts[i].y, pts[i + 1].y);
    const times = built.times ?? [];
    const color = cur[0].color ?? '#0072B2';
    return {
      t: times.length ? lerp(times[i], times[i + 1] ?? times[i]) : NaN,
      items: [{ label: built.spec.xLabel || 'x', value: x, color, x, y }, { label: built.spec.yLabel || 'y', value: y, color, x, y }],
    };
  }
  const x0 = Math.min(...cur.map((c) => c.points[0].x));
  const x1 = Math.max(...cur.map((c) => c.points[c.points.length - 1].x));
  const t = x0 + (x1 - x0) * u;
  return { t, items: cur.map((c) => { const y = valueAt(c.points, t); return { label: c.label, value: y, color: c.color ?? '#0072B2', x: t, y }; }) };
}

/** Слой анимации кладём прямо в SVG рисунка: координаты берём из его data-map. */
function drawLayer(host: HTMLElement | null, built: ModelFigure, frame: Frame | null, u: number) {
  const svg = host?.querySelector('svg[data-map]');
  if (!svg) return;
  let layer = svg.querySelector('g.rs-anim-layer');
  if (!frame) { layer?.remove(); return; }
  if (!layer) {
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('class', 'rs-anim-layer');
    svg.appendChild(layer);
  }
  const [l, t, pw, ph, x0, x1, y0, y1, xl, yl] = (svg.getAttribute('data-map') ?? '').split(',').map(Number);
  const tx = (v: number) => (xl ? Math.log10(v) : v);
  const ty = (v: number) => (yl ? Math.log10(v) : v);
  const X = (v: number) => l + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * pw;
  const Y = (v: number) => t + ph - ((ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * ph;
  const ok = (x: number, y: number) => Number.isFinite(X(x)) && Number.isFinite(Y(y)) && X(x) >= l - 1 && X(x) <= l + pw + 1 && Y(y) >= t - 1 && Y(y) <= t + ph + 1;
  const out: string[] = [];
  if (built.view === 'time') {
    const cx = X(frame.t);
    if (Number.isFinite(cx)) out.push(`<line x1="${cx.toFixed(2)}" x2="${cx.toFixed(2)}" y1="${t}" y2="${t + ph}" stroke="#1a1a1e" stroke-opacity=".45" stroke-dasharray="4 3"/>`);
  } else {
    // Короткий «хвост» за точкой — видно, куда она движется.
    const pts = built.current[0]?.points ?? [];
    const end = Math.round(u * (pts.length - 1));
    const tail = pts.slice(Math.max(0, end - Math.round(pts.length * 0.04)), end + 1).filter((p) => ok(p.x, p.y));
    if (tail.length > 1) out.push(`<path d="${tail.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('')}" fill="none" stroke="${frame.items[0].color}" stroke-width="6" stroke-linecap="round" stroke-opacity=".28"/>`);
  }
  const dots = built.view === 'phase' ? frame.items.slice(0, 1) : frame.items;
  dots.forEach((d) => {
    if (ok(d.x, d.y)) out.push(`<circle cx="${X(d.x).toFixed(2)}" cy="${Y(d.y).toFixed(2)}" r="5.5" fill="${d.color}" stroke="#ffffff" stroke-width="2"/>`);
  });
  layer.innerHTML = out.join('');
}

export function PointAnimator({ built, hostRef, xName }: { built: ModelFigure; hostRef: React.RefObject<HTMLElement | null>; xName: string }) {
  const t = useT(researchEditor);
  const [u, setU] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(false);
  const uRef = useRef(0);
  uRef.current = u;
  const frame = shown ? frameAt(built, u) : null;

  // Точку рисуем после каждого кадра и после каждой перерисовки SVG (слайдер, смена вида).
  useEffect(() => { drawLayer(hostRef.current, built, frame, u); });
  useEffect(() => () => drawLayer(hostRef.current, built, null, 0), [hostRef, built]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now() - (uRef.current >= 1 ? 0 : uRef.current) * DURATION;
    const tick = (now: number) => {
      const nu = (now - start) / DURATION;
      if (nu >= 1) { setU(1); setPlaying(false); return; }
      setU(nu);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Никакого автозапуска: анимация идёт только по нажатию (в том числе при prefers-reduced-motion).
  const toggle = () => {
    if (playing) { setPlaying(false); return; }
    if (u >= 1) setU(0);
    setShown(true);
    setPlaying(true);
  };

  if (!built.current.some((c) => c.points.length > 1)) return null;
  return (
    <div className="rs-anim">
      <button type="button" className={playing ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'} onClick={toggle} aria-pressed={playing}>
        {playing ? <span className="rs-anim-pause" aria-hidden="true" /> : <IconPlay size={13} />}{playing ? t('pause') : t('animate')}
      </button>
      <input type="range" className="rs-anim-scrub" min={0} max={1000} value={Math.round(u * 1000)} aria-label={t('scrub')}
        onChange={(e) => { setPlaying(false); setShown(true); setU(Number(e.target.value) / 1000); }} />
      {frame && (
        <span className="rs-anim-readout" aria-live="off">
          {Number.isFinite(frame.t) && <span><b>{xName}</b> = {fmt(frame.t)}</span>}
          {frame.items.map((it, i) => (
            <span key={i}><i style={{ background: it.color }} />{it.label.split(',')[0]} = {fmt(it.value)}</span>
          ))}
          <button type="button" className="rs-anim-hide" aria-label={t('hidePoint')} onClick={() => { setPlaying(false); setShown(false); setU(0); }}>×</button>
        </span>
      )}
    </div>
  );
}

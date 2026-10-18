'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useSetLocale, useT } from '@/i18n/client';
import { LOCALES, LOCALE_SHORT } from '@/i18n/config';
import { landing } from '@/i18n/messages/landing';
import { nav } from '@/i18n/messages/nav';
import { ICONS } from '@/components/NavLinks';
import type { NavSectionKey } from '@/lib/org/policy';
import TesseractMark from '@/components/TesseractMark';
import { DISCIPLINES, IH, IW, SCENES } from './scenes';

export interface LandingCard { href: string; img: string; title: string; tag: string; external: boolean }

/** Сколько держится сцена при автопрокрутке, мс. */
const DUR = 6000;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

/**
 * Волны внизу первого экрана: [базовая линия, [амплитуда, гармоника, фаза][], замкнута ли, период анимации, с].
 * Гармоники — целые числа периодов на 1440 единиц: путь шириной 2880 бесшовно повторяется, и движение
 * делает CSS-сдвиг на половину ширины. Раньше семь путей пересобирались каждый кадр — главный источник лагов.
 */
type Wave = [number, [number, number, number][], boolean, number];
const WAVES: Record<string, Wave> = {
  glow: [96, [[34, 1, 0], [14, 3, 1]], true, 46],
  back: [92, [[38, 1, .6], [12, 4, 2]], true, 38],
  mid: [118, [[30, 1, 1.4], [10, 4, .3]], true, 52],
  line2: [104, [[36, 1, 2.2], [9, 5, 1]], false, 42],
  front: [150, [[26, 1, 2.6], [8, 3, .8]], true, 60],
  edge: [150, [[26, 1, 2.6], [8, 3, .8]], false, 60],
  line1: [142, [[30, 1, 2.4], [9, 3, .5]], false, 56],
};
function wavePath([base, amps, closed]: Wave) {
  let d = '';
  for (let x = 0; x <= 2880; x += 16) {
    let y = base;
    for (const [a, k, p] of amps) y += a * Math.sin(x * (2 * Math.PI * k / 1440) + p);
    d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)} `;
  }
  return closed ? `${d}L2880 300 L0 300 Z` : d;
}
const WAVE_D = Object.fromEntries(Object.entries(WAVES).map(([k, w]) => [k, wavePath(w)]));

/** Живые тренажёры нового движка для блока «Потрогай прямо здесь». */
const LIVE = [
  { slug: 'kit-engine-phases', key: 'liveEngine' },
  { slug: 'kit-waves', key: 'liveWaves' },
  { slug: 'kit-orbit', key: 'liveOrbit' },
  { slug: 'kit-gas', key: 'liveGas' },
] as const;

export default function LandingView({ cards, startHref, registrationOpen, signedIn, sections, roleImgs = [] }: {
  roleImgs?: (string | null)[];
  cards: LandingCard[]; startHref: string; registrationOpen: boolean; signedIn: boolean; sections: { key: NavSectionKey; href: string }[];
}) {
  const t = useT(landing);
  const tn = useT(nav);
  const locale = useLocale();
  const setLocale = useSetLocale();

  const [scene, setScene] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [entering, setEntering] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [heroW, setHeroW] = useState(1440);
  const [heroH, setHeroH] = useState(860);
  const [navHov, setNavHov] = useState<number | null>(null);
  const [navRects, setNavRects] = useState<{ left: number; width: number }[]>([]);
  const [logoHov, setLogoHov] = useState(false);
  const [chip, setChip] = useState('all');
  const [dim, setDim] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const parRef = useRef<HTMLDivElement>(null);
  const starRef = useRef<HTMLCanvasElement>(null);
  const curRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<SVGSVGElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dimBgRef = useRef<HTMLDivElement>(null);
  const ctaBgRef = useRef<HTMLDivElement>(null);
  const hintDotRef = useRef<HTMLSpanElement>(null);

  // То, что читает цикл анимации, — в ref, чтобы не перезапускать его на каждый setState.
  const live = useRef({ hover: null as string | null, scene: 0 });
  live.current.hover = hover; live.current.scene = scene;
  const leaveTimer = useRef<number | undefined>(undefined);
  const enterTimer = useRef<number | undefined>(undefined);
  const dockTimer = useRef<number | undefined>(undefined);

  const go = useCallback((i: number) => {
    if (i === live.current.scene) return;
    window.clearTimeout(enterTimer.current);
    setPrev(live.current.scene); setScene(i); setEntering(true); setHover(null); setLast(null);
    enterTimer.current = window.setTimeout(() => setEntering(false), 40);
  }, []);

  // Автопрокрутка сцен: пока гость держит курсор на объекте, сцена не меняется.
  useEffect(() => {
    let timer: number;
    const arm = () => { timer = window.setTimeout(() => (live.current.hover ? arm() : go((live.current.scene + 1) % SCENES.length)), DUR); };
    arm();
    return () => window.clearTimeout(timer);
  }, [scene, go]);

  useEffect(() => {
    const a = window.setTimeout(() => setLoaded(true), 60);
    const b = window.setTimeout(() => setEntering(false), 80);
    return () => { window.clearTimeout(a); window.clearTimeout(b); window.clearTimeout(enterTimer.current); window.clearTimeout(leaveTimer.current); };
  }, []);

  // Размеры: ширина первого экрана (для подсказок у объектов), звёзды, подложка меню.
  useEffect(() => {
    const hero = heroRef.current, nav = navRef.current;
    if (!hero) return;
    const measure = () => {
      setHeroW(hero.offsetWidth);
      setHeroH(hero.offsetHeight);
      const c = starRef.current;
      if (c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
        stars.current = Array.from({ length: 140 }, () => ({
          x: Math.random() * c.width * 0.6, y: Math.random() * c.height * 0.85,
          r: (Math.random() * 1.1 + 0.3) * dpr, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.8,
        }));
      }
      if (nav) setNavRects([...nav.querySelectorAll<HTMLElement>('[data-nav]')].map((a) => ({ left: a.offsetLeft, width: a.offsetWidth })));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(hero); if (nav) ro.observe(nav);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [locale]);

  // Появление блоков при прокрутке.
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!els) return;
    els.forEach((el) => el.classList.add('lp-hidden'));
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.remove('lp-hidden'); io.unobserve(e.target); }
    }), { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    const fallback = window.setTimeout(() => els.forEach((el) => el.classList.remove('lp-hidden')), 4000);
    return () => { io.disconnect(); window.clearTimeout(fallback); };
  }, []);

  const stars = useRef<{ x: number; y: number; r: number; p: number; s: number }[]>([]);
  // Курсор-прицел и параллакс — только для мыши: на тач-экранах они лишь мешают прокрутке.
  const fine = useRef(false);
  useEffect(() => { fine.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches; }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const cursor = useRef({ x: 0, y: 0, tx: 0, ty: 0, on: false });

  // Один цикл на первый экран: звёзды (30 кадров/с), курсор, пульс подсказки, точки на орбите.
  // Пока первый экран за кадром — цикл стоит: прокрутка ниже ничего не стоит процессору.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    let raf = 0, visible = true, lastStars = 0;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    }, { rootMargin: '120px' });
    if (heroRef.current) io.observe(heroRef.current);
    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const time = reduce ? 0 : (now - t0) / 1000;
      const c = starRef.current;
      if (c && stars.current.length && now - lastStars > 33) {
        lastStars = now;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = '#CFE0FF';
          for (const s of stars.current) {
            ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * s.s + s.p));
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
          }
        }
      }
      const el = curRef.current, cu = cursor.current;
      if (el && (cu.on || el.style.opacity !== '0')) {
        cu.x += (cu.tx - cu.x) * 0.2; cu.y += (cu.ty - cu.y) * 0.2;
        const over = !!live.current.hover, sz = over ? 12 : 44;
        el.style.transform = `translate(${cu.x}px, ${cu.y}px)`;
        el.style.opacity = cu.on ? '1' : '0';
        el.style.width = el.style.height = `${sz}px`;
        el.style.margin = `${-sz / 2}px 0 0 ${-sz / 2}px`;
        el.classList.toggle('over', over);
      }
      const hd = hintDotRef.current;
      if (hd) hd.style.transform = `scale(${1 + 0.4 * Math.sin(time * 3)})`;
      const orb = orbRef.current;
      if (orb) [0, 1, 2].forEach((i) => {
        const dot = orb.querySelector(`[data-dot="${i}"]`); if (!dot) return;
        const a = time * (0.18 + i * 0.05) + i * 2.1, rx = i === 1 ? 560 : 660, ry = i === 1 ? 48 : 70;
        dot.setAttribute('cx', String(680 + Math.cos(a) * rx)); dot.setAttribute('cy', String(150 + Math.sin(a) * ry));
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Параллакс фонов нижних блоков — по прокрутке и только для видимых, а не каждый кадр.
  useEffect(() => {
    let pending = false;
    const update = () => {
      pending = false;
      const vh = window.innerHeight || 900;
      for (const [ref, k] of [[dimBgRef, 0.12], [ctaBgRef, 0.1]] as const) {
        const bg = ref.current; if (!bg?.parentElement) continue;
        const r = bg.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        bg.style.transform = `translate3d(0, ${((r.top + r.height / 2) - vh / 2) * -k}px, 0)`;
      }
    };
    // Шапка сайта прозрачна над первым экраном и становится обычной, когда он уехал.
    const markScrolled = () => {
      const h = heroRef.current?.offsetHeight ?? 700;
      document.body.classList.toggle('lp-scrolled', window.scrollY > h - 90);
    };
    const onScroll = () => { markScrolled(); if (!pending) { pending = true; requestAnimationFrame(update); } };
    markScrolled();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll);
      document.body.classList.remove('lp-scrolled');
    };
  }, []);

  const onHeroMove = (e: React.MouseEvent) => {
    const h = heroRef.current, p = parRef.current; if (!h || !p || !fine.current) return;
    const r = h.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    p.style.transform = `translate(${-x * 22}px, ${-y * 14}px)`;
    const cu = cursor.current;
    cu.tx = e.clientX - r.left; cu.ty = e.clientY - r.top;
    if (!cu.on) { cu.x = cu.tx; cu.y = cu.ty; cu.on = true; }
  };
  const enter = (key: string) => { window.clearTimeout(leaveTimer.current); setHover(key); setLast(key); };
  const leave = () => { window.clearTimeout(leaveTimer.current); leaveTimer.current = window.setTimeout(() => setHover(null), 160); };
  const keep = () => window.clearTimeout(leaveTimer.current);

  const onDockMove = (e: React.MouseEvent) => {
    dockRef.current?.querySelectorAll<HTMLElement>('[data-dock]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const k = Math.max(0, 1 - Math.abs(e.clientX - (r.left + r.width / 2)) / 260);
      const s = 1 + 0.42 * k * k * (3 - 2 * k);
      el.style.transform = `translateY(${-(s - 1) * 30}px) scale(${s})`;
    });
  };
  const onDockLeave = () => dockRef.current?.querySelectorAll<HTMLElement>('[data-dock]').forEach((el) => { el.style.transform = 'none'; });

  // Геометрия подсказки у объекта: картинка сцены прижата вправо и не уже 1640px.
  const sc = SCENES[scene];
  // Фоны грузим по мере показа: текущий и следующий; уже загруженные не выгружаем.
  const wanted = useRef(new Set<number>([0, 1]));
  wanted.current.add(scene); wanted.current.add((scene + 1) % SCENES.length);
  const cp = sc.spots.find((p) => p.key === (hover || last)) ?? sc.spots[0];
  const iw = Math.max(heroW + 40, 1640), k = iw / IW, z = hover ? 1.08 : 1;
  const px = heroW + 20 - iw + cp.cx * k, py = -20 + cp.cy * k;
  // Карточка (300px + отступ 72) — по умолчанию к центру экрана, но не поверх заголовка слева и не за край справа.
  const leftOk = px - cp.r * k * z - 372 > Math.min(heroW * 0.42, 600);
  const rightOk = px + cp.r * k * z + 372 < heroW - 16;
  const toLeft = cp.cx > 1150 ? (leftOk || !rightOk) : (!rightOk && leftOk);
  const edgeX = toLeft ? px - cp.r * k * z : px + cp.r * k * z;
  const popX = toLeft ? edgeX - 72 : edgeX + 72;
  // Карточка ~250px по высоте: не залезает ни на меню сверху, ни на волну и дисциплины снизу.
  const popY = Math.max(210, Math.min(py, heroH - 320));
  const ind = navHov === null ? undefined : navRects[navHov];

  const chips = useMemo(() => {
    const subjects = [...new Set(cards.filter((c) => c.tag !== 'vr').map((c) => c.tag))];
    return [['all', t('chipAll')], ['vr', t('chipVr')], ...subjects.map((s) => [s, s])] as [string, string][];
  }, [cards, t]);
  const shown = chip === 'all' ? cards : cards.filter((c) => c.tag === chip);

  const nextLocale = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];

  return (
    <div className="land lp space" ref={rootRef}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />

      <header id="top" className="lp-hero" ref={heroRef} onMouseMove={onHeroMove} onMouseLeave={() => { cursor.current.on = false; }}>
        <div className="lp-par" ref={parRef}>
          <div className="lp-intro" style={{ transform: `scale(${loaded ? 1 : 1.14})`, opacity: loaded ? 1 : 0 }}>
            {SCENES.map((s, i) => {
              const active = i === scene, isPrev = i === prev, enteringNow = active && entering;
              const op = !(active || isPrev) ? 0 : enteringNow ? 0 : 1;
              const scale = active ? (enteringNow ? 1.08 : z) : 1.02;
              return (
                <div key={s.key} className="lp-layer" aria-hidden={!active}
                  style={{ zIndex: active ? 2 : isPrev ? 1 : 0, opacity: op, transition: enteringNow ? 'none' : 'opacity 1.2s ease', pointerEvents: active ? 'auto' : 'none' }}>
                  <div className="lp-img" style={{
                    transform: `scale(${scale})`,
                    transformOrigin: active && hover ? `${cp.cx / IW * 100}% ${cp.cy / IH * 100}%` : '70% 45%',
                  }}>
                    <div className="lp-bg" style={wanted.current.has(i) ? { backgroundImage: `url(${s.img})` } : undefined} />
                    <div className="lp-dim" style={{
                      opacity: active && hover ? 1 : 0,
                      background: `radial-gradient(circle ${cp.r * k * 1.5}px at ${cp.cx / IW * 100}% ${cp.cy / IH * 100}%, rgba(4,6,13,0) 55%, rgba(4,6,13,.62) 100%)`,
                    }} />
                    {active && s.spots.map((p, j) => {
                      // Объект ушёл под волну на невысоком экране — метку не показываем.
                      if ((-20 + p.cy * k) > heroH - 170) return null;
                      const on = hover === p.key;
                      return (
                        <div key={p.key} className="lp-spot" onMouseEnter={() => enter(p.key)} onMouseLeave={leave}
                          style={{ left: `${p.cx / IW * 100}%`, top: `${p.cy / IH * 100}%`, width: `${p.r * 2 / IW * 100}%` }}>
                          <div className="lp-ring" style={{ opacity: on ? 1 : 0, transform: `scale(${on ? 1 : 0.8})` }} />
                          <div className="lp-ring2" style={{ opacity: on ? 1 : 0, transform: `scale(${on ? 1 : 0.7})` }}><i /></div>
                          <div className="lp-mark" style={{ opacity: hover ? 0 : 1 }}>
                            <span style={{ animationDelay: `${j * 0.35}s` }} /><span />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <canvas ref={starRef} className="lp-stars" style={{ opacity: sc.stars ? 1 : 0 }} />
        <div className="lp-shade" data-scene={sc.key} />

        <div className="lp-link" style={{
          left: Math.min(edgeX, popX), top: py, width: Math.abs(popX - edgeX),
          transformOrigin: toLeft ? 'right center' : 'left center', transform: `scaleX(${hover ? 1 : 0})`, opacity: hover ? 1 : 0,
          background: `linear-gradient(90deg,${toLeft ? 'rgba(170,198,255,.1),rgba(190,212,255,.9)' : 'rgba(190,212,255,.9),rgba(170,198,255,.1)'})`,
        }}>
          <span style={toLeft ? { right: -3 } : { left: -3 }} />
        </div>
        <div className="lp-pop" onMouseEnter={keep} onMouseLeave={leave} style={{
          left: popX, top: popY, transformOrigin: toLeft ? 'right center' : 'left center',
          transform: `translate(${toLeft ? '-100%' : '0'},-50%) scale(${hover ? 1 : 0.92})`, opacity: hover ? 1 : 0, pointerEvents: hover ? 'auto' : 'none',
        }}>
          <div className="lp-pop-card">
            <div className="lp-pop-head">
              <div><small>{cp.kind[locale]}</small><strong>{cp.name[locale]}</strong></div>
              <Link href={startHref} aria-label={t('heroCta')}>→</Link>
            </div>
            <div>
              {cp.facts.map(([fk, fv], i) => (
                <div key={i} className="lp-fact" style={{
                  opacity: hover ? 1 : 0, transform: `translateY(${hover ? 0 : 8}px)`,
                  transitionDelay: hover ? `${0.18 + i * 0.07}s` : '0s',
                }}><span>{fk[locale]}</span><b>{fv[locale]}</b></div>
              ))}
            </div>
          </div>
        </div>

        <div className="lp-hero-text">
          <h1>
            <span className="lp-line" style={{ opacity: loaded ? 1 : 0, transform: `translateY(${loaded ? 0 : 40}px)` }}>{t('heroLead')}</span>
            <span className="lp-words" style={{ opacity: loaded ? 1 : 0 }}>
              {SCENES.map((s, i) => {
                const on = i === scene;
                return (
                  <span key={s.key} aria-hidden={!on} style={{
                    transform: `translateY(${on ? 0 : i < scene ? -110 : 110}%)`, opacity: on ? 1 : 0, filter: `blur(${on ? 0 : 8}px)`,
                    backgroundImage: `linear-gradient(90deg,${s.c1},${s.c2})`,
                  }}>{s.word[locale]}</span>
                );
              })}
            </span>
          </h1>
          <Link href={startHref} className="lp-cta" style={{ opacity: loaded ? 1 : 0, transform: `translateY(${loaded ? 0 : 40}px)` }}>
            {t('heroCta')} <span>→</span>
          </Link>
        </div>

        <div className="lp-tabs-row" style={{ opacity: loaded ? 1 : 0 }}>
          <div className="lp-hint" style={{ opacity: loaded && !hover ? 1 : 0 }}><span ref={hintDotRef} />{sc.hint[locale]}</div>
        </div>

        <div className="lp-cursor" ref={curRef} />
        {/* Свечение над волнами — неподвижный размытый слой: SVG-фильтр на движущихся волнах пересчитывался каждый кадр. */}
        <div className="lp-wave-glow" aria-hidden="true" />
        <svg className="lp-wave" viewBox="0 0 1440 280" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="lpGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#3D6BFF" stopOpacity="0" /><stop offset=".35" stopColor="#6E93FF" stopOpacity=".9" />
              <stop offset=".7" stopColor="#A68BFF" stopOpacity=".8" /><stop offset="1" stopColor="#3D6BFF" stopOpacity=".1" />
            </linearGradient>
            <linearGradient id="lpMid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--lp-wave-mid0)' }} /><stop offset="1" style={{ stopColor: 'var(--lp-wave-mid1)' }} />
            </linearGradient>
            <filter id="lpBlur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
            <filter id="lpSoft" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="2.5" /></filter>
          </defs>
          {([
            ['glow', { fill: 'url(#lpGlow)', opacity: 0.35 }],
            ['back', { fill: 'rgba(110,147,255,.16)' }],
            ['mid', { fill: 'url(#lpMid)' }],
            ['line2', { fill: 'none', stroke: 'rgba(170,198,255,.45)', strokeWidth: 1 }],
            ['front', { style: { fill: 'var(--lp-wave-front)' } }],
            ['edge', { fill: 'none', stroke: 'rgba(150,180,255,.55)', strokeWidth: 2 }],
            ['line1', { fill: 'none', stroke: 'url(#lpGlow)', strokeWidth: 1.5 }],
          ] as const).map(([k, attrs]) => (
            <g key={k} className="lp-wv" style={{ animationDuration: `${WAVES[k][3]}s` }}>
              <path d={WAVE_D[k]} {...attrs} />
            </g>
          ))}
        </svg>
      </header>

      <section className="lp-disc" data-reveal="1">
        <div className="lp-disc-box">
          <svg ref={orbRef} className="lp-orbit" viewBox="0 0 1360 260" preserveAspectRatio="none" aria-hidden="true">
            <ellipse cx="680" cy="150" rx="660" ry="70" fill="none" stroke="rgba(61,107,255,.22)" strokeWidth="1" />
            <ellipse cx="680" cy="150" rx="560" ry="48" fill="none" stroke="rgba(61,107,255,.12)" strokeWidth="1" strokeDasharray="2 6" />
            <circle data-dot="0" r="4" fill="#3D6BFF" /><circle data-dot="1" r="3" fill="#7C8BFF" /><circle data-dot="2" r="3" fill="#3D6BFF" opacity=".6" />
          </svg>
          {/* Дисциплины и есть переключатель сцен первого экрана: наведение с задержкой или клик меняют картинку. */}
          <div className="lp-dock" ref={dockRef} role="tablist" aria-label={t('scenesAria')}
            onMouseMove={onDockMove} onMouseLeave={() => { onDockLeave(); window.clearTimeout(dockTimer.current); }}>
            {DISCIPLINES.map((d) => {
              const on = d.scene === scene;
              const idx = d.scene;
              if (idx === null) {
                return (
                  <Link key={d.img} href={`/showcase?subject=${encodeURIComponent(d.subject?.[locale] ?? d.name[locale])}`} className="lp-dock-link">
                    <div data-dock="1" className="lp-dock-img" style={{ backgroundImage: `url(${d.img})` }} />
                    <span className="lp-dock-name"><i />{d.name[locale]}</span>
                    <small>{t('showcase')} →</small>
                  </Link>
                );
              }
              return (
                <button key={d.img} type="button" role="tab" aria-selected={on} className={on ? 'on' : undefined} disabled={idx === null}
                  onMouseEnter={() => {
                    window.clearTimeout(dockTimer.current);
                    if (idx !== null) dockTimer.current = window.setTimeout(() => go(idx), 350);
                  }}
                  onClick={() => { window.clearTimeout(dockTimer.current); if (idx !== null) go(idx); }}>
                  <div data-dock="1" className="lp-dock-img" style={{ backgroundImage: `url(${d.img})` }} />
                  <span className="lp-dock-name"><i />{d.name[locale]}</span>
                  {idx === null
                    ? <small>{t('soon')}</small>
                    : <span className="lp-dock-prog"><b style={{
                      width: on && !entering ? '100%' : '0%', transition: on && !entering ? `width ${DUR}ms linear` : 'none',
                    }} /></span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <LiveSim t={t} startHref={startHref} />

      <HowItWorks t={t} />

      <section id="labs" className="lp-labs" data-reveal="1">
        <div className="lp-labs-head">
          <div className="lp-labs-title">
            <h2>{t('labsTitle1')}<br />{t('labsTitle2')}</h2>
            <Link href="/showcase" className="lp-round" aria-label={t('showcase')}>→</Link>
          </div>
          <div className="lp-chips">
            {chips.map(([key, label]) => (
              <button key={key} type="button" className={chip === key ? 'on' : undefined}
                onClick={() => { setChip(key); if (railRef.current) railRef.current.scrollLeft = 0; }}>{label}</button>
            ))}
          </div>
          <div className="lp-arrows">
            <button type="button" className="lp-arrow" aria-label={t('prev')} onClick={() => railRef.current?.scrollBy({ left: -356 })}>←</button>
            <button type="button" className="lp-arrow" aria-label={t('next')} onClick={() => railRef.current?.scrollBy({ left: 356 })}>→</button>
          </div>
        </div>
        <div className="lp-rail" ref={railRef}>
          {shown.map((c) => (
            <a key={c.href} href={c.href} className="lp-card" {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.img} alt="" loading="lazy" decoding="async" />
              <div className="lp-card-foot">
                <span><small>{c.tag === 'vr' ? 'VR' : c.tag}</small>{c.title}</span><i>→</i>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section id="dims" className="lp-dark">
        <div className="lp-dark-bg" ref={dimBgRef} />
        <div className="lp-dark-shade" />
        <div className="lp-dims" data-reveal="1">
          <h2>{t('dimsTitle1')}<br />{t('dimsTitle2')}</h2>
          {([['2D', t('dim2d')], ['3D', t('dim3d')], ['VR', t('dimVr')]] as const).map(([key, text], i) => (
            <button key={key} type="button" className={i === dim ? 'on' : undefined} onClick={() => setDim(i)}>
              <b>{key}</b><span>{text}</span>
            </button>
          ))}
        </div>
      </section>

      <Universities t={t} startHref={startHref} imgs={roleImgs} />

      <section id="start" className="lp-final">
        <div className="lp-final-bg" ref={ctaBgRef} />
        <div className="lp-final-shade" />
        <div className="lp-final-text" data-reveal="1">
          <h2>{t('ctaTitle')}<br /><em>{t('ctaEm')}</em></h2>
          <Link href={startHref} className="lp-try lp-try-big">{signedIn ? t('toCabinet') : registrationOpen ? t('startFree') : t('login')}<span>→</span></Link>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-brand">
          <span className="lp-foot-logo"><TesseractMark size={28} tone="glow" /><b>Tesseract</b></span>
          <p>{t('footer')}</p>
        </div>
        <div className="lp-foot-col">
          <b>{t('footProduct')}</b>
          <Link href={signedIn ? '/create' : startHref}>{t('footCreate')}</Link>
          <Link href="/showcase">{t('showcase')}</Link>
          <Link href="/labs">{t('footLabs')}</Link>
          <Link href="/research">{t('footResearch')}</Link>
        </div>
        <div className="lp-foot-col">
          <b>{t('footAccount')}</b>
          {signedIn ? <Link href="/create">{t('toCabinet')}</Link> : <>
            <Link href="/login">{t('login')}</Link>
            {registrationOpen && <Link href="/register">{t('footRegister')}</Link>}
          </>}
        </div>
        <div className="lp-foot-col">
          <b>{t('footLang')}</b>
          {LOCALES.map((l) => (
            <button key={l} type="button" className={l === locale ? 'on' : undefined} onClick={() => setLocale(l)}>{LOCALE_SHORT[l]}</button>
          ))}
        </div>
        <div className="lp-foot-copy">© 2026 Tesseract</div>
      </footer>
    </div>
  );
}

/** Переводчик лендинга: тот же, что у страницы, передаётся блокам. */
type LT = ReturnType<typeof useLandingT>;
function useLandingT() { return useT(landing); }

/**
 * «Потрогай прямо здесь»: настоящий тренажёр нового движка в кадре. Грузится, только когда
 * блок подъезжает к экрану, и выгружается при смене вкладки — главная не тянет четыре симуляции сразу.
 */
function LiveSim({ t, startHref }: { t: LT; startHref: string }) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [tab, setTab] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const cur = LIVE[tab];
  const src = `/api/public/demos/${cur.slug}`;
  // В кадре главной: панели свёрнуты, фазы идут сами — сцена с первой секунды в движении.
  const frameSrc = `${src}?embed=1&phases=auto`;
  return (
    <section ref={ref} id="live" className="lp-live" data-reveal="1">
      <div className="lp-sec-head">
        <span className="sp-kicker">{t('liveKicker')}</span>
        <h2 className="sp-title">{t('liveTitle')}</h2>
        <p>{t('liveLead')}</p>
      </div>
      <div className="lp-live-frame">
        <div className="lp-live-bar">
          <div className="sp-chips" role="tablist">
            {LIVE.map((l, i) => (
              <button key={l.slug} type="button" role="tab" aria-selected={i === tab} className={i === tab ? 'sp-chip on' : 'sp-chip'}
                onClick={() => { if (i !== tab) { setTab(i); setReady(false); } }}>{t(l.key)}</button>
            ))}
          </div>
          <div className="lp-live-actions">
            <a className="sp-btn" href={src} target="_blank" rel="noopener noreferrer">{t('liveOpen')} ↗</a>
            <Link className="sp-btn sp-btn-primary" href={startHref}>{t('liveMake')} →</Link>
          </div>
        </div>
        <div className="lp-live-stage">
          {near && <iframe key={cur.slug} src={frameSrc} title={t(cur.key)} loading="lazy" sandbox="allow-scripts"
            onLoad={() => setReady(true)} className={ready ? 'on' : undefined} />}
          {!ready && <div className="lp-live-wait"><span className="lp-spinner" />{t('liveLoading')}</div>}
        </div>
      </div>
    </section>
  );
}

/** Три шага: запрос печатается, план собирается, тренажёр оживает. Шаги сменяются сами, по клику — сразу. */
const HOW_MS = 5200;

/** «Как это работает»: окно приложения проигрывает три сцены — запрос, сборка плана, готовый тренажёр. */
function HowItWorks({ t }: { t: LT }) {
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(!!e?.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % 3), HOW_MS);
    return () => window.clearTimeout(id);
  }, [step, seen]);
  const steps = [['step1Title', 'step1Text'], ['step2Title', 'step2Text'], ['step3Title', 'step3Text']] as const;
  const phases = t('howPhases').split(/\s*·\s*/);
  return (
    <section ref={ref} id="how" className={seen ? 'lp-how2 seen' : 'lp-how2'} data-reveal="1">
      <div className="lp-how2-head">
        <span className="sp-kicker">{t('howKicker')}</span>
        <h2 className="sp-title">{t('howTitle1')}<br /><span className="sp-grad">{t('howTitle2')}</span></h2>
        <p>{t('howLead')}</p>
      </div>

      <div className="lp-how2-stage">
        <div className="lp-how2-glow" aria-hidden="true" />
        <div className="lp-how2-win" aria-hidden="true">
          <div className="lp-how2-bar">
            <i /><i /><i />
            <span className="lp-how2-url">tesseract · {t(steps[step][0])}</span>
          </div>
          <div className="lp-how2-body" key={seen ? step : 'idle'}>
            {step === 0 && (
              <div className="lp-how2-scene lp-how2-ask-scene">
                <div className="lp-how2-orb" />
                <span className="lp-how2-new">{t('howNew')}</span>
                <div className="lp-how2-ask">
                  <span className="lp-how2-spark">✦</span>
                  <span className="lp-how2-typed">{t('howPrompt')}</span>
                  <span className="lp-how2-go">{t('howGo')} <b>→</b></span>
                </div>
                <div className="lp-how2-sugg">
                  {(['howSugg1', 'howSugg2', 'howSugg3'] as const).map((k, i) => (
                    <span key={k} style={{ animationDelay: `${2.6 + i * 0.12}s` }}>{t(k)}</span>
                  ))}
                </div>
                <div className="lp-how2-opts">
                  {(['howOpt1', 'howOpt2', 'howOpt3'] as const).map((k, i) => (
                    <span key={k} style={{ animationDelay: `${0.5 + i * 0.12}s` }}><i />{t(k)}</span>
                  ))}
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="lp-how2-scene lp-how2-plan-scene">
                <div className="lp-how2-plan-head"><span className="lp-how2-spin" />{t('howBuilding')}<span className="lp-how2-meter"><b /></span></div>
                <div className="lp-how2-cards">
                  <div className="lp-how2-card" style={{ animationDelay: '.15s' }}>
                    <small>{t('howPlanParams')}</small>
                    {[t('howParam1'), t('howParam2'), t('howParam3')].map((x, i) => (
                      <div key={x} className="lp-how2-slider"><span>{x}</span><i><b style={{ animationDelay: `${0.6 + i * 0.25}s`, ['--to' as string]: ['45%', '72%', '58%'][i] }} /></i></div>
                    ))}
                  </div>
                  <div className="lp-how2-card" style={{ animationDelay: '.55s' }}>
                    <small>{t('howPlanTools')}</small>
                    <div className="lp-how2-tool">
                      <svg viewBox="0 0 120 56"><path className="lp-how2-loop" d="M10 46 C 14 10, 30 8, 44 12 C 70 20, 96 30, 110 40 C 90 48, 50 50, 10 46 Z" /></svg>
                      <span>{t('howTool1')}</span>
                    </div>
                    <div className="lp-how2-tool"><span className="lp-how2-big">38<em>%</em></span><span>{t('howTool2')}</span></div>
                    <div className="lp-how2-tool">
                      <svg viewBox="0 0 120 56"><path className="lp-how2-loop lp-how2-line" d="M6 44 L26 40 L42 18 L58 30 L76 12 L94 22 L114 8" /></svg>
                      <span>{t('howTool3')}</span>
                    </div>
                  </div>
                  <div className="lp-how2-card lp-how2-wide" style={{ animationDelay: '.95s' }}>
                    <small>{t('howPlanPhases')}</small>
                    <div className="lp-how2-pills">
                      {phases.map((ph, i) => <span key={ph} style={{ animationDelay: `${1.3 + i * 0.14}s` }}>{i + 1}. {ph}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="lp-how2-scene lp-how2-sim-scene">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/public/demos/kit-engine-phases/thumb" alt="" decoding="async" />
                <div className="lp-how2-sim-shade" />
                <div className="lp-how2-ready"><b>✓</b>{t('howReady')}</div>
                <div className="lp-how2-float">
                  <svg viewBox="0 0 120 56"><path className="lp-how2-loop" d="M10 46 C 14 10, 30 8, 44 12 C 70 20, 96 30, 110 40 C 90 48, 50 50, 10 46 Z" /></svg>
                  <span>{t('howTool1')}</span>
                </div>
                <div className="lp-how2-phasebar">
                  {phases.map((ph, i) => <span key={ph} style={{ animationDelay: `${0.5 + i * 0.9}s` }}>{ph}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ol className="lp-how2-steps">
        {steps.map(([title, text], i) => (
          <li key={title} className={i === step ? 'on' : i < step ? 'done' : undefined}>
            <button type="button" onClick={() => setStep(i)}>
              <span className="lp-how2-track"><i style={i === step && seen ? { animationDuration: `${HOW_MS}ms` } : undefined} /></span>
              <span className="lp-how2-num">{i < step ? '✓' : i + 1}</span>
              <b>{t(title)}</b>
              <small>{t(text)}</small>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ROLE_ICONS = ['◎', '✦', '∑', '⌂'];


/** Для университетов: что получает каждая роль. */
function Universities({ t, startHref, imgs }: { t: LT; startHref: string; imgs: (string | null)[] }) {
  const roles = [
    ['uniTeacher', 'uniTeacher1', 'uniTeacher2', 'uniTeacher3'],
    ['uniStudent', 'uniStudent1', 'uniStudent2', 'uniStudent3'],
    ['uniResearcher', 'uniResearcher1', 'uniResearcher2', 'uniResearcher3'],
    ['uniUniversity', 'uniUniversity1', 'uniUniversity2', 'uniUniversity3'],
  ] as const;
  return (
    <section id="university" className="lp-uni" data-reveal="1">
      <div className="lp-sec-head lp-sec-head-row">
        <div>
          <span className="sp-kicker">{t('uniKicker')}</span>
          <h2 className="sp-title">{t('uniTitle1')}<br /><span className="sp-grad">{t('uniTitle2')}</span></h2>
        </div>
        <Link href={startHref} className="sp-btn sp-btn-primary">{t('uniCta')} →</Link>
      </div>
      <div className="lp-uni-grid">
        {roles.map(([title, ...items], i) => (
          <div key={title} className="lp-uni-card sp-glass" style={{ animationDelay: `${i * 80}ms` }}>
            {/* Иллюстрация роли (materials/landing-images.md), пока её нет — значок-глиф. */}
            <span className={imgs[i] ? 'lp-uni-ico has-img' : 'lp-uni-ico'}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {imgs[i] ? <img src={imgs[i]!} alt="" loading="lazy" decoding="async" /> : ROLE_ICONS[i]}
            </span>
            <h3>{t(title)}</h3>
            <ul>{items.map((k) => <li key={k}>{t(k)}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import type { ModelDoc } from '@/lib/research/doc';
import { keyAction, stepSlide, visibleSlides, type PresentAction, type SlideDesc } from '@/lib/research/present';
import { IconBack, IconClose, IconExpand, IconEye, IconLab, IconMonitor, IconPlay, IconText } from '@/components/icons';
import ModelEditor from './ModelEditor';
import { useFormat, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchPresent } from '@/i18n/messages/research-present';

/** Слайд с готовой картинкой: SVG графика/абстракта, документ модели, ссылка на тренажёр. */
export type Slide = SlideDesc & { svg?: string | null; doc?: ModelDoc; simulationId?: string };

interface Ctx { title: string; description: string; author: string; date: string; publicUrl: string; qr: string | null }
type Msg = { type: 'state'; index: number; hidden: number[] } | { type: 'hello' };

/**
 * Режим доклада: полноэкранные слайды поверх сайта. Клавиши как в PowerPoint
 * (и кликеры, которые шлют PageUp/PageDown), живые модели со слайдерами, тренажёры
 * в iframe. Окно докладчика (?presenter=1) держится в синхроне через BroadcastChannel.
 */
export default function Presenter({ projectId, title, description, author, date, publicToken, slides, presenterView }: {
  projectId: string; title: string; description: string; author: string; date: string;
  publicToken: string | null; slides: Slide[]; presenterView: boolean;
}) {
  const t = useT(researchPresent);
  const tc = useT(common);
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const [overview, setOverview] = useState(false);
  const [notes, setNotes] = useState(false);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sims, setSims] = useState<Record<string, string | null>>({});
  const [publicUrl, setPublicUrl] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const chan = useRef<BroadcastChannel | null>(null);
  const overviewRef = useRef(overview);
  overviewRef.current = overview;
  const state = useRef({ index, hidden });
  state.current = { index, hidden };
  const total = slides.length;

  /** Перейти на слайд; broadcast=false — пришло из другого окна, эхо не нужно. */
  const show = useCallback((next: number, nextHidden: Set<number> = state.current.hidden, broadcast = true) => {
    const cur = state.current.index;
    if (next !== cur) {
      setDir(next > cur ? 'next' : 'prev');
      setLeaving(cur);
      setIndex(next);
      setVisited((v) => (v.has(next) ? v : new Set(v).add(next)));
    }
    if (nextHidden !== state.current.hidden) setHidden(nextHidden);
    if (broadcast) chan.current?.postMessage({ type: 'state', index: next, hidden: [...nextHidden] } satisfies Msg);
  }, []);

  // Уходящий слайд доигрывает анимацию и прячется.
  useEffect(() => {
    if (leaving === null) return;
    const t = setTimeout(() => setLeaving(null), 320);
    return () => clearTimeout(t);
  }, [leaving, index]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const c = new BroadcastChannel(`tesseract-present-${projectId}`);
    chan.current = c;
    c.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m?.type === 'state') show(Math.min(Math.max(m.index, 0), total - 1), new Set(m.hidden), false);
      // Окно докладчика открылось — рассказываем, где мы.
      if (m?.type === 'hello' && !presenterView) c.postMessage({ type: 'state', index: state.current.index, hidden: [...state.current.hidden] } satisfies Msg);
    };
    if (presenterView) c.postMessage({ type: 'hello' } satisfies Msg);
    return () => { c.close(); chan.current = null; };
  }, [projectId, presenterView, show, total]);

  // Слайд в адресе (#s3): перезагрузка страницы посреди доклада возвращает туда же.
  useEffect(() => {
    if (presenterView) return;
    const m = /^#s(\d+)$/.exec(window.location.hash);
    if (m) show(Math.min(Math.max(Number(m[1]) - 1, 0), total - 1));
  }, [presenterView, show, total]);
  useEffect(() => {
    if (presenterView) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#s${index + 1}`);
  }, [index, presenterView]);

  useEffect(() => {
    if (!publicToken) return;
    const url = `${window.location.origin}/r/${publicToken}`;
    setPublicUrl(url);
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#14161c', light: '#ffffff' } }).then(setQr, () => setQr(null));
  }, [publicToken]);

  // Тренажёры грузим заранее для текущего и соседних слайдов: на докладе ждать некогда.
  useEffect(() => {
    if (presenterView) return;
    const near = [index, stepSlide(index, 1, total, hidden), stepSlide(index, -1, total, hidden)];
    near.forEach((i) => {
      const id = slides[i]?.simulationId;
      if (!id || id in sims) return;
      setSims((s) => ({ ...s, [id]: s[id] ?? '' }));
      fetch(`/api/simulations/${id}`).then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { html?: string }) => setSims((s) => ({ ...s, [id]: d.html ?? null })), () => setSims((s) => ({ ...s, [id]: null })));
    });
  }, [index, hidden, slides, total, sims, presenterView]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const exit = useCallback(() => {
    if (presenterView) { window.close(); return; }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push(`/research/projects/${projectId}?step=show`);
  }, [presenterView, projectId, router]);

  const act = useCallback((a: PresentAction) => {
    const { index: i, hidden: h } = state.current;
    if (a === 'next') show(stepSlide(i, 1, total, h));
    else if (a === 'prev') show(stepSlide(i, -1, total, h));
    else if (a === 'first') show(stepSlide(i, -Infinity, total, h));
    else if (a === 'last') show(stepSlide(i, Infinity, total, h));
    else if (a === 'fullscreen') toggleFullscreen();
    else if (a === 'notes') setNotes((n) => !n);
    else if (a === 'overview') setOverview((o) => !o);
    else if (a === 'exit') exit();
  }, [show, total, toggleFullscreen, exit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // Текстовые поля и ползунки модели — их клавиши, не наши.
      if (el?.closest('textarea, select, [contenteditable="true"]')) return;
      if (el instanceof HTMLInputElement) {
        if (el.type !== 'range' && el.type !== 'checkbox') return;
        if (el.type === 'range' && /^(Arrow|Page|Home|End)/.test(e.key)) return;
      }
      const a = keyAction(e.key, e.shiftKey);
      if (!a) return;
      e.preventDefault();
      if (a === 'exit' && overviewRef.current) { setOverview(false); return; }
      act(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);
  // Панель управления прячется, когда мышь не двигается: на проекторе она только мешает.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 2500); };
    wake();
    window.addEventListener('pointermove', wake);
    return () => { clearTimeout(timer); window.removeEventListener('pointermove', wake); };
  }, []);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const el = e.target as HTMLElement;
    touch.current = el.closest('input, iframe, .rs-side, button') ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) act(dx < 0 ? 'next' : 'prev');
  };

  const visible = useMemo(() => visibleSlides(total, hidden), [total, hidden]);
  const pos = Math.max(visible.indexOf(index), 0);
  const ctx: Ctx = { title, description, author, date, publicUrl, qr };
  const toggleHidden = (i: number) => {
    const next = new Set(hidden);
    if (next.has(i)) next.delete(i);
    else if (visible.length > 1) next.add(i);
    // Скрыли текущий — уходим на соседний видимый.
    let target = index;
    if (next.has(index)) {
      target = stepSlide(index, 1, total, next);
      if (target === index) target = stepSlide(index, -1, total, next);
    }
    show(target, next);
  };
  const jump = (i: number) => {
    const next = new Set(hidden);
    next.delete(i);
    show(i, hidden.has(i) ? next : hidden);
    setOverview(false);
  };

  if (presenterView) {
    return <Console slides={slides} index={index} total={total} hidden={hidden} ctx={ctx} act={act} pos={pos} count={visible.length} />;
  }

  const mounted = new Set([...visited, index, stepSlide(index, 1, total, hidden), stepSlide(index, -1, total, hidden)]);
  return (
    <div ref={root} className={`pr-root${idle && !overview ? ' pr-idle' : ''}`} data-dir={dir} role="region" aria-roledescription={t('presentation')} aria-label={title}>
      <div className="pr-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="pr-stage-in">
          <div className="pr-frame">
            {slides.map((s, i) => mounted.has(i) && (
              <section key={s.key} className="pr-slide" data-pos={i === index ? 'current' : i === leaving ? 'leaving' : 'idle'}
                aria-hidden={i !== index} aria-roledescription={t('slide')} aria-label={t('slideOf', { n: visible.indexOf(i) + 1, total: visible.length, title: s.title })}>
                <SlideView slide={s} ctx={ctx} live sim={s.simulationId ? sims[s.simulationId] : undefined} />
              </section>
            ))}
          </div>
        </div>
      </div>

      {notes && (
        <aside className="pr-notes" aria-label={t('notesAria')}>
          <span className="pr-notes-label">{t('notesFor', { title: slides[index].title })}</span>
          <p>{slides[index].notes || t('noNotes')}</p>
        </aside>
      )}

      <div className="pr-toolbar" role="toolbar" aria-label={t('toolbar')}>
        <button type="button" className="pr-btn" onClick={exit} title={t('toProjectEsc')}><IconBack size={16} /><span>{t('toProject')}</span></button>
        <span className="pr-toolbar-title">{title}</span>
        <button type="button" className={`pr-btn${overview ? ' on' : ''}`} onClick={() => setOverview((o) => !o)} title={t('allSlidesG')}><IconEye size={16} /><span>{t('slides')}</span></button>
        <button type="button" className={`pr-btn${notes ? ' on' : ''}`} onClick={() => setNotes((n) => !n)} title={t('notesN')}><IconText size={16} /><span>{t('notes')}</span></button>
        <button type="button" className="pr-btn" title={t('consoleTitle')}
          onClick={() => window.open(`${window.location.pathname}?presenter=1`, `tesseract-presenter-${projectId}`, 'popup,width=1180,height=720')}>
          <IconMonitor size={16} /><span>{t('console')}</span>
        </button>
        <button type="button" className="pr-btn pr-btn-icon" onClick={toggleFullscreen} title={fullscreen ? t('exitFs') : t('enterFs')} aria-label={t('fullscreen')}><IconExpand size={16} /></button>
      </div>

      <div className="pr-counter" aria-live="polite">{pos + 1} / {visible.length}</div>
      <div className="pr-progress" role="slider" aria-label={t('slideAria')} aria-valuemin={1} aria-valuemax={visible.length} aria-valuenow={pos + 1} tabIndex={-1}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const k = Math.min(visible.length - 1, Math.floor(((e.clientX - r.left) / r.width) * visible.length));
          show(visible[Math.max(k, 0)]);
        }}>
        <span style={{ width: `${((pos + 1) / visible.length) * 100}%` }} />
      </div>

      {overview && (
        <div className="pr-overview" role="dialog" aria-label={t('allSlides')}>
          <div className="pr-overview-head">
            <strong>{t('slides')}</strong>
            <span className="pr-overview-hint">{t('overviewHint')}</span>
            <button type="button" className="pr-btn pr-btn-icon" onClick={() => setOverview(false)} aria-label={tc('close')}><IconClose size={16} /></button>
          </div>
          <div className="pr-overview-grid">
            {slides.map((s, i) => (
              <div key={s.key} className={`pr-thumb${i === index ? ' current' : ''}${hidden.has(i) ? ' hidden' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                <button type="button" className="pr-thumb-go" onClick={() => jump(i)}>
                  <div className="pr-mini"><SlideView slide={s} ctx={ctx} /></div>
                  <span className="pr-thumb-cap"><b>{i + 1}</b>{s.title}</span>
                </button>
                <button type="button" className="pr-thumb-hide" onClick={() => toggleHidden(i)}
                  aria-label={hidden.has(i) ? t('showSlide') : t('hideSlide')} title={hidden.has(i) ? t('showInTalk') : t('hideFromTalk')}>
                  <IconEye size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------ слайд ------------------------------------ */

/**
 * Один SVG бывает на странице дважды (слайд и его миниатюра в обзоре): одинаковые id
 * clipPath ломают обрезку во втором экземпляре — у миниатюры id получают суффикс.
 */
function uniqueIds(svg: string, suffix: string): string {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  return ids.reduce((out, id) => out.split(`id="${id}"`).join(`id="${id}${suffix}"`).split(`#${id})`).join(`#${id}${suffix})`).split(`#${id}"`).join(`#${id}${suffix}"`), svg);
}

function SlideView({ slide, ctx, live = false, sim }: { slide: Slide; ctx: Ctx; live?: boolean; sim?: string | null }) {
  const t = useT(researchPresent);
  const s = useMemo(() => (live || !slide.svg ? slide : { ...slide, svg: uniqueIds(slide.svg, '-m') }), [slide, live]);
  // Модель на докладе — крупным кеглем и в экранных пропорциях, независимо от журнального пресета.
  const talkDoc = useMemo(() => (s.doc ? { ...s.doc, style: 'talk' as const, size: '' } : null), [s.doc]);

  if (s.kind === 'title') {
    return (
      <div className="pr-s pr-s-title">
        <span className="pr-eyebrow">{ctx.date}</span>
        <h1>{ctx.title}</h1>
        {ctx.description && <p className="pr-lead">{ctx.description}</p>}
        {ctx.author && <p className="pr-byline">{ctx.author}</p>}
      </div>
    );
  }
  if (s.kind === 'end') {
    return (
      <div className="pr-s pr-s-end">
        <div>
          <h1>{t('thanks')}</h1>
          <p className="pr-lead">{t('questions')}</p>
          {ctx.author && <p className="pr-byline">{ctx.author}</p>}
        </div>
        {ctx.qr ? (
          <figure className="pr-qr">
            <div dangerouslySetInnerHTML={{ __html: ctx.qr }} />
            <figcaption>{t('qrCaption')}<br /><span>{ctx.publicUrl.replace(/^https?:\/\//, '')}</span></figcaption>
          </figure>
        ) : (
          <p className="pr-hint">{t('publishHint')}</p>
        )}
      </div>
    );
  }
  if (s.kind === 'graphical') {
    return <div className="pr-s pr-s-full">{s.svg ? <div className="pr-svg" dangerouslySetInnerHTML={{ __html: s.svg }} /> : <Missing />}</div>;
  }
  return (
    <div className="pr-s pr-s-item">
      <header className="pr-head">
        {s.figNo !== undefined && <span className="pr-fig">{t('figN', { n: s.figNo })}</span>}
        <h2>{s.title}</h2>
      </header>
      <div className={`pr-body pr-body-${s.kind}`}>
        {s.kind === 'model' && live && talkDoc ? <ModelEditor doc={talkDoc} title={s.title} readOnly />
          : s.kind === 'sim' ? <SimBody live={live} sim={sim} title={s.title} />
          : s.svg ? <div className="pr-svg" dangerouslySetInnerHTML={{ __html: s.svg }} /> : <Missing />}
      </div>
    </div>
  );
}

function SimBody({ live, sim, title }: { live: boolean; sim?: string | null; title: string }) {
  const t = useT(researchPresent);
  if (live && sim) return <iframe className="pr-sim" sandbox="allow-scripts" srcDoc={sim} title={title} />;
  const text = !live ? t('simInteractive') : sim === null ? t('simFailed') : t('simLoading');
  return <div className="pr-placeholder">{!live || sim === null ? <IconLab size={36} /> : <IconPlay size={36} />}<span>{text}</span></div>;
}

function Missing() {
  const t = useT(researchPresent);
  return <div className="pr-placeholder"><IconLab size={36} /><span>{t('figFailed')}</span></div>;
}

/* ------------------------------- окно докладчика ------------------------------- */

function Console({ slides, index, total, hidden, ctx, act, pos, count }: {
  slides: Slide[]; index: number; total: number; hidden: Set<number>; ctx: Ctx; act: (a: PresentAction) => void; pos: number; count: number;
}) {
  const t = useT(researchPresent);
  const f = useFormat();
  const [start, setStart] = useState(() => Date.now());
  const [paused, setPaused] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor(((paused ?? now) - start) / 1000));
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const nextIndex = stepSlide(index, 1, total, hidden);
  const s = slides[index];

  return (
    <div className="pr-root pr-console">
      <header className="pr-console-head">
        <span className="pr-console-title">{ctx.title}</span>
        <span className="pr-timer" aria-label={t('talkTime')}>{clock(elapsed)}</span>
        <button type="button" className="pr-btn" onClick={() => {
          if (paused === null) setPaused(Date.now());
          else { setStart((st) => st + Date.now() - paused); setPaused(null); }
        }}>{paused === null ? t('pause') : t('resume')}</button>
        <button type="button" className="pr-btn" onClick={() => { setStart(Date.now()); setPaused(paused === null ? null : Date.now()); }}>{t('reset')}</button>
        <span className="pr-console-clock">{f.dateTime(now, { hour: '2-digit', minute: '2-digit' })}</span>
      </header>
      <div className="pr-console-main">
        <div className="pr-console-current">
          <div className="pr-mini"><SlideView slide={s} ctx={ctx} /></div>
          <div className="pr-console-nav">
            <button type="button" className="pr-btn" onClick={() => act('prev')}>{t('prev')}</button>
            <span className="pr-counter-inline">{pos + 1} / {count}</span>
            <button type="button" className="pr-btn pr-btn-primary" onClick={() => act('next')}>{t('next')}</button>
          </div>
        </div>
        <div className="pr-console-side">
          <span className="pr-notes-label">{t('upNext')}</span>
          {nextIndex !== index
            ? <div className="pr-mini"><SlideView slide={slides[nextIndex]} ctx={ctx} /></div>
            : <div className="pr-mini pr-mini-end">{t('talkEnd')}</div>}
          <span className="pr-notes-label">{t('notes')}</span>
          <div className="pr-console-notes">{s.notes || <span className="pr-muted">{t('noSlideNotes')}</span>}</div>
        </div>
      </div>
    </div>
  );
}

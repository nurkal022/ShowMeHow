'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { ModelDoc, PlotDoc, ResearchKind } from '@/lib/research/doc';
import { buildPlot, renderDoc } from '@/lib/research/doc';
import { renderPlot } from '@/lib/research/plot';
import { formatWithError } from '@/lib/research/fit';
import { doiHref, webCitation, type CitationSet } from '@/lib/research/present';
import { IconBook, IconCode, IconExpand, IconFormula, IconLab, IconLogo, IconQuote, IconSend, IconTable } from '@/components/icons';
import ModelEditor from './ModelEditor';
import { CopyButton, ExportBar } from './shared';
import { useLocale, useT } from '@/i18n/client';
import { researchPublic } from '@/i18n/messages/research-public';

/** DOI из Zenodo: у тестовых (sandbox) записей doi.org не открывается — ведём на страницу записи. */
export interface PublicDoi { doi: string; url: string; sandbox: boolean }
interface PublicItem { id: string; kind: ResearchKind; title: string; caption: string; doc: unknown; doi?: PublicDoi | null }
export interface PublicCover {
  title: string; description: string; updated: string; updatedIso: string;
  doi: PublicDoi | null;
  /** Строки ссылки по DOI (сервер собрал из записи Zenodo); без DOI панель цитирует саму страницу. */
  cite: CitationSet | null;
  /** Графический абстракт проекта — готовый SVG. */
  graphical: string | null;
}

const KIND: Record<ResearchKind, { label: 'kindPlot' | 'kindModel' | 'kindSim'; icon: typeof IconTable }> = {
  plot: { label: 'kindPlot', icon: IconTable },
  model: { label: 'kindModel', icon: IconFormula },
  sim: { label: 'kindSim', icon: IconLab },
};

function DoiBadge({ doi, small = false }: { doi: PublicDoi; small?: boolean }) {
  const t = useT(researchPublic);
  return (
    <a className={`rs-doi${small ? ' rs-doi-sm' : ''}`} href={doiHref(doi)} target="_blank" rel="noreferrer" title={doi.sandbox ? t('doiSandbox') : t('doiPermanent')}>
      <span className="rs-doi-tag">DOI</span><span className="rs-doi-value">{doi.doi}</span>
    </a>
  );
}

/**
 * Публичная страница — «приложение к статье»: обложка с DOI и готовой ссылкой,
 * графический абстракт, рисунки с живыми моделями и тренажёрами. Читателю не нужен
 * аккаунт; каждый рисунок можно скачать и встроить на свой сайт.
 */
export default function PublicResearch({ token, embed, author, cover, items, isProject }: {
  token: string; embed: boolean; author: string; cover: PublicCover; items: PublicItem[]; isProject: boolean;
}) {
  const t = useT(researchPublic);
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  if (embed) {
    const single = items.length === 1;
    return (
      <div className="rs-public rs-public-embed">
        {items.map((it, i) => (
          <article key={it.id} className="rs-public-item">
            {!single && <h2>{isProject ? t('figNTitle', { n: i + 1 }) : ''}{it.title}</h2>}
            <FigureBody item={it} token={token} clip={`pe${i}`} />
            {it.caption && <p className="rs-public-caption">{it.caption}</p>}
          </article>
        ))}
        <a className="rs-pub-embed-foot" href={`/r/${token}`} target="_blank" rel="noreferrer"><IconLogo size={12} />Tesseract</a>
      </div>
    );
  }

  const url = origin ? `${origin}/r/${token}` : '';
  return (
    <div className="rs-pub">
      <header className="rs-pub-bar">
        <a href="/" className="brand"><span className="brand-mark"><IconLogo size={15} /></span>Tesseract</a>
        <span className="rs-pub-bar-note">{isProject ? t('barProject') : t('barItem')}</span>
      </header>

      <Cover cover={cover} author={author} count={items.length} isProject={isProject} url={url} />

      {cover.graphical && (
        <figure className="rs-pub-hero" id="abstract">
          <div className="rs-pub-hero-img" dangerouslySetInnerHTML={{ __html: cover.graphical }} />
          <figcaption>{t('graphical')}</figcaption>
        </figure>
      )}

      <div className={`rs-pub-layout${isProject && items.length > 1 ? '' : ' rs-pub-layout-single'}`}>
        {isProject && items.length > 1 && <Toc items={items} abstract={!!cover.graphical} />}
        <div className="rs-pub-figs">
          {items.map((it, i) => (
            <article key={it.id} className="rs-pub-card" id={`fig-${i + 1}`} style={{ '--i': i } as React.CSSProperties}>
              <header className="rs-pub-card-head">
                {isProject && <span className="rs-pub-fig-no">{t('figN', { n: i + 1 })}</span>}
                <h2>{it.title}</h2>
                <span className="rs-pub-kind">{(() => { const K = KIND[it.kind].icon; return <K size={13} />; })()}{t(KIND[it.kind].label)}</span>
              </header>
              <FigureBody item={it} token={token} clip={`pc${i}`} />
              {it.caption && <p className="rs-public-caption">{isProject && <b>{t('figNTitle', { n: i + 1 })}</b>}{it.caption}</p>}
              <FigureActions item={it} token={token} origin={origin} />
            </article>
          ))}
          {items.length === 0 && <p className="muted">{t('empty')}</p>}
        </div>
      </div>

      <footer className="rs-pub-foot">
        <span><IconLogo size={13} />{t('madeIn')} <a href="/">Tesseract</a> {t('madeInTail')}</span>
      </footer>
    </div>
  );
}

/* ----------------------------------- обложка ----------------------------------- */

function Cover({ cover, author, count, isProject, url }: { cover: PublicCover; author: string; count: number; isProject: boolean; url: string }) {
  const t = useT(researchPublic);
  const [panel, setPanel] = useState<'cite' | 'share' | null>(null);
  const toggle = (p: 'cite' | 'share') => setPanel((cur) => (cur === p ? null : p));
  return (
    <section className="rs-pub-cover">
      <span className="rs-eyebrow">{isProject ? t('figuresCount', { n: count }) : t('itemEyebrow')}</span>
      <h1>{cover.title}</h1>
      {cover.description && <p className="rs-pub-lead">{cover.description}</p>}
      <div className="rs-pub-meta">
        {author && <span className="rs-pub-author"><span className="rs-pub-avatar" aria-hidden>{author.trim()[0]?.toUpperCase()}</span>{author}</span>}
        <span>{t('updated')} <time dateTime={cover.updatedIso}>{cover.updated}</time></span>
      </div>
      <div className="rs-pub-actions">
        {cover.doi && <DoiBadge doi={cover.doi} />}
        <button type="button" className={`btn btn-sm ${panel === 'cite' ? 'btn-primary' : 'btn-secondary'}`} aria-expanded={panel === 'cite'} onClick={() => toggle('cite')}>
          <IconQuote size={14} />{t('howToCite')}
        </button>
        <button type="button" className={`btn btn-sm ${panel === 'share' ? 'btn-primary' : 'btn-secondary'}`} aria-expanded={panel === 'share'} onClick={() => toggle('share')}>
          <IconSend size={14} />{t('share')}
        </button>
      </div>
      {panel === 'cite' && <CitePanel cover={cover} author={author} url={url} />}
      {panel === 'share' && <SharePanel url={url} title={cover.title} />}
    </section>
  );
}

function CitePanel({ cover, author, url }: { cover: PublicCover; author: string; url: string }) {
  const t = useT(researchPublic);
  const locale = useLocale();
  const [tab, setTab] = useState<keyof CitationSet>('gost');
  // Без DOI цитируем страницу; дата обращения — сегодняшняя у читателя.
  const cite = useMemo(() => cover.cite ?? webCitation({ title: cover.title, author, url, accessed: new Date(), updated: cover.updatedIso }, locale), [cover, author, url, locale]);
  const TABS: { key: keyof CitationSet; label: string }[] = [{ key: 'gost', label: t('gost') }, { key: 'apa', label: 'APA' }, { key: 'bibtex', label: 'BibTeX' }];
  return (
    <div className="rs-pub-panel" role="region" aria-label={t('howToCite')}>
      <div className="rs-pub-panel-head">
        <div className="segmented" role="tablist" aria-label={t('citeStyle')}>
          {TABS.map((tb) => (
            <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} className={tab === tb.key ? 'segmented-item active' : 'segmented-item'} onClick={() => setTab(tb.key)}>{tb.label}</button>
          ))}
        </div>
        <CopyButton text={cite[tab]} />
      </div>
      <pre className={`rs-pub-cite${tab === 'bibtex' ? ' rs-pub-cite-code' : ''}`}>{cite[tab]}</pre>
      <p className="muted rs-small">
        {cover.cite ? t('citeDoi') : t('citeWeb')}
      </p>
    </div>
  );
}

function SharePanel({ url, title }: { url: string; title: string }) {
  const t = useT(researchPublic);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator.share === 'function'); }, []);
  useEffect(() => {
    if (url && canvas.current) QRCode.toCanvas(canvas.current, url, { width: 132, margin: 1 }).catch(() => {});
  }, [url]);
  return (
    <div className="rs-pub-panel rs-pub-share" role="region" aria-label={t('share')}>
      <div className="rs-pub-share-main">
        <label className="field"><span>{t('pageLink')}</span><input readOnly value={url} onFocus={(e) => e.target.select()} /></label>
        <div className="rs-row">
          <CopyButton text={url} label={t('copyLink')} />
          <CopyButton text={`<iframe src="${url}?embed=1" width="760" height="560" style="border:0" loading="lazy" title="${title.replace(/"/g, '&quot;')}"></iframe>`} label={t('embedCode')} />
          {canShare && <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigator.share({ title, url }).catch(() => {})}><IconSend size={14} />{t('send')}</button>}
        </div>
      </div>
      <figure className="rs-qr"><canvas ref={canvas} /><figcaption>{t('qr')}</figcaption></figure>
    </div>
  );
}

/* ----------------------------------- рисунки ----------------------------------- */

function Toc({ items, abstract }: { items: PublicItem[]; abstract: boolean }) {
  const t = useT(researchPublic);
  const [active, setActive] = useState<string | null>(null);
  // Подсвечиваем рисунок, который сейчас на экране: длинную страницу легко потерять.
  useEffect(() => {
    const els = items.map((_, i) => document.getElementById(`fig-${i + 1}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: '-20% 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav className="rs-pub-toc" aria-label={t('figures')}>
      <span className="rs-pub-toc-label"><IconBook size={13} />{t('contents')}</span>
      <ol>
        {abstract && <li><a href="#abstract">{t('graphical')}</a></li>}
        {items.map((it, i) => (
          <li key={it.id}>
            <a href={`#fig-${i + 1}`} className={active === `fig-${i + 1}` ? 'active' : undefined} aria-current={active === `fig-${i + 1}` ? 'location' : undefined}>
              <b>{t('figN', { n: i + 1 })}</b><span>{it.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FigureBody({ item: it, token, clip }: { item: PublicItem; token: string; clip: string }) {
  if (it.kind === 'plot') return <PublicPlot doc={it.doc as PlotDoc} clip={clip} />;
  if (it.kind === 'model') return <ModelEditor doc={it.doc as ModelDoc} title={it.title} readOnly />;
  return <iframe className="rs-sim-frame" sandbox="allow-scripts" loading="lazy" title={it.title} src={`/api/public/research/${token}/sim?item=${it.id}`} />;
}

function FigureActions({ item: it, token, origin }: { item: PublicItem; token: string; origin: string }) {
  const t = useT(researchPublic);
  const locale = useLocale();
  // SVG модели — с исходными значениями параметров: так рисунок совпадает со статьёй.
  const svg = useMemo(() => {
    if (it.kind === 'plot') {
      try { return renderPlot({ ...buildPlot(it.doc as PlotDoc, locale).spec, width: 760, height: 480 }); } catch { return null; }
    }
    return it.kind === 'model' ? renderDoc('model', it.doc, { width: 760, height: 480 }, locale) : null;
  }, [it, locale]);
  const embed = `<iframe src="${origin}/r/${token}?embed=1&item=${it.id}" width="760" height="${it.kind === 'plot' ? 520 : 620}" style="border:0" loading="lazy" title="${it.title.replace(/"/g, '&quot;')}"></iframe>`;
  const extra = (
    <>
      <CopyButton text={embed} label={t('embed')} />
      {it.kind === 'sim' && (
        <a className="btn btn-sm btn-secondary" href={`/api/public/research/${token}/sim?item=${it.id}`} target="_blank" rel="noreferrer"><IconExpand size={14} />{t('fullscreen')}</a>
      )}
    </>
  );
  return (
    <div className="rs-pub-card-foot">
      {it.doi && <DoiBadge doi={it.doi} small />}
      {svg ? <ExportBar svg={svg} name={it.title}>{extra}</ExportBar> : <div className="rs-export"><span className="rs-pub-code-ico"><IconCode size={14} /></span>{extra}</div>}
    </div>
  );
}

function PublicPlot({ doc, clip }: { doc: PlotDoc; clip: string }) {
  const locale = useLocale();
  const built = useMemo(() => buildPlot(doc, locale), [doc, locale]);
  const svg = useMemo(() => renderPlot({ ...built.spec, width: 760, height: 480, clipId: clip }), [built, clip]);
  return (
    <>
      <div className="rs-figure" dangerouslySetInnerHTML={{ __html: svg }} />
      {built.fits.map((r, i) => r && (
        <p key={i} className="rs-small rs-mono rs-public-fit">
          y = {r.expr}: {r.params.map((p) => `${p.name} = ${formatWithError(p.value, p.error)}`).join('; ')}; R² = {r.r2.toFixed(4)}
        </p>
      ))}
    </>
  );
}

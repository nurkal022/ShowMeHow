'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ResearchProject } from '@/lib/research/store';
import type { ResearchKind } from '@/lib/research/doc';
import type { ItemCard } from '@/lib/research/cards';
import { IconFormula, IconLibrary, IconLab, IconPlus, IconTable, IconUsers, IconWand } from '@/components/icons';
import { api } from './shared';
import SimPicker, { type SimOption } from './SimPicker';
import ModelGallery from './ModelGallery';
import ArticleList from './ArticleList';
import type { ArticleSummary } from '@/lib/research/articles-store';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchHub } from '@/i18n/messages/research-hub';


/** Заготовки для генератора: уровень тренажёра и черновик описания под научную задачу. */
const TEMPLATES: { n: 1 | 2 | 3 | 4 | 5 | 6; level: 'demo' | 'lab' | 'research' }[] = [
  { n: 1, level: 'research' }, { n: 2, level: 'lab' }, { n: 3, level: 'research' },
  { n: 4, level: 'demo' }, { n: 5, level: 'lab' }, { n: 6, level: 'demo' },
];

const KIND_META: Record<ResearchKind, { label: 'kindPlot' | 'kindModel' | 'kindSim'; icon: React.ReactNode }> = {
  plot: { label: 'kindPlot', icon: <IconTable size={14} /> },
  model: { label: 'kindModel', icon: <IconFormula size={14} /> },
  sim: { label: 'kindSim', icon: <IconLab size={14} /> },
};

/** Тип работы при создании проекта. article — вид черновика статьи, который создаётся сразу. */
const PROJECT_TYPES: { key: string; label: 'typeArticle' | 'typeModeling' | 'typeThesis' | 'typeTalk' | 'typePlain'; article?: string }[] = [
  { key: 'article', label: 'typeArticle', article: 'experimental' },
  { key: 'modeling', label: 'typeModeling', article: 'modeling' },
  { key: 'thesis', label: 'typeThesis', article: 'thesis' },
  { key: 'talk', label: 'typeTalk' },
  { key: 'plain', label: 'typePlain' },
];

export interface ProjectCardInfo extends ResearchProject { articles: number; words: number; thumbs: string[] }

/** Декор героя: точки эксперимента появляются, кривая аппроксимации прорисовывается — суть раздела за секунду. */
function HeroFigure() {
  const pts = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map((t, i) => [30 + t * 62, 180 - 150 * Math.exp(-t) - (i % 2 ? 4 : -3)]);
  const curve = Array.from({ length: 60 }, (_, i) => { const t = (i / 59) * 4; return `${i ? 'L' : 'M'}${(30 + t * 62).toFixed(1)} ${(180 - 150 * Math.exp(-t)).toFixed(1)}`; }).join('');
  return (
    <svg className="rs-hero-fig" viewBox="0 0 300 200" aria-hidden="true">
      <path d="M30 20V180H285" fill="none" stroke="currentColor" strokeOpacity=".35" />
      <path className="rs-hero-curve" d={curve} fill="none" stroke="var(--accent)" strokeWidth="2.5" pathLength={1} />
      {pts.map(([x, y], i) => <circle key={i} className="rs-hero-pt" style={{ animationDelay: `${i * 70}ms` }} cx={x} cy={y} r="4" />)}
    </svg>
  );
}

export default function ResearchHub({ projects, items, sims, articles }: {
  projects: ProjectCardInfo[]; items: ItemCard[]; sims: SimOption[]; articles: ArticleSummary[];
}) {
  const t = useT(researchHub);
  const tc = useT(common);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectType, setProjectType] = useState<string>('article');
  const [brief, setBrief] = useState('');
  const [level, setLevel] = useState<'demo' | 'lab' | 'research'>('research');
  const [gallery, setGallery] = useState(false);

  async function create(kind: ResearchKind, extra: Record<string, unknown> = {}) {
    setBusy(kind + (extra.mode ?? ''));
    setError(null);
    try {
      const r = await api<{ item: { id: string } }>('/api/research/items', { method: 'POST', body: { kind, ...extra } });
      router.push(`/research/${r.item.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function createProject() {
    if (!projectTitle.trim()) return;
    try {
      const r = await api<{ project: { id: string } }>('/api/research/projects', { method: 'POST', body: { title: projectTitle } });
      // Тип работы сразу даёт каркас: статья или тезисы — черновик нужного вида, доклад — путь к показу.
      const kind = PROJECT_TYPES.find((p) => p.key === projectType)?.article;
      if (kind) await api('/api/research/articles', { method: 'POST', body: { title: projectTitle, kind, projectId: r.project.id } });
      router.push(`/research/projects/${r.project.id}${projectType === 'talk' ? '?step=show' : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const generate = (text: string, lvl: string) => router.push(`/?brief=${encodeURIComponent(text)}&level=${lvl}`);
  const loose = items.filter((i) => i.projectTitle === null);
  const looseArticles = articles.filter((a) => !a.projectId);

  return (
    <div className="rs-page">
      <section className="rs-hero">
        <div className="rs-hero-text">
          <h1>{t('heading')}</h1>
          <p>{t('lead')}</p>
          <div className="rs-hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => { setNewProject(true); requestAnimationFrame(() => document.getElementById('rs-new-project')?.focus()); }}><IconPlus size={15} />{t('newProject')}</button>
            <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => create('plot')}><IconTable size={15} />{t('quickPlot')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setGallery(true)}><IconLibrary size={15} />{t('modelGallery')}</button>
            <a className="btn btn-secondary" href="#generate"><IconWand size={15} />{t('simulator')}</a>
          </div>
        </div>
        <HeroFigure />
      </section>
      {error && <p className="rs-error">{error}</p>}

      <section className="rs-section">
        <div className="rs-section-head"><h2>{t('projects')}</h2></div>
        <div className="rs-projects">
          {projects.map((p) => (
            <Link key={p.id} href={`/research/projects/${p.id}`} className="rs-project">
              <div className="rs-project-thumbs">
                {p.thumbs.length
                  ? p.thumbs.map((th, i) => <span key={i} className="rs-project-thumb" dangerouslySetInnerHTML={{ __html: th }} />)
                  : <span className="rs-project-thumb rs-project-thumb-empty"><IconLab size={22} /></span>}
              </div>
              <strong>{p.title}</strong>
              {p.description && <span className="rs-project-desc">{p.description}</span>}
              <span className="rs-project-steps">
                <span className={p.itemCount ? 'on' : ''}>{p.itemCount ? t('figuresCount', { n: p.itemCount }) : t('noFigures')}</span>
                <span className={p.words ? 'on' : ''}>{p.words ? t('wordsOfText', { n: p.words }) : p.articles ? t('articleStarted') : t('noText')}</span>
                <span className={p.publicToken || p.zenodo ? 'on' : ''}>{p.zenodo ? 'DOI' : p.publicToken ? <><IconUsers size={12} />{t('isOpen')}</> : t('notShown')}</span>
              </span>
            </Link>
          ))}
          {newProject ? (
            <form className="rs-project rs-project-new-form" onSubmit={(e) => { e.preventDefault(); createProject(); }}>
              <strong>{t('newProject')}</strong>
              <input id="rs-new-project" className="input" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={t('projectTitlePh')} maxLength={200} />
              <div className="rs-type-chips" role="radiogroup" aria-label={t('workType')}>
                {PROJECT_TYPES.map((p) => (
                  <button key={p.key} type="button" role="radio" aria-checked={projectType === p.key} title={t(`${p.label}Hint` as 'typeArticleHint')}
                    className={projectType === p.key ? 'rs-type-chip on' : 'rs-type-chip'} onClick={() => setProjectType(p.key)}>{t(p.label)}</button>
                ))}
              </div>
              <div className="rs-row">
                <button type="submit" className="btn btn-sm btn-primary" disabled={!projectTitle.trim()}>{tc('create')}</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNewProject(false)}>{tc('cancel')}</button>
              </div>
            </form>
          ) : (
            <button type="button" className="rs-project rs-project-new" onClick={() => setNewProject(true)}>
              <span className="rs-project-new-icon"><IconPlus size={22} /></span>
              <strong>{t('newProject')}</strong>
              <span className="muted rs-small">{t('newProjectHint')}</span>
            </button>
          )}
        </div>
      </section>

      {(loose.length > 0 || looseArticles.length > 0) && (
        <section className="rs-section">
          <div className="rs-section-head">
            <h2>{t('noProjectSection')}</h2>
            <span className="muted rs-small">{t('moveHint')}</span>
          </div>
          {loose.length > 0 && <div className="rs-items">{loose.map((it) => <ItemTile key={it.id} item={it} />)}</div>}
          {looseArticles.length > 0 && <ArticleList articles={looseArticles} />}
        </section>
      )}

      <section className="rs-section rs-generate" id="generate">
        <div className="rs-section-head">
          <h2>{t('sciSim')}</h2>
          <SimPicker sims={sims} />
        </div>
        <p className="muted rs-small">{t('sciSimLead')}</p>
        <form className="rs-brief" onSubmit={(e) => { e.preventDefault(); if (brief.trim()) generate(brief, level); }}>
          <textarea className="input" rows={2} value={brief} onChange={(e) => setBrief(e.target.value)}
            placeholder={t('briefPh')} />
          <div className="rs-row">
            <div className="segmented" role="group" aria-label={t('level')}>
              {(['demo', 'lab', 'research'] as const).map((l) => (
                <button key={l} type="button" className={level === l ? 'segmented-item active' : 'segmented-item'} onClick={() => setLevel(l)}>
                  {t(({ demo: 'levelDemo', lab: 'levelLab', research: 'levelResearch' } as const)[l])}
                </button>
              ))}
            </div>
            <button type="submit" className="btn btn-primary" disabled={!brief.trim()}><IconWand size={15} />{t('toWorkshop')}</button>
          </div>
        </form>
        <div className="rs-templates">
          {TEMPLATES.map((tp) => (
            <button key={tp.n} type="button" className="rs-template" onClick={() => generate(t(`tpl${tp.n}Brief`), tp.level)}>
              <span className={`rs-level rs-level-${tp.level}`}>{t(({ demo: 'tagDemo', lab: 'tagLab', research: 'tagResearch' } as const)[tp.level])}</span>
              <strong>{t(`tpl${tp.n}Title`)}</strong>
              <span>{t(`tpl${tp.n}Hint`)}</span>
            </button>
          ))}
        </div>
      </section>
      <ModelGallery open={gallery} onClose={() => setGallery(false)} />
    </div>
  );
}

export function ItemTile({ item }: { item: ItemCard }) {
  const t = useT(researchHub);
  const meta = KIND_META[item.kind];
  return (
    <Link href={`/research/${item.id}`} className="rs-tile">
      <div className="rs-tile-thumb">
        {item.thumb ? <div dangerouslySetInnerHTML={{ __html: item.thumb }} /> : <span className="rs-tile-placeholder">{meta.icon}</span>}
      </div>
      <div className="rs-tile-body">
        <span className="rs-kind">{meta.icon}{t(meta.label)}{item.shared && <span className="rs-kind-open">{t('isOpen')}</span>}</span>
        <strong>{item.title}</strong>
        {item.projectTitle && <span className="muted rs-small">{item.projectTitle}</span>}
      </div>
    </Link>
  );
}

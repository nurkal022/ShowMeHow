'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ResearchProject } from '@/lib/research/store';
import { hasGraphicalContent } from '@/lib/research/article';
import type { ResearchKind } from '@/lib/research/doc';
import { IconBack, IconCheck, IconEye, IconFormula, IconLab, IconLibrary, IconMonitor, IconSpark, IconTable, IconTrash, IconWand } from '@/components/icons';
import type { ItemCard } from '@/lib/research/cards';
import { ItemTile } from './ResearchHub';
import SimPicker, { type SimOption } from './SimPicker';
import ModelGallery from './ModelGallery';
import ArticleList from './ArticleList';
import TitleField from './TitleField';
import type { ArticleSummary } from '@/lib/research/articles-store';
import { api, SharePanel } from './shared';
import ZenodoPanel from './ZenodoPanel';
import ProjectGraphical, { type GraphicalFigure } from './ProjectGraphical';
import CompositeFigure from './CompositeFigure';
import { useT } from '@/i18n/client';
import { researchHub } from '@/i18n/messages/research-hub';
import { researchCommon } from '@/i18n/messages/research-common';

type Step = 'figures' | 'text' | 'show';

/**
 * Проект — одна работа (статья, грант, доклад), и путь по ней в три шага:
 * рисунки → текст → показать. Шаг помнится в адресе, чтобы ссылка вела туда же.
 */
export default function ProjectView({ project: initial, items, sims, articles, gaFigures }: {
  project: ResearchProject; items: ItemCard[]; sims: SimOption[]; articles: ArticleSummary[]; gaFigures: GraphicalFigure[];
}) {
  const t = useT(researchHub);
  const tr = useT(researchCommon);
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('figures');
  const [composite, setComposite] = useState(false);
  const [gallery, setGallery] = useState(false);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('step');
    if (s === 'text' || s === 'show') setStep(s);
  }, []);
  const go = (s: Step) => {
    setStep(s);
    const url = new URL(window.location.href);
    url.searchParams.set('step', s);
    window.history.replaceState(null, '', url);
  };

  useEffect(() => {
    if (title === project.title && description === project.description) return;
    const timer = setTimeout(() => {
      if (!title.trim()) return;
      api<{ project: ResearchProject }>(`/api/research/projects/${project.id}`, { method: 'PATCH', body: { title, description } })
        .then((r) => setProject(r.project), (e: Error) => setError(e.message));
    }, 700);
    return () => clearTimeout(timer);
  }, [title, description, project]);

  async function create(kind: ResearchKind, mode?: string) {
    try {
      const r = await api<{ item: { id: string } }>('/api/research/items', { method: 'POST', body: { kind, mode, projectId: project.id } });
      router.push(`/research/${r.item.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const words = articles.reduce((n, a) => n + a.words, 0);
  const hasGa = hasGraphicalContent(project.graphical);
  const shown = !!project.publicToken || !!project.zenodo || hasGa;
  const STEPS: { key: Step; n: number; title: string; status: string; done: boolean }[] = [
    { key: 'figures', n: 1, title: t('stepFigures'), done: items.length > 0,
      status: items.length ? t('itemsCount', { n: items.length }) : t('itemsEmpty') },
    { key: 'text', n: 2, title: t('stepText'), done: words > 0,
      status: articles.length ? t('articlesWords', { a: articles.length, w: words }) : t('articleAround') },
    { key: 'show', n: 3, title: t('stepShow'), done: shown,
      status: [project.publicToken && t('showLink'), project.zenodo && 'DOI', hasGa && t('showAbstract')].filter(Boolean).join(', ') || t('showEmpty') },
  ];

  return (
    <div className="rs-page">
      <header className="rs-item-head">
        <Link href="/research" className="btn btn-sm btn-ghost"><IconBack size={15} />{tr('research')}</Link>
        <div className="rs-item-title">
          <span className="rs-kind">{t('project')}</span>
          <TitleField value={title} onChange={setTitle} label={t('projectTitle')} />
        </div>
        {project.publicToken && <a className="btn btn-sm btn-secondary" href={`/r/${project.publicToken}`} target="_blank" rel="noreferrer"><IconEye size={14} />{t('publicPage')}</a>}
        <Link className="btn btn-sm btn-secondary" href={`/research/projects/${project.id}/present`}><IconMonitor size={14} />{t('presentMode')}</Link>
        <button type="button" className="icon-btn" aria-label={t('deleteProject')} title={t('deleteProjectTitle')} onClick={async () => {
          if (!confirm(t('confirmDeleteProject'))) return;
          await api(`/api/research/projects/${project.id}`, { method: 'DELETE' });
          router.push('/research');
        }}><IconTrash size={17} /></button>
      </header>
      {error && <p className="rs-error">{error}</p>}
      <textarea className="input rs-project-about" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={8000}
        placeholder={t('aboutPh')} />

      <nav className="rs-steps" aria-label={t('projectSteps')}>
        {STEPS.map((s) => (
          <button key={s.key} type="button" className={`rs-step${step === s.key ? ' active' : ''}${s.done ? ' done' : ''}`}
            onClick={() => go(s.key)} aria-current={step === s.key ? 'step' : undefined}>
            <span className="rs-step-n">{s.done ? <IconCheck size={15} /> : s.n}</span>
            <span className="rs-step-text"><strong>{s.title}</strong><span>{s.status}</span></span>
          </button>
        ))}
      </nav>

      <div className="rs-step-body" key={step}>
        {step === 'figures' && (
          <>
            <div className="rs-quick">
              <button type="button" className="rs-quick-card" onClick={() => create('plot')}><span className="rs-create-icon tone-blue"><IconTable size={18} /></span><strong>{t('qPlot')}</strong><span>{t('qPlotHint')}</span></button>
              <button type="button" className="rs-quick-card" onClick={() => create('model', 'function')}><span className="rs-create-icon tone-violet"><IconFormula size={18} /></span><strong>{t('qFn')}</strong><span>{t('qFnHint')}</span></button>
              <button type="button" className="rs-quick-card" onClick={() => create('model', 'ode')}><span className="rs-create-icon tone-green"><IconSpark size={18} /></span><strong>{t('qOde')}</strong><span>{t('qOdeHint')}</span></button>
              <Link className="rs-quick-card" href="/research#generate"><span className="rs-create-icon tone-amber"><IconWand size={18} /></span><strong>{t('qSim')}</strong><span>{t('qSimHint')}</span></Link>
              <button type="button" className="rs-quick-card" onClick={() => setGallery(true)}><span className="rs-create-icon tone-blue"><IconLibrary size={18} /></span><strong>{t('qGallery')}</strong><span>{t('qGalleryHint')}</span></button>
            </div>
            <div className="rs-row">
              <SimPicker sims={sims} projectId={project.id} />
              {gaFigures.filter((f) => f.svg).length > 1 && !composite && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setComposite(true)}>{t('compositeBtn')}</button>
              )}
            </div>
            {composite && <CompositeFigure figures={gaFigures} title={project.title} onClose={() => setComposite(false)} />}
            {items.length === 0
              ? <div className="rs-empty"><IconLab size={28} /><p>{t('emptyFigures')}</p></div>
              : <div className="rs-items">{items.map((it) => <ItemTile key={it.id} item={it} />)}</div>}
            {items.length > 0 && <div className="rs-next"><button type="button" className="btn btn-primary" onClick={() => go('text')}>{t('nextText')}</button></div>}
          </>
        )}

        {step === 'text' && (
          <>
            <ArticleList articles={articles} projectId={project.id} />
            {items.length === 0 && <p className="muted rs-small">{t('textTip')}</p>}
            {articles.length > 0 && <div className="rs-next"><button type="button" className="btn btn-primary" onClick={() => go('show')}>{t('nextShow')}</button></div>}
          </>
        )}

        {step === 'show' && (
          <>
            <Link className="rs-present-cta" href={`/research/projects/${project.id}/present`}>
              <span className="rs-create-icon tone-violet"><IconMonitor size={18} /></span>
              <span><strong>{t('presentMode')}</strong><span>{t('presentCtaHint')}</span></span>
            </Link>
            <ProjectGraphical projectId={project.id} title={project.title} initial={project.graphical}
              figures={gaFigures} />
            <div className="rs-bottom">
              <SharePanel token={project.publicToken} what={t('thisProject')}
                onToggle={async (on) => {
                  const r = await api<{ project: ResearchProject }>(`/api/research/projects/${project.id}`, { method: 'PATCH', body: { shared: on } });
                  setProject(r.project);
                }} />
              <ZenodoPanel target="project" id={project.id} zenodo={project.zenodo} />
            </div>
          </>
        )}
      </div>
      <ModelGallery open={gallery} onClose={() => setGallery(false)} projectId={project.id} />
    </div>
  );
}

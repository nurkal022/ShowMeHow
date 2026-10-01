'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ResearchItem, ResearchProject } from '@/lib/research/store';
import type { ModelDoc, PlotDoc, SimDoc } from '@/lib/research/doc';
import { IconBack, IconCopy, IconExpand, IconTrash, IconWand } from '@/components/icons';
import PlotEditor from './PlotEditor';
import TitleField from './TitleField';
import ModelEditor from './ModelEditor';
import { api, patchItem, ProjectSelect, SaveBadge, SharePanel, useAutosave } from './shared';
import ZenodoPanel from './ZenodoPanel';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchCommon } from '@/i18n/messages/research-common';

const KIND_LABEL = { plot: 'kindPlot', model: 'kindModel', sim: 'kindSim' } as const;

/** Рамка материала: название, проект, подпись к рисунку, публикация — вокруг нужного редактора. */
export default function ItemEditor({ item: initial, projects }: { item: ResearchItem; projects: Pick<ResearchProject, 'id' | 'title'>[] }) {
  const t = useT(researchCommon);
  const tc = useT(common);
  const router = useRouter();
  const [item, setItem] = useState(initial);
  const [doc, setDoc] = useState(initial.doc);
  const [title, setTitle] = useState(initial.title);
  const [caption, setCaption] = useState(initial.caption);
  const [error, setError] = useState<string | null>(null);
  const state = useAutosave(item.id, doc);

  // Название и подпись сохраняются так же — с паузой, без кнопки «Сохранить».
  useEffect(() => {
    if (title === item.title && caption === item.caption) return;
    const t = setTimeout(() => {
      if (!title.trim()) return;
      patchItem(item.id, { title, caption }).then(setItem, (e: Error) => setError(e.message));
    }, 700);
    return () => clearTimeout(t);
  }, [title, caption, item]);

  const backHref = item.projectId ? `/research/projects/${item.projectId}` : '/research';

  return (
    <div className="rs-page">
      <header className="rs-item-head">
        <Link href={backHref} className="btn btn-sm btn-ghost"><IconBack size={15} />{item.projectId ? t('toProject') : t('research')}</Link>
        <div className="rs-item-title">
          <span className="rs-kind">{t(KIND_LABEL[item.kind])}</span>
          <TitleField value={title} onChange={setTitle} label={t('title')} />
        </div>
        <div className="rs-row">
          {item.kind !== 'sim' && <SaveBadge state={state} />}
          <ProjectSelect value={item.projectId} projects={projects} onChange={(projectId) => patchItem(item.id, { projectId }).then(setItem, (e: Error) => setError(e.message))} />
          <button type="button" className="icon-btn" title={t('copyShort')} aria-label={t('makeCopy')} onClick={async () => {
            const r = await api<{ item: ResearchItem }>(`/api/research/items/${item.id}/duplicate`, { method: 'POST' });
            router.push(`/research/${r.item.id}`);
          }}><IconCopy size={17} /></button>
          <button type="button" className="icon-btn" title={tc('delete')} aria-label={tc('delete')} onClick={async () => {
            if (!confirm(t('confirmDeleteItem'))) return;
            await api(`/api/research/items/${item.id}`, { method: 'DELETE' });
            router.push(backHref);
          }}><IconTrash size={17} /></button>
        </div>
      </header>
      {error && <p className="rs-error">{error}</p>}

      {item.kind === 'plot' && <PlotEditor doc={doc as PlotDoc} onChange={setDoc} title={title} />}
      {item.kind === 'model' && <ModelEditor doc={doc as ModelDoc} onChange={setDoc} title={title} />}
      {item.kind === 'sim' && <SimView simulationId={(doc as SimDoc).simulationId} />}

      <div className="rs-bottom">
        <section className="rs-panel">
          <h3>{t('captionNotes')}</h3>
          <textarea className="input" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={8000}
            placeholder={t('captionPh')} />
        </section>
        <SharePanel token={item.publicToken} what={t('thisItem')}
          onToggle={async (on) => setItem(await patchItem(item.id, { shared: on }))} />
        <ZenodoPanel target="item" id={item.id} zenodo={item.zenodo} />
      </div>
    </div>
  );
}

function SimView({ simulationId }: { simulationId: string }) {
  const t = useT(researchCommon);
  const [html, setHtml] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`/api/simulations/${simulationId}`).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { html: string }) => setHtml(d.html), () => setMissing(true));
  }, [simulationId]);
  if (missing) return <p className="rs-error">{t('simMissing')}</p>;
  return (
    <div className="rs-sim">
      <div className="rs-row">
        <Link className="btn btn-sm btn-secondary" href={`/?id=${simulationId}`}><IconWand size={14} />{t('refineInWorkshop')}</Link>
        <Link className="btn btn-sm btn-secondary" href={`/present/${simulationId}`}><IconExpand size={14} />{t('fullScreen')}</Link>
      </div>
      {html ? <iframe className="rs-sim-frame" sandbox="allow-scripts" srcDoc={html} title={t('simulator')} /> : <div className="rs-sim-frame rs-skeleton" />}
    </div>
  );
}

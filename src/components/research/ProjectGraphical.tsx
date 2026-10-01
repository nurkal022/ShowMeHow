'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hasGraphicalContent, type GraphicalAbstract } from '@/lib/research/article';
import { renderGraphicalAbstract } from '@/lib/research/article-render';
import { IconDownload, IconPlus, IconSpark, IconTrash } from '@/components/icons';
import { api, download, fileSafe, svgToPng } from './shared';
import { useT } from '@/i18n/client';
import { researchHub } from '@/i18n/messages/research-hub';

export interface GraphicalFigure { id: string; title: string; kind: string; svg: string | null }

/**
 * Графический абстракт проекта: содержание от помощника или автора, картинка — кодом
 * из рисунка проекта. Схема, а не нейросетевое изображение: так её принимают журналы
 * с ограничениями на AI-картинки.
 */
export default function ProjectGraphical({ projectId, title, initial, figures }: {
  projectId: string; title: string; initial: GraphicalAbstract | null; figures: GraphicalFigure[];
}) {
  const t = useT(researchHub);
  const withSvg = figures.filter((f) => f.svg);
  const [ga, setGa] = useState<GraphicalAbstract>(initial ?? {
    headline: title, steps: [{ label: '', detail: '' }, { label: '', detail: '' }, { label: '', detail: '' }], takeaway: '',
    figureId: (withSvg.find((f) => f.kind === 'plot') ?? withSvg[0])?.id ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Сохраняем только настоящие правки: открытие страницы не должно записывать пустую заготовку.
  const saved = useRef(JSON.stringify(initial));
  const set = (patch: Partial<GraphicalAbstract>) => setGa((g) => ({ ...g, ...patch }));
  const figSvg = withSvg.find((f) => f.id === ga.figureId)?.svg ?? null;
  // Пустые поля в превью — подсказки, а не пустые коробки: видно, что где будет.
  const svg = useMemo(() => renderGraphicalAbstract({
    ...ga,
    headline: ga.headline || title,
    steps: (ga.steps.length ? ga.steps : [{ label: '', detail: '' }]).map((s, i) => ({
      label: s.label || [t('gaWhat'), t('gaHow'), t('gaGot'), t('gaNext')][i],
      detail: s.detail || (s.label ? '' : t('gaDetail')),
    })),
    takeaway: ga.takeaway || t('gaTakeaway'),
  }, figSvg), [ga, figSvg, title, t]);

  useEffect(() => {
    const json = JSON.stringify(ga);
    if (json === saved.current || (!initial && !hasGraphicalContent(ga))) return;
    const timer = setTimeout(() => { api(`/api/research/projects/${projectId}`, { method: 'PATCH', body: { graphical: ga } }).then(() => { saved.current = json; }, () => {}); }, 800);
    return () => clearTimeout(timer);
  }, [ga, projectId]);

  return (
    <div className="ar-ga">
      <section className="rs-panel">
        <div className="rs-panel-head">
          <h3>{t('graphical')}</h3>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const r = await api<Omit<GraphicalAbstract, 'figureId'>>(`/api/research/projects/${projectId}/graphical`, { method: 'POST' });
              set(r);
            } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}><IconSpark size={14} />{busy ? t('thinking') : t('suggest')}</button>
        </div>
        <p className="muted rs-small">{t('graphicalLead')}</p>
        {error && <p className="rs-error">{error}</p>}
        <label className="field"><span>{t('headline')}</span><input value={ga.headline} onChange={(e) => set({ headline: e.target.value })} /></label>
        {ga.steps.map((s, i) => (
          <div key={i} className="ar-ga-step">
            <input className="input" placeholder={t('stepN', { n: i + 1 })} value={s.label} onChange={(e) => set({ steps: ga.steps.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
            <input className="input" placeholder={t('stepDetailPh')} value={s.detail} onChange={(e) => set({ steps: ga.steps.map((x, k) => (k === i ? { ...x, detail: e.target.value } : x)) })} />
            <button type="button" className="icon-btn" aria-label={t('removeStep')} onClick={() => set({ steps: ga.steps.filter((_, k) => k !== i) })}><IconTrash size={14} /></button>
          </div>
        ))}
        {ga.steps.length < 4 && <button type="button" className="btn btn-sm btn-secondary rs-add" onClick={() => set({ steps: [...ga.steps, { label: '', detail: '' }] })}><IconPlus size={13} />{t('step')}</button>}
        <label className="field"><span>{t('takeaway')}</span><input value={ga.takeaway} onChange={(e) => set({ takeaway: e.target.value })} /></label>
        <label className="field"><span>{t('centerFigure')}</span>
          <select value={ga.figureId ?? ''} onChange={(e) => set({ figureId: e.target.value || null })}>
            <option value="">{t('noFigure')}</option>
            {withSvg.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </label>
      </section>
      <div className="ar-ga-preview">
        <div className="rs-figure" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="rs-export">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => download(`${fileSafe(title)}-graphical-abstract.svg`, svg, 'image/svg+xml')}><IconDownload size={14} />SVG</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={async () => download(`${fileSafe(title)}-graphical-abstract.png`, await svgToPng(svg, 1.5))}><IconDownload size={14} />PNG 1800×900</button>
        </div>
      </div>
    </div>
  );
}

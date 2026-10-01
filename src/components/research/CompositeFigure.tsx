'use client';
import { useMemo, useState } from 'react';
import { renderComposite, type CompositeLayout } from '@/lib/research/composite';
import { IconClose, IconDownload } from '@/components/icons';
import { download, fileSafe, svgToPng } from './shared';
import { useLocale, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchCommon } from '@/i18n/messages/research-common';

export interface CompositeSource { id: string; title: string; svg: string | null }

/** Сборка составного рисунка (а)(б) из рисунков проекта: выбрать, расположить, скачать. */
export default function CompositeFigure({ figures, title, onClose }: { figures: CompositeSource[]; title: string; onClose: () => void }) {
  const t = useT(researchCommon);
  const tc = useT(common);
  const usable = figures.filter((f) => f.svg);
  const [picked, setPicked] = useState<string[]>(usable.slice(0, 2).map((f) => f.id));
  const [layout, setLayout] = useState<CompositeLayout>('row');
  const [labels, setLabels] = useState<'ru' | 'en' | 'none'>(useLocale() === 'en' ? 'en' : 'ru');
  const svg = useMemo(() => renderComposite(picked.map((id) => usable.find((f) => f.id === id)?.svg ?? ''), { layout, labels }), [picked, layout, labels, usable]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 6)));

  return (
    <section className="rs-panel cf rs-reveal">
      <div className="rs-panel-head">
        <h3>{t('composite')}</h3>
        <button type="button" className="icon-btn" aria-label={tc('close')} onClick={onClose}><IconClose size={15} /></button>
      </div>
      <p className="muted rs-small">{t('compositeHint')}</p>
      <div className="cf-pick">
        {usable.map((f) => {
          const n = picked.indexOf(f.id);
          return (
            <button key={f.id} type="button" className={n >= 0 ? 'cf-item on' : 'cf-item'} onClick={() => toggle(f.id)}>
              <span className="cf-thumb" dangerouslySetInnerHTML={{ __html: f.svg! }} />
              <span className="cf-title">{f.title}</span>
              {n >= 0 && <span className="cf-badge">{labels === 'en' ? 'abcdef'[n] : 'абвгде'[n]}</span>}
            </button>
          );
        })}
      </div>
      <div className="rs-row">
        <div className="segmented" role="group" aria-label={t('layout')}>
          {([['row', 'layoutRow'], ['column', 'layoutColumn'], ['grid', 'layoutGrid']] as const).map(([k, l]) => (
            <button key={k} type="button" className={layout === k ? 'segmented-item active' : 'segmented-item'} onClick={() => setLayout(k)}>{t(l)}</button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label={t('panelLabels')}>
          {([['ru', '(а)'], ['en', '(a)'], ['none', null]] as const).map(([k, l]) => (
            <button key={k} type="button" className={labels === k ? 'segmented-item active' : 'segmented-item'} onClick={() => setLabels(k)}>{l ?? t('noLabels')}</button>
          ))}
        </div>
      </div>
      {svg ? (
        <>
          <div className="rs-figure cf-preview" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="rs-export">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => download(`${fileSafe(title)}-composite.svg`, svg, 'image/svg+xml')}><IconDownload size={14} />SVG</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={async () => download(`${fileSafe(title)}-composite.png`, await svgToPng(svg, 2))}><IconDownload size={14} />PNG</button>
          </div>
        </>
      ) : <p className="muted rs-small">{t('pickOne')}</p>}
    </section>
  );
}

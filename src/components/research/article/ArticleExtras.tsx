'use client';
import { useState } from 'react';
import Link from 'next/link';
import { figureOrder } from '@/lib/research/article';
import { IconExpand, IconPlus, IconSpark } from '@/components/icons';
import { useArticle } from './context';
import { useT } from '@/i18n/client';
import { researchArticle } from '@/i18n/messages/research-article';

/**
 * Рисунки проекта в боковой панели «Текста»: номер в статье, подпись, вставка в текст.
 * Раньше это была отдельная вкладка — но рисунок нужен ровно там, где пишешь.
 */
export function FiguresPanel({ onInsert }: { onInsert: (text: string, asBlock: boolean) => void }) {
  const t = useT(researchArticle);
  const { doc, figures, setFigureCaption, ai, log } = useArticle();
  const order = figureOrder(doc.sections);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  if (figures.length === 0) {
    return <p className="muted rs-small">{t('noFigures')}</p>;
  }
  return (
    <div className="ar-figpanel">
      {error && <p className="rs-error">{error}</p>}
      {figures.map((f) => {
        const n = order.indexOf(f.id) + 1;
        const expanded = open === f.id;
        return (
          <article key={f.id} className={`ar-figcard${n ? ' in-text' : ''}`}>
            <button type="button" className="ar-figcard-thumb" onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded} title={t('captionActions')}>
              {f.svg ? <span dangerouslySetInnerHTML={{ __html: f.svg }} /> : f.image ? <img src={f.image} alt="" /> : null}
              <span className="ar-figcard-no">{n ? t('figN', { n }) : t('notInText')}</span>
            </button>
            <div className="ar-figcard-row">
              <strong title={f.title}>{f.title}</strong>
              <span className="ar-figcard-actions">
                <button type="button" className="icon-btn" title={t('insertFigTitle')} aria-label={t('insertFig')} onClick={() => onInsert(`{{fig:${f.id}}}`, true)}><IconPlus size={15} /></button>
                <button type="button" className="icon-btn" title={t('refFigTitle')} aria-label={t('refFig')} onClick={() => onInsert(`[[fig:${f.id}]]`, false)}>§</button>
                <Link className="icon-btn" href={`/research/${f.id}`} title={t('openFigTitle')} aria-label={t('openFig')}><IconExpand size={14} /></Link>
              </span>
            </div>
            {expanded && (
              <div className="ar-figcard-more">
                <textarea className="input" rows={3} value={f.caption} placeholder={t('captionPh')} onChange={(e) => setFigureCaption(f.id, e.target.value)} />
                <button type="button" className="btn btn-sm btn-secondary" disabled={!!busy} onClick={async () => {
                  setBusy(f.id); setError(null);
                  try {
                    const r = await ai<{ text: string }>('caption', { itemId: f.id });
                    setFigureCaption(f.id, r.text);
                    log({ action: 'caption', sectionId: null, outcome: 'generated', chars: r.text.length });
                  } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
                }}><IconSpark size={14} />{busy === f.id ? t('writing') : t('captionFromData')}</button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

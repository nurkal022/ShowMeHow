'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildModel } from '@/lib/research/doc';
import { fieldLabel, GALLERY_FIELDS, galleryDoc, galleryList, searchGallery, type GalleryField, type GalleryModel } from '@/lib/research/model-gallery';
import { renderPlot } from '@/lib/research/plot';
import { IconClose, IconSearch } from '@/components/icons';
import { api } from './shared';
import { useLocale, useT } from '@/i18n/client';
import type { Locale } from '@/i18n/config';
import { common } from '@/i18n/messages/common';
import { researchEditor } from '@/i18n/messages/research-editor';

/** Миниатюры считаются один раз на язык: модели детерминированы, а галерею открывают часто. */
const thumbs: Partial<Record<Locale, Record<string, string>>> = {};
function galleryThumbs(locale: Locale): Record<string, string> {
  const cached = thumbs[locale];
  if (cached) return cached;
  const out = Object.fromEntries(galleryList(locale).map((m) => {
    try {
      return [m.key, renderPlot({ ...buildModel(m.doc, undefined, locale).spec, title: '', legend: false, width: 300, height: 180, clipId: `rs-gal-${m.key}` })];
    } catch { return [m.key, '']; }
  }));
  thumbs[locale] = out;
  return out;
}

/**
 * Галерея готовых моделей. Два режима: создать новый материал (из «Исследований»
 * и проекта) или, если передан onPick, отдать документ редактору — «Шаблоны»
 * внутри модели заменяют текущий документ.
 */
export default function ModelGallery({ open, onClose, projectId, onPick }: {
  open: boolean; onClose: () => void; projectId?: string; onPick?: (m: GalleryModel) => void;
}) {
  const t = useT(researchEditor);
  const tc = useT(common);
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [field, setField] = useState<GalleryField | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const list = useMemo(() => searchGallery(query, field, locale), [query, field, locale]);
  const svgs = useMemo(() => (open ? galleryThumbs(locale) : {}), [open, locale]);

  // onClose у родителя — новая функция на каждый рендер; держим её в ref, чтобы эффект
  // не перезапускался (и не сбрасывал фокус в поиск) от чужих перерисовок.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open]);

  if (!open) return null;

  async function pick(m: GalleryModel) {
    if (onPick) { onPick(m); return; }
    setBusy(m.key);
    setError(null);
    try {
      const r = await api<{ item: { id: string } }>('/api/research/items', {
        method: 'POST', body: { kind: 'model', title: m.title, doc: galleryDoc(m), ...(projectId ? { projectId } : {}) },
      });
      router.push(`/research/${r.item.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop rs-gal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rs-gal" role="dialog" aria-modal="true" aria-labelledby="rs-gal-title">
        <header className="rs-gal-head">
          <div>
            <h2 id="rs-gal-title">{t('gallery')}</h2>
            <p className="muted rs-small">{onPick ? t('galleryPickHint') : t('galleryHint')}</p>
          </div>
          <button type="button" className="icon-btn" aria-label={tc('close')} onClick={onClose}><IconClose size={18} /></button>
        </header>
        <div className="rs-gal-tools">
          <label className="rs-gal-search">
            <IconSearch size={15} />
            <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('gallerySearchPh')} aria-label={t('gallerySearch')} />
          </label>
          <div className="rs-gal-chips" role="group" aria-label={t('field')}>
            <button type="button" className={field === null ? 'rs-gal-chip on' : 'rs-gal-chip'} aria-pressed={field === null} onClick={() => setField(null)}>{t('all')}</button>
            {GALLERY_FIELDS.map((f) => (
              <button key={f} type="button" className={field === f ? 'rs-gal-chip on' : 'rs-gal-chip'} aria-pressed={field === f} onClick={() => setField(field === f ? null : f)}>{fieldLabel(f, locale)}</button>
            ))}
          </div>
        </div>
        {error && <p className="rs-error">{error}</p>}
        <div className="rs-gal-grid">
          {list.map((m, i) => (
            <button key={m.key} type="button" className="rs-gal-card" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              disabled={!!busy} onClick={() => pick(m)} aria-busy={busy === m.key}>
              <span className="rs-gal-thumb" dangerouslySetInnerHTML={{ __html: svgs[m.key] ?? '' }} />
              <span className="rs-gal-body">
                <span className="rs-gal-meta"><span className="rs-gal-field">{fieldLabel(m.field, locale)}</span>{m.doc.mode === 'ode' ? t('odeN', { n: m.doc.lines.length }) : t('formula')}</span>
                <strong>{m.title}</strong>
                <span className="rs-gal-desc">{m.description}</span>
              </span>
              {busy === m.key && <span className="rs-gal-busy">{t('creating')}</span>}
            </button>
          ))}
          {list.length === 0 && <p className="muted rs-small rs-gal-empty">{t('galleryEmpty')}</p>}
        </div>
      </div>
    </div>
  );
}

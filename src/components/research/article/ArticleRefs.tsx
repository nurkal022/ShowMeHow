'use client';
import { useState } from 'react';
import {
  citationOrder, formatReference, parseBibtex, referenceKey, toBibtex, type Reference,
} from '@/lib/research/article';
import { renderMarkup } from '@/lib/lms/markup';
import { IconDownload, IconPlus, IconSearch, IconTrash } from '@/components/icons';
import { api, download } from '../shared';
import { useArticle } from './context';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchArticle } from '@/i18n/messages/research-article';

/**
 * Литература: по DOI через Crossref, поиск по названию, вставка BibTeX из Zotero/Mendeley.
 * Только эти источники может цитировать помощник — список и есть защита от выдуманных ссылок.
 */
export default function ArticleRefs() {
  const t = useT(researchArticle);
  const tc = useT(common);
  const { doc, update } = useArticle();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Reference[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bib, setBib] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const cited = citationOrder(doc.sections, doc.references);

  const add = (r: Reference) => update((d) => {
    if (r.doi && d.references.some((x) => x.doi && x.doi.toLowerCase() === r.doi.toLowerCase())) return d;
    const taken = d.references.map((x) => x.id);
    return { ...d, references: [...d.references, { ...r, id: r.id && !taken.includes(r.id) ? r.id : referenceKey(r, taken) }] };
  });

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true); setError(null); setResults([]);
    try {
      const r = await api<{ results: Reference[] }>(`/api/research/doi?q=${encodeURIComponent(q)}`);
      if (r.results.length === 1 && /10\.\d{4,}/.test(q)) { add(r.results[0]); setQ(''); } else setResults(r.results);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const setRef = (id: string, patch: Partial<Reference>) =>
    update((d) => ({ ...d, references: d.references.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  // Если автор переименовал ключ — меняем его и во всех цитатах текста.
  const renameKey = (from: string, to: string) => {
    const key = to.replace(/[^\w:.-]/g, '');
    if (!key || key === from || doc.references.some((r) => r.id === key)) return;
    update((d) => ({
      ...d,
      references: d.references.map((r) => (r.id === from ? { ...r, id: key } : r)),
      sections: d.sections.map((s) => ({ ...s, body: s.body.replace(new RegExp(`@${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\];\\s])`, 'g'), `@${key}`) })),
    }));
    setEditing(key);
  };

  return (
    <div className="ar-refs-tab">
      <section className="rs-panel">
        <h3>{t('addSource')}</h3>
        <form className="rs-inline-form" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('doiPh')} />
          <button type="submit" className="btn btn-primary" disabled={busy}><IconSearch size={15} />{busy ? t('searching') : t('find')}</button>
        </form>
        {error && <p className="rs-error">{error}</p>}
        {results.length > 0 && (
          <ul className="ar-results">
            {results.map((r, i) => (
              <li key={i}>
                <span dangerouslySetInnerHTML={{ __html: renderMarkup(formatReference(r, doc.citationStyle)) }} />
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => { add(r); setResults((x) => x.filter((_, k) => k !== i)); }}><IconPlus size={13} />{tc('add')}</button>
              </li>
            ))}
          </ul>
        )}
        <details className="ar-bibtex">
          <summary>{t('pasteBibtex')}</summary>
          <textarea className="input rs-mono" rows={6} value={bib} onChange={(e) => setBib(e.target.value)} placeholder="@article{ivanov2021, author = {…}, title = {…}, …}" />
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
            const parsed = parseBibtex(bib);
            if (parsed.length === 0) { setError(t('bibtexFail')); return; }
            parsed.forEach(add); setBib('');
          }}>{t('addN', { n: parseBibtex(bib).length || '' }).trim()}</button>
        </details>
      </section>

      <section className="rs-panel">
        <div className="rs-panel-head">
          <h3>{t('refList', { n: doc.references.length })}</h3>
          {doc.references.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => download('refs.bib', toBibtex(doc.references))}><IconDownload size={14} />.bib</button>}
        </div>
        {doc.references.length === 0 && <p className="muted rs-small">{t('refsEmpty')}</p>}
        <ul className="ar-reflist">
          {doc.references.map((r) => (
            <li key={r.id} className={cited.includes(r.id) ? '' : 'ar-uncited'}>
              <div className="ar-ref-row">
                <code>@{r.id}</code>
                <span className="ar-ref-text" dangerouslySetInnerHTML={{ __html: renderMarkup(formatReference(r, doc.citationStyle)) }} />
                <span className="ar-ref-tools">
                  {!cited.includes(r.id) && <span className="badge">{t('notCited')}</span>}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(editing === r.id ? null : r.id)}>{t('editRef')}</button>
                  <button type="button" className="icon-btn" aria-label={tc('delete')} onClick={() => update((d) => ({ ...d, references: d.references.filter((x) => x.id !== r.id) }))}><IconTrash size={14} /></button>
                </span>
              </div>
              {editing === r.id && (
                <div className="ar-ref-edit">
                  <label className="field"><span>{t('key')}</span><input defaultValue={r.id} onBlur={(e) => renameKey(r.id, e.target.value)} /></label>
                  <label className="field"><span>{t('refAuthors')}</span>
                    <input value={r.authors.map((a) => `${a.family}, ${a.given}`).join('; ')} onChange={(e) => setRef(r.id, {
                      authors: e.target.value.split(';').map((p) => { const [family, given = ''] = p.split(','); return { family: family.trim(), given: given.trim() }; }).filter((a) => a.family),
                    })} />
                  </label>
                  <label className="field"><span>{t('refTitle')}</span><input value={r.title} onChange={(e) => setRef(r.id, { title: e.target.value })} /></label>
                  <label className="field"><span>{t('container')}</span><input value={r.container} onChange={(e) => setRef(r.id, { container: e.target.value })} /></label>
                  <div className="ar-ref-nums">
                    <label className="field"><span>{t('year')}</span><input value={r.year ?? ''} onChange={(e) => setRef(r.id, { year: Number(e.target.value) || null })} /></label>
                    <label className="field"><span>{t('volume')}</span><input value={r.volume} onChange={(e) => setRef(r.id, { volume: e.target.value })} /></label>
                    <label className="field"><span>{t('issue')}</span><input value={r.issue} onChange={(e) => setRef(r.id, { issue: e.target.value })} /></label>
                    <label className="field"><span>{t('pages')}</span><input value={r.pages} onChange={(e) => setRef(r.id, { pages: e.target.value })} /></label>
                  </div>
                  <label className="field"><span>DOI</span><input value={r.doi} onChange={(e) => setRef(r.id, { doi: e.target.value })} /></label>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { wordCount, type ArticleLang, type Author, type CitationStyle } from '@/lib/research/article';
import { IconPlus, IconSpark, IconTrash } from '@/components/icons';
import { journalLabel, JOURNALS, useArticle } from './context';
import { useT } from '@/i18n/client';
import { researchArticle } from '@/i18n/messages/research-article';

const LANGS: { key: ArticleLang; label: string }[] = [{ key: 'ru', label: 'Русский' }, { key: 'kk', label: 'Қазақша' }, { key: 'en', label: 'English' }];
const STYLES: { key: CitationStyle; label: string }[] = [
  { key: 'gost', label: 'ГОСТ Р 7.0.100' }, { key: 'apa', label: 'APA 7' }, { key: 'ieee', label: 'IEEE' }, { key: 'vancouver', label: 'Vancouver' },
];

/** Вкладка «Статья»: журнал, язык, авторы, аннотации и ключевые слова на трёх языках. */
export default function ArticleMeta() {
  const t = useT(researchArticle);
  const { doc, update, title, setTitle, ai, log } = useArticle();
  const journal = JOURNALS.find((j) => j.key === doc.journal) ?? JOURNALS[0];
  const [langs, setLangs] = useState<ArticleLang[]>(journal.langs.includes(doc.lang) ? journal.langs : [doc.lang, ...journal.langs.filter((l) => l !== doc.lang)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);

  const setAuthor = (i: number, patch: Partial<Author>) =>
    update((d) => ({ ...d, authors: d.authors.map((a, k) => (k === i ? { ...a, ...patch } : patch.corresponding ? { ...a, corresponding: false } : a)) }));

  const draftAbstract = async () => {
    setBusy(true); setError(null);
    try {
      const r = await ai<{ abstract: Partial<Record<ArticleLang, string>>; keywords: Partial<Record<ArticleLang, string>>; titles: string[] }>(
        'abstract', { langs, wordLimit: journal.abstractWords });
      update((d) => ({ ...d, abstract: { ...d.abstract, ...r.abstract }, keywords: { ...d.keywords, ...r.keywords } }));
      setTitles(r.titles);
      log({ action: 'abstract', sectionId: null, outcome: 'generated', chars: Object.values(r.abstract).join('').length });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="ar-meta">
      <section className="rs-panel">
        <h3>{t('journalStyle')}</h3>
        <div className="ar-meta-grid">
          <label className="field"><span>{t('journal')}</span>
            <select value={doc.journal} onChange={(e) => {
              const j = JOURNALS.find((x) => x.key === e.target.value)!;
              update((d) => ({ ...d, journal: j.key, citationStyle: j.style }));
              setLangs(j.langs.includes(doc.lang) ? j.langs : [doc.lang, ...j.langs]);
            }}>{JOURNALS.map((j) => <option key={j.key} value={j.key}>{journalLabel(j, t)}</option>)}</select>
          </label>
          <label className="field"><span>{t('articleLang')}</span>
            <select value={doc.lang} onChange={(e) => update((d) => ({ ...d, lang: e.target.value as ArticleLang }))}>
              {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('citeStyle')}</span>
            <select value={doc.citationStyle} onChange={(e) => update((d) => ({ ...d, citationStyle: e.target.value as CitationStyle }))}>
              {STYLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="rs-panel">
        <h3>{t('title')}</h3>
        <textarea className="input" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
        {titles.length > 0 && (
          <div className="ar-title-options">
            <span className="muted rs-small">{t('titleOptions')}</span>
            {titles.map((v) => <button key={v} type="button" className="chip" onClick={() => setTitle(v)}>{v}</button>)}
          </div>
        )}
      </section>

      <section className="rs-panel">
        <div className="rs-panel-head"><h3>{t('authors')}</h3>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => update((d) => ({ ...d, authors: [...d.authors, { name: '', affiliation: '', orcid: '', email: '', corresponding: false }] }))}><IconPlus size={14} />{t('author')}</button>
        </div>
        {doc.authors.map((a, i) => (
          <div key={i} className="ar-author">
            <input className="input" placeholder={t('namePh')} value={a.name} onChange={(e) => setAuthor(i, { name: e.target.value })} />
            <input className="input" placeholder={t('affPh')} value={a.affiliation} onChange={(e) => setAuthor(i, { affiliation: e.target.value })} />
            <input className="input" placeholder="ORCID 0000-0000-0000-0000" value={a.orcid} onChange={(e) => setAuthor(i, { orcid: e.target.value })} />
            <input className="input" placeholder="e-mail" value={a.email} onChange={(e) => setAuthor(i, { email: e.target.value })} />
            <label className="ar-corr"><input type="radio" checked={a.corresponding} onChange={() => setAuthor(i, { corresponding: true })} />{t('corresponding')}</label>
            <button type="button" className="icon-btn" aria-label={t('removeAuthor')} disabled={doc.authors.length < 2}
              onClick={() => update((d) => ({ ...d, authors: d.authors.filter((_, k) => k !== i) }))}><IconTrash size={15} /></button>
          </div>
        ))}
      </section>

      <section className="rs-panel">
        <div className="rs-panel-head">
          <h3>{t('abstractKeywords')}</h3>
          <div className="rs-row">
            {LANGS.map((l) => (
              <label key={l.key} className="ar-lang-check"><input type="checkbox" checked={langs.includes(l.key)}
                onChange={(e) => setLangs((cur) => (e.target.checked ? [...cur, l.key] : cur.filter((x) => x !== l.key)))} />{l.label}</label>
            ))}
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || langs.length === 0} onClick={draftAbstract}>
              <IconSpark size={14} />{busy ? t('writing') : t('fromText')}
            </button>
          </div>
        </div>
        <p className="muted rs-small">{t('abstractLimit', { n: journal.abstractWords })}</p>
        {error && <p className="rs-error">{error}</p>}
        {langs.map((l) => {
          const words = wordCount(doc.abstract[l] ?? '');
          return (
            <div key={l} className="ar-abstract-edit">
              <label className="field"><span>{LANGS.find((x) => x.key === l)!.label}, <span className={words > journal.abstractWords ? 'ar-over' : ''}>{t('wordsOf', { n: words, max: journal.abstractWords })}</span></span>
                <textarea rows={6} value={doc.abstract[l] ?? ''} onChange={(e) => update((d) => ({ ...d, abstract: { ...d.abstract, [l]: e.target.value } }))} />
              </label>
              <label className="field"><span>{t('keywords')}</span>
                <input value={doc.keywords[l] ?? ''} placeholder={t('keywordsPh')} onChange={(e) => update((d) => ({ ...d, keywords: { ...d.keywords, [l]: e.target.value } }))} />
              </label>
            </div>
          );
        })}
      </section>
    </div>
  );
}

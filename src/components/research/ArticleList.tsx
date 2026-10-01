'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ArticleSummary } from '@/lib/research/articles-store';
import type { ArticleKind, ArticleLang } from '@/lib/research/article';
import { IconEssay, IconPlus } from '@/components/icons';
import { api } from './shared';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchHub } from '@/i18n/messages/research-hub';

const KINDS: { key: ArticleKind; label: 'kindExperimental' | 'kindModeling' | 'kindReview' | 'kindThesis' }[] = [
  { key: 'experimental', label: 'kindExperimental' }, { key: 'modeling', label: 'kindModeling' },
  { key: 'review', label: 'kindReview' }, { key: 'thesis', label: 'kindThesis' },
];

/** Статьи раздела или проекта и создание новой: вид статьи задаёт набор разделов, язык — их названия. */
export default function ArticleList({ articles, projectId }: { articles: ArticleSummary[]; projectId?: string }) {
  const t = useT(researchHub);
  const tc = useT(common);
  const f = useFormat();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ArticleKind>('experimental');
  const [lang, setLang] = useState<ArticleLang>(useLocale());
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    try {
      const r = await api<{ article: { id: string } }>('/api/research/articles', { method: 'POST', body: { title, kind, lang, projectId: projectId ?? null } });
      router.push(`/research/articles/${r.article.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section className="rs-section">
      <div className="rs-section-head">
        <h2>{t('articles')}</h2>
        {!open && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(true)}><IconPlus size={14} />{t('newArticle')}</button>}
      </div>
      {open && (
        <form className="rs-inline-form" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('articleTitlePh')} maxLength={300} />
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as ArticleKind)} style={{ width: 'auto' }}>
            {KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
          </select>
          <select className="select" value={lang} onChange={(e) => setLang(e.target.value as ArticleLang)} style={{ width: 'auto' }}>
            <option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option>
          </select>
          <button type="submit" className="btn btn-primary">{tc('create')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{tc('cancel')}</button>
        </form>
      )}
      {error && <p className="rs-error">{error}</p>}
      {articles.length === 0 && !open ? (
        <p className="muted rs-small">{t('articlesEmpty')}{projectId ? '' : t('articlesEmptyLoose')}</p>
      ) : (
        <div className="rs-articles">
          {articles.map((a) => (
            <Link key={a.id} href={`/research/articles/${a.id}`} className="rs-article">
              <span className="rs-article-icon"><IconEssay size={18} /></span>
              <span className="rs-article-body">
                <strong>{a.title}</strong>
                <span className="muted rs-small">{t('articleMeta', { n: a.words, date: f.date(a.updatedAt, { day: 'numeric', month: 'short' }) })}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AiLogEntry, ArticleDoc } from '@/lib/research/article';
import { renderArticleHtml } from '@/lib/research/article-render';
import { renderTex } from '@/components/lms/Markup';
import { IconBack, IconCheck, IconEye, IconTrash } from '@/components/icons';
import { api, patchItem } from '../shared';
import { Ctx, type ArticleCtx, type FigureInfo } from './context';
import ArticleText from './ArticleText';
import TitleField from '../TitleField';
import ArticleMeta from './ArticleMeta';
import ArticleRefs from './ArticleRefs';
import ArticleCheck from './ArticleCheck';
import { useFormat, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchArticle } from '@/i18n/messages/research-article';
import { researchCommon } from '@/i18n/messages/research-common';

type Tab = 'text' | 'refs' | 'meta' | 'check';

/** Четыре шага работы над рукописью — в том порядке, в каком их обычно проходят. */
const TABS: { key: Tab; label: 'tabText' | 'tabRefs' | 'tabMeta' | 'tabCheck' }[] = [
  { key: 'text', label: 'tabText' },
  { key: 'refs', label: 'tabRefs' },
  { key: 'meta', label: 'tabMeta' },
  { key: 'check', label: 'tabCheck' },
];

/**
 * Редактор статьи вокруг рисунков проекта. Автор пишет; помощник предлагает правки
 * и черновики из посчитанного в проекте, автор их принимает или отклоняет — каждое
 * решение ложится в журнал, из которого собирается заявление об использовании ИИ.
 */
export default function ArticleEditor({ id, initialTitle, initialDoc, projectId, projectTitle, figures: initialFigures }: {
  id: string; initialTitle: string; initialDoc: ArticleDoc; projectId: string | null; projectTitle: string | null; figures: FigureInfo[];
}) {
  const t = useT(researchArticle);
  const tc = useT(common);
  const tr = useT(researchCommon);
  const f = useFormat();
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [doc, setDoc] = useState(initialDoc);
  const [figures, setFigures] = useState(initialFigures);
  const [tab, setTab] = useState<Tab>('text');
  const [preview, setPreview] = useState(false);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const saved = useRef(JSON.stringify({ title: initialTitle, doc: initialDoc }));
  const captionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const json = JSON.stringify({ title, doc });
    if (json === saved.current) return;
    setState('dirty');
    const timer = setTimeout(() => {
      setState('saving');
      api(`/api/research/articles/${id}`, { method: 'PATCH', body: { title, doc } })
        .then(() => { saved.current = json; setState('saved'); }, () => setState('error'));
    }, 1000);
    return () => clearTimeout(timer);
  }, [id, title, doc]);

  // Не отпускаем со страницы с несохранёнными правками.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (state !== 'saved') e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [state]);

  const update = useCallback((fn: (d: ArticleDoc) => ArticleDoc) => setDoc((d) => fn(d)), []);

  const ctx: ArticleCtx = useMemo(() => ({
    articleId: id, title, setTitle, doc, update, figures,
    setFigureCaption: (fid, caption) => {
      setFigures((fs) => fs.map((f) => (f.id === fid ? { ...f, caption } : f)));
      clearTimeout(captionTimers.current[fid]);
      // Подпись живёт у материала: в статье и на странице графика она одна.
      captionTimers.current[fid] = setTimeout(() => { patchItem(fid, { caption }).catch(() => {}); }, 800);
    },
    ai: <T,>(action: string, extra: Record<string, unknown> = {}) =>
      api<T>(`/api/research/articles/${id}/ai`, { method: 'POST', body: { action, doc, title, ...extra } }),
    aiStream: async (action, extra, onText) => {
      const res = await fetch(`/api/research/articles/${id}/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, doc, title, stream: true, ...extra }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ? f.message(data.error) : tr('httpError', { n: res.status }));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const cut = acc.indexOf('\u0000');
        onText(cut >= 0 ? acc.slice(0, cut) : acc);
      }
      const cut = acc.indexOf('\u0000');
      const final = cut >= 0 ? JSON.parse(acc.slice(cut + 1)) as { text?: string; error?: string } : { error: t('brokenReply') };
      if (final.error) throw new Error(f.message(final.error));
      return final.text ?? '';
    },
    log: (entry: Omit<AiLogEntry, 'at'>) => setDoc((d) => ({ ...d, aiLog: [...d.aiLog, { ...entry, at: new Date().toISOString() }].slice(-500) })),
  }), [id, title, doc, update, figures, f, t, tr]);

  const html = useMemo(() => (preview ? renderArticleHtml({
    title, doc, math: renderTex,
    figures: Object.fromEntries(figures.map((f) => [f.id, { title: f.title, caption: f.caption, svg: f.svg, image: f.image }])),
  }) : ''), [preview, title, doc, figures]);

  const back = projectId ? `/research/projects/${projectId}` : '/research';

  return (
    <Ctx.Provider value={ctx}>
      <div className="rs-page ar-page">
        <header className="rs-item-head">
          <Link href={back} className="btn btn-sm btn-ghost"><IconBack size={15} />{projectTitle ? t('toProject') : t('research')}</Link>
          <div className="rs-item-title">
            <span className="rs-kind">{projectTitle ? t('articleOfProject', { title: projectTitle }) : t('article')}</span>
            <TitleField value={title} onChange={setTitle} label={t('articleTitle')} maxLength={300} />
          </div>
          <span className={`rs-save rs-save-${state}`}>{state === 'saved' && <IconCheck size={13} />}{{ saved: tc('saved'), saving: tc('saving'), dirty: tc('unsaved'), error: tc('saveFailed') }[state]}</span>
          <button type="button" className={preview ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'} onClick={() => setPreview((p) => !p)}>
            <IconEye size={14} />{preview ? t('toEditor') : t('articleView')}
          </button>
          <button type="button" className="icon-btn" aria-label={t('deleteArticle')} onClick={async () => {
            if (!confirm(t('confirmDelete'))) return;
            await api(`/api/research/articles/${id}`, { method: 'DELETE' });
            router.push(back);
          }}><IconTrash size={17} /></button>
        </header>

        {preview ? (
          <article className="ar-preview" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <>
            <nav className="ar-tabs" role="tablist">
              {TABS.map((tb) => (
                <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} className={tab === tb.key ? 'ar-tab active' : 'ar-tab'} onClick={() => setTab(tb.key)}>
                  {t(tb.label)}
                  {tb.key === 'refs' && doc.references.length > 0 && <span className="ar-tab-count">{doc.references.length}</span>}
                </button>
              ))}
            </nav>
            <div className="ar-tab-body">
              {tab === 'text' && <ArticleText />}
              {tab === 'meta' && <ArticleMeta />}
              {tab === 'refs' && <ArticleRefs />}
              {tab === 'check' && <ArticleCheck />}
            </div>
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}

'use client';
import { useMemo, useState } from 'react';
import {
  aiDisclosure, checkArticle, figureOrder, toBibtex, wordCount, type ArticleLang,
} from '@/lib/research/article';
import { buildDocx } from '@/lib/research/docx';
import { buildLatexZip } from '@/lib/research/latex';
import { IconAlert, IconDownload, IconInfo } from '@/components/icons';
import { CopyButton, download, fileSafe, svgToPng } from '../shared';
import { sectionGuide, useArticle, type FigureInfo } from './context';
import { useFormat, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchArticle } from '@/i18n/messages/research-article';

const LANGS: { key: ArticleLang; label: string }[] = [{ key: 'ru', label: 'Рус' }, { key: 'kk', label: 'Қаз' }, { key: 'en', label: 'Eng' }];
const TEMPLATES = [
  { key: 'article', label: 'tplArticle' },
  { key: 'elsarticle', label: 'Elsevier (elsarticle)' },
  { key: 'ieeetran', label: 'IEEE (IEEEtran)' },
  { key: 'mdpi-like', label: 'tplMdpi' },
] as const;

/** PNG рисунка для Word/LaTeX: SVG в 3× (≈300 dpi при ширине колонки), симуляция — её превью. */
async function figurePng(f: FigureInfo): Promise<{ png: Uint8Array; widthPx: number; heightPx: number } | null> {
  if (f.svg) {
    const blob = await svgToPng(f.svg, 3);
    const w = Number(/width="(\d+)"/.exec(f.svg)?.[1] ?? 720);
    const h = Number(/height="(\d+)"/.exec(f.svg)?.[1] ?? 460);
    return { png: new Uint8Array(await blob.arrayBuffer()), widthPx: w * 3, heightPx: h * 3 };
  }
  if (f.image) {
    const res = await fetch(f.image);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob).catch(() => null);
    return { png: new Uint8Array(await blob.arrayBuffer()), widthPx: bmp?.width ?? 1280, heightPx: bmp?.height ?? 800 };
  }
  return null;
}

/** Вкладка «Проверка и экспорт»: что не так в рукописи, заявление об ИИ, файлы для журнала. */
export default function ArticleCheck() {
  const t = useT(researchArticle);
  const tc = useT(common);
  const f = useFormat();
  const { doc, figures, title } = useArticle();
  const [lang, setLang] = useState<ArticleLang>(doc.lang);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]['key']>('article');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const issues = useMemo(() => checkArticle(doc, figures.map((f) => f.id)), [doc, figures]);
  const todos = useMemo(() => doc.sections.reduce((n, s) => n + (s.body.match(/\[\[TODO:/g)?.length ?? 0), 0), [doc.sections]);
  const disclosure = aiDisclosure(doc.aiLog, lang);
  const used = doc.aiLog.filter((e) => e.outcome !== 'rejected');
  const name = fileSafe(title);

  const collectFigures = async () => {
    const used = figureOrder(doc.sections);
    const out: Record<string, { png: Uint8Array; widthPx: number; heightPx: number; title: string; caption: string; svg: string | null }> = {};
    for (const id of used) {
      const f = figures.find((x) => x.id === id);
      if (!f) continue;
      const png = await figurePng(f).catch(() => null);
      if (png) out[id] = { ...png, title: f.title, caption: f.caption, svg: f.svg };
    }
    return out;
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  return (
    <div className="ar-check">
      <section className="rs-panel">
        <h3>{t('checkTitle')}</h3>
        {issues.length === 0 && todos === 0 && <p className="rs-small">{t('noFormalIssues')}</p>}
        {todos > 0 && <p className="ar-issue ar-issue-warn"><IconAlert size={14} />{t('todosLeft', { n: todos })}</p>}
        {issues.map((it, i) => (
          <p key={i} className={`ar-issue ar-issue-${it.level}`}>{it.level === 'warn' ? <IconAlert size={14} /> : <IconInfo size={14} />}{f.message(it.text)}</p>
        ))}
        <table className="rs-table ar-stats">
          <thead><tr><th>{t('colSection')}</th><th>{t('colWords')}</th><th>{t('colCheck')}</th></tr></thead>
          <tbody>
            {doc.sections.map((s) => (
              <tr key={s.id}><td>{s.title}</td><td>{wordCount(s.body)}</td><td className="muted">{sectionGuide(s.key, t).checklist.join(' · ')}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rs-panel">
        <div className="rs-panel-head">
          <h3>{t('aiStatement')}</h3>
          <div className="segmented">{LANGS.map((l) => <button key={l.key} type="button" className={lang === l.key ? 'segmented-item active' : 'segmented-item'} onClick={() => setLang(l.key)}>{l.label}</button>)}</div>
        </div>
        <p className="muted rs-small">{t('aiStats', { a: used.filter((e) => e.outcome === 'accepted').length, g: used.filter((e) => e.outcome === 'generated').length, r: doc.aiLog.length - used.length })}</p>
        <p className="ar-disclosure">{disclosure}</p>
        <CopyButton text={disclosure} label={tc('copy')} />
      </section>

      <section className="rs-panel">
        <h3>{t('export')}</h3>
        {error && <p className="rs-error">{error}</p>}
        <div className="ar-export-grid">
          <div className="ar-export-card">
            <strong>Word (.docx)</strong>
            <span className="muted rs-small">{t('wordHint')}</span>
            <button type="button" className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => run('docx', async () => {
              const figs = await collectFigures();
              const bytes = buildDocx({ title, doc, figures: figs });
              download(`${name}.docx`, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
            })}><IconDownload size={14} />{busy === 'docx' ? t('building') : t('downloadDocx')}</button>
          </div>
          <div className="ar-export-card">
            <strong>LaTeX / Overleaf (.zip)</strong>
            <span className="muted rs-small">{t('latexHint')}</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}>{TEMPLATES.map((tp) => <option key={tp.key} value={tp.key}>{tp.label.startsWith('tpl') ? t(tp.label as 'tplArticle') : tp.label}</option>)}</select>
            <button type="button" className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => run('latex', async () => {
              const figs = await collectFigures();
              const bytes = buildLatexZip({
                title, doc,
                figures: Object.fromEntries(Object.entries(figs).map(([id, f], i) => [id, { fileBase: `fig${i + 1}`, title: f.title, caption: f.caption, png: f.png, svg: f.svg ?? undefined }])),
              }, template);
              download(`${name}-latex.zip`, new Blob([bytes as BlobPart], { type: 'application/zip' }));
            })}><IconDownload size={14} />{busy === 'latex' ? t('building') : t('downloadZip')}</button>
          </div>
          <div className="ar-export-card">
            <strong>{t('references')}</strong>
            <span className="muted rs-small">{t('bibHint')}</span>
            <button type="button" className="btn btn-sm btn-secondary" disabled={doc.references.length === 0} onClick={() => download('refs.bib', toBibtex(doc.references))}><IconDownload size={14} />refs.bib</button>
          </div>
        </div>
      </section>
    </div>
  );
}

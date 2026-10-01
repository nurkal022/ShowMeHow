'use client';
import { useMemo, useRef, useState } from 'react';
import {
  figureOrder, fullFigIds, sectionTitle, shortFigIds, uid, wordCount, type ArticleLang, type ArticleSection,
} from '@/lib/research/article';
import { wordDiff } from '@/lib/research/article-render';
import { IconArrowDown, IconArrowUp, IconCheck, IconClose, IconPlus, IconSpark, IconTrash, IconWand } from '@/components/icons';
import { sectionGuide, useArticle } from './context';
import { FiguresPanel } from './ArticleExtras';
import AutocompleteMenu, { detectTrigger, menuOptions, type MenuOption, type MenuState } from './Autocomplete';
import { caretCoords } from './caret';
import { renderArticleHtml } from '@/lib/research/article-render';
import { renderTex } from '@/components/lms/Markup';
import { useLocale, useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { researchArticle } from '@/i18n/messages/research-article';

type Suggestion = { kind: 'text'; action: string; label: string; original: string; text: string; range: [number, number] | null; streaming?: boolean }
  | { kind: 'issues'; label: string; issues: { quote: string; problem: string; suggestion?: string; candidates?: string[] }[] };

const REWRITES: { mode: string; label: 'rwAcademic' | 'rwShorter' | 'rwSimpler' | 'rwClarity' | 'rwGrammar' | 'rwExpand'; log: string }[] = [
  { mode: 'academic', label: 'rwAcademic', log: 'rewrite' },
  { mode: 'shorter', label: 'rwShorter', log: 'rewrite' },
  { mode: 'simpler', label: 'rwSimpler', log: 'rewrite' },
  { mode: 'clarity', label: 'rwClarity', log: 'rewrite' },
  { mode: 'grammar', label: 'rwGrammar', log: 'grammar' },
  { mode: 'expand', label: 'rwExpand', log: 'rewrite' },
];

const LANG_LABEL: Record<ArticleLang, string> = { ru: 'Рус', kk: 'Қаз', en: 'Eng' };

/** Вкладка «Текст»: разделы, вставка рисунков и ссылок, помощник над выделенным фрагментом. */
export default function ArticleText() {
  const t = useT(researchArticle);
  const tc = useT(common);
  const locale = useLocale();
  const { doc, update, figures, ai, aiStream, log } = useArticle();
  const [activeId, setActiveId] = useState(doc.sections[0]?.id ?? '');
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [side, setSide] = useState<'assist' | 'figures' | 'preview'>('assist');
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Отмена последней принятой правки ИИ: прежний текст раздела живёт несколько секунд.
  const [undo, setUndo] = useState<{ sectionId: string; body: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [translateTo, setTranslateTo] = useState<ArticleLang>(doc.lang === 'en' ? 'ru' : 'en');
  const area = useRef<HTMLTextAreaElement>(null);
  const section = doc.sections.find((s) => s.id === activeId) ?? doc.sections[0];
  const order = useMemo(() => figureOrder(doc.sections), [doc.sections]);

  const setSection = (patch: Partial<ArticleSection>) =>
    update((d) => ({ ...d, sections: d.sections.map((s) => (s.id === section.id ? { ...s, ...patch } : s)) }));
  // Текст в редакторе — с короткими ссылками на рисунки; в документ уходит с полными.
  const figIds = useMemo(() => figures.map((f) => f.id), [figures]);
  const toShort = (s: string) => shortFigIds(s, figIds);
  const toFull = (s: string) => fullFigIds(s, figIds);
  const body = toShort(section.body);
  const setBody = (s: string) => setSection({ body: toFull(s) });

  const selected = () => {
    const [a, b] = sel;
    return b > a ? body.slice(a, b) : '';
  };

  /** Вставка в позицию курсора с отступами строк для блоков. */
  const insert = (raw: string, asBlock = false) => {
    const text = toShort(raw);
    const el = area.current;
    const pos = el ? el.selectionEnd : body.length;
    const before = body.slice(0, pos);
    const after = body.slice(pos);
    const chunk = asBlock ? `${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}${text}\n\n` : text;
    setBody(before + chunk + after);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + chunk.length, pos + chunk.length); });
  };

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(key); setError(null);
    try { return await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; } finally { setBusy(null); }
  }

  /** Подсказка открывается сразу и наполняется по мере генерации; в конце — очищенный сервером текст. */
  const streamInto = async (key: string, action: string, extra: Record<string, unknown>, meta: { action: string; label: string; original: string; range: [number, number] | null }) => {
    setBusy(key); setError(null);
    setSuggestion({ kind: 'text', ...meta, text: '', streaming: true });
    try {
      const payload = typeof extra.text === 'string' ? { ...extra, text: toFull(extra.text) } : extra;
      const text = toShort(await aiStream(action, payload, (chunk) => setSuggestion((s) => (s && s.kind === 'text' && s.streaming ? { ...s, text: toShort(chunk) } : s))));
      setSuggestion((s) => (s && s.kind === 'text' ? { ...s, text, streaming: false } : s));
    } catch (e) {
      setSuggestion(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const fragment = () => {
    const s = selected();
    return s ? { text: s, range: sel as [number, number] } : { text: body, range: null };
  };

  const doRewrite = async (mode: string, label: string, logAction: string) => {
    const f = fragment();
    if (!f.text.trim()) { setError(t('emptySection')); return; }
    await streamInto(mode, 'rewrite', { mode, text: f.text }, { action: logAction, label, original: f.text, range: f.range });
  };

  const doTranslate = async () => {
    const f = fragment();
    if (!f.text.trim()) return;
    await streamInto('translate', 'translate', { text: f.text, lang: translateTo }, { action: 'translate', label: t('translateTo', { lang: LANG_LABEL[translateTo] }), original: f.text, range: f.range });
  };

  const doDraft = async () => {
    await streamInto('draft', 'draft', { sectionId: section.id }, { action: 'draft', label: t('sectionDraft'), original: body, range: null });
  };

  const doIssues = async (action: 'logic' | 'cite') => {
    const f = fragment();
    if (!f.text.trim()) return;
    if (action === 'logic') {
      const r = await run('logic', () => ai<{ issues: { quote: string; problem: string; suggestion: string }[] }>('logic', { text: f.text }));
      if (r) { setSuggestion({ kind: 'issues', label: t('logicTitle'), issues: r.issues }); log({ action: 'review', sectionId: section.id, outcome: 'generated', chars: 0 }); }
    } else {
      const r = await run('cite', () => ai<{ claims: { quote: string; why: string; candidates: string[] }[] }>('cite', { text: f.text }));
      if (r) setSuggestion({ kind: 'issues', label: t('citeTitle'), issues: r.claims.map((c) => ({ quote: c.quote, problem: c.why, candidates: c.candidates })) });
    }
  };

  const accept = (mode: 'replace' | 'after') => {
    if (!suggestion || suggestion.kind !== 'text') return;
    const s = suggestion;
    let next = body;
    if (s.range && body.slice(s.range[0], s.range[1]) === s.original) {
      next = mode === 'replace' ? body.slice(0, s.range[0]) + s.text + body.slice(s.range[1]) : body.slice(0, s.range[1]) + '\n\n' + s.text + body.slice(s.range[1]);
    } else if (!s.range) {
      next = mode === 'replace' ? s.text : `${body.trimEnd()}\n\n${s.text}`;
    } else {
      // Текст успели поменять — не затираем правки автора, дописываем в конец.
      next = `${body.trimEnd()}\n\n${s.text}`;
    }
    if (undo) clearTimeout(undo.timer);
    const prev = section.body;
    setUndo({ sectionId: section.id, body: prev, timer: setTimeout(() => setUndo(null), 9000) });
    setBody(next);
    log({ action: s.action, sectionId: section.id, outcome: s.action === 'draft' ? 'generated' : 'accepted', chars: s.text.length });
    setSuggestion(null);
  };

  const reject = () => {
    if (suggestion?.kind === 'text') log({ action: suggestion.action, sectionId: section.id, outcome: 'rejected', chars: 0 });
    setSuggestion(null);
  };

  const findQuote = (quote: string) => {
    const i = body.indexOf(quote.slice(0, 60));
    if (i < 0 || !area.current) return;
    area.current.focus();
    area.current.setSelectionRange(i, i + quote.length);
    setSel([i, i + quote.length]);
  };

  const move = (id: string, dir: -1 | 1) => update((d) => {
    const i = d.sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= d.sections.length) return d;
    const next = [...d.sections];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...d, sections: next };
  });

  const addSection = (key: ArticleSection['key']) => {
    const s: ArticleSection = { id: uid(), key, title: key === 'custom' ? t('newSection') : sectionTitle(key, doc.lang), body: '' };
    update((d) => ({ ...d, sections: [...d.sections, s] }));
    setActiveId(s.id);
  };

  /* ----------------------------- автодополнение ----------------------------- */
  const options = menu ? menuOptions(menu.kind, menu.query, doc.references, figures, order, locale) : [];

  const updateMenu = (el: HTMLTextAreaElement) => {
    const pos = el.selectionEnd;
    const trig = detectTrigger(el.value.slice(0, pos));
    if (!trig) { setMenu(null); return; }
    const c = caretCoords(el, pos);
    setMenu((m) => ({ ...trig, top: c.top + c.height + 4, left: Math.min(c.left, el.clientWidth - 300), index: m && m.kind === trig.kind ? Math.min(m.index, 20) : 0 }));
  };

  const choose = (o: MenuOption) => {
    const el = area.current;
    if (!menu || !el) return;
    const pos = el.selectionEnd;
    if (o.next) {
      // Команда открывает второе меню: заменяем «/запрос» на пусто и показываем список рисунков или источников.
      setBody(body.slice(0, menu.start) + body.slice(pos));
      const c = caretCoords(el, menu.start);
      setMenu({ kind: o.next, start: menu.start, query: '', top: c.top + c.height + 4, left: Math.min(c.left, el.clientWidth - 300), index: 0 });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(menu.start, menu.start); });
      return;
    }
    const text = toShort(o.insert ?? '');
    setBody(body.slice(0, menu.start) + text + body.slice(pos));
    setMenu(null);
    const at = menu.start + text.length - (o.cursorBack ?? 0);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at, at); });
  };

  const onBodyKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!menu) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMenu({ ...menu, index: (menu.index + 1) % Math.max(options.length, 1) }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMenu({ ...menu, index: (menu.index - 1 + options.length) % Math.max(options.length, 1) }); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && options[menu.index]) { e.preventDefault(); choose(options[menu.index]); }
    else if (e.key === 'Escape') { e.preventDefault(); setMenu(null); }
  };

  const preview = useMemo(() => (side === 'preview' ? renderArticleHtml({
    title: '', doc, math: renderTex, onlySection: section.id,
    figures: Object.fromEntries(figures.map((f) => [f.id, { title: f.title, caption: f.caption, svg: f.svg, image: f.image }])),
  }) : ''), [side, doc, section.id, figures]);

  const guide = sectionGuide(section.key, t);
  const fromData = section.key === 'methods' || section.key === 'results';
  const hasSel = sel[1] > sel[0];

  return (
    <div className={side === 'preview' ? 'ar-text ar-text-wide' : 'ar-text'}>
      <nav className="ar-outline" aria-label={t('sections')}>
        {doc.sections.map((s, i) => (
          <div key={s.id} className={s.id === section.id ? 'ar-outline-item active' : 'ar-outline-item'}>
            <button type="button" className="ar-outline-main" onClick={() => { setActiveId(s.id); setSuggestion(null); setSel([0, 0]); }}>
              <span className="ar-outline-n">{i + 1}</span>
              <span className="ar-outline-title">{s.title}</span>
              <span className="ar-outline-count">{wordCount(s.body) || '—'}</span>
            </button>
            <span className="ar-outline-tools">
              <button type="button" className="icon-btn" aria-label={t('up')} onClick={() => move(s.id, -1)}><IconArrowUp size={13} /></button>
              <button type="button" className="icon-btn" aria-label={t('down')} onClick={() => move(s.id, 1)}><IconArrowDown size={13} /></button>
            </span>
          </div>
        ))}
        <select className="ar-add-section" value="" onChange={(e) => { if (e.target.value) addSection(e.target.value as ArticleSection['key']); }}>
          <option value="">{t('addSection')}</option>
          {(['introduction', 'methods', 'results', 'discussion', 'conclusion', 'acknowledgements', 'custom'] as const).map((k) => (
            <option key={k} value={k}>{k === 'custom' ? t('customSection') : sectionTitle(k, doc.lang)}</option>
          ))}
        </select>
        <p className="muted rs-small ar-total">{t('totalWords', { n: doc.sections.reduce((n, s) => n + wordCount(s.body), 0) })}</p>
      </nav>

      <div className="ar-editor">
        <div className="ar-section-head">
          <input className="ar-section-title" value={section.title} onChange={(e) => setSection({ title: e.target.value })} aria-label={t('sectionTitle')} />
          <button type="button" className="icon-btn" aria-label={t('deleteSection')} title={t('deleteSection')} disabled={doc.sections.length < 2} onClick={() => {
            if (section.body.trim() && !confirm(t('confirmDeleteSection', { title: section.title }))) return;
            update((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== section.id) }));
            setActiveId(doc.sections.find((s) => s.id !== section.id)?.id ?? '');
          }}><IconTrash size={16} /></button>
        </div>
        <p className="ar-guide">{guide.hint}</p>

        <div className="ar-toolbar">
          <select value="" onChange={(e) => { if (e.target.value) insert(`[@${e.target.value}]`); }} aria-label={t('citation')}>
            <option value="">{t('citationPick')}</option>
            {doc.references.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title.slice(0, 60)}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => insert('$$ E = mc^2 $$', true)}>{t('formula')}</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => insert('[[TODO: ]]')}>TODO</button>
        </div>

        <div className="ar-body-wrap">
        {menu && <AutocompleteMenu menu={menu} options={options} onChoose={choose} />}
        <textarea ref={area} className="input ar-body" value={body} spellCheck
          onChange={(e) => { setBody(e.target.value); updateMenu(e.currentTarget); }}
          onKeyDown={onBodyKey}
          onBlur={() => setMenu(null)}
          onSelect={(e) => setSel([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
          placeholder={t('bodyPh')} />
        </div>

        <div className="ar-notes">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNotesOpen((o) => !o)}>
            {notesOpen ? t('hideNotes') : doc.notes[section.id]?.trim() ? t('notesForAssistantDone') : t('notesForAssistant')}
          </button>
          {notesOpen && (
            <textarea className="input" rows={4} value={doc.notes[section.id] ?? ''}
              onChange={(e) => update((d) => ({ ...d, notes: { ...d.notes, [section.id]: e.target.value } }))}
              placeholder={t('notesPh')} />
          )}
        </div>
        {undo && (
          <div className="ar-undo" role="status">
            <IconCheck size={14} />{t('accepted')}
            <button type="button" onClick={() => {
              update((d) => ({ ...d, sections: d.sections.map((x) => (x.id === undo.sectionId ? { ...x, body: undo.body } : x)) }));
              clearTimeout(undo.timer);
              setUndo(null);
            }}>{t('undo')}</button>
          </div>
        )}
        <ul className="ar-checklist">
          {guide.checklist.map((c) => <li key={c}><IconCheck size={12} />{c}</li>)}
        </ul>
      </div>

      <aside className="ar-assist">
        <div className="segmented ar-side-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={side === 'assist'} className={side === 'assist' ? 'segmented-item active' : 'segmented-item'} onClick={() => setSide('assist')}><IconWand size={14} />{t('assistant')}</button>
          <button type="button" role="tab" aria-selected={side === 'figures'} className={side === 'figures' ? 'segmented-item active' : 'segmented-item'} onClick={() => setSide('figures')}>{t('figuresN', { n: figures.length })}</button>
          <button type="button" role="tab" aria-selected={side === 'preview'} className={side === 'preview' ? 'segmented-item active' : 'segmented-item'} onClick={() => setSide('preview')}>{t('view')}</button>
        </div>
        {side === 'figures' && <FiguresPanel onInsert={insert} />}
        {side === 'preview' && <article className="ar-preview ar-preview-side" dangerouslySetInnerHTML={{ __html: preview }} />}
        {side === 'assist' && <>
        <section className="rs-panel">
          <p className="muted rs-small">{hasSel ? t('selectedN', { n: sel[1] - sel[0] }) : t('nothingSelected')}</p>
          <button type="button" className="btn btn-primary btn-sm ar-draft-btn" disabled={!!busy} onClick={doDraft}>
            <IconSpark size={14} />{busy === 'draft' ? t('writing') : fromData ? t('draftFromData') : section.body.trim() ? t('improveByNotes') : t('draftByNotes')}
          </button>
          <div className="ar-actions">
            {REWRITES.map((r) => (
              <button key={r.mode} type="button" className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => doRewrite(r.mode, t(r.label), r.log)}>
                {busy === r.mode ? '…' : t(r.label)}
              </button>
            ))}
          </div>
          <div className="ar-translate">
            <button type="button" className="btn btn-sm btn-secondary" disabled={!!busy} onClick={doTranslate}>{busy === 'translate' ? t('translating') : t('translateBtn')}</button>
            <div className="segmented">
              {(['ru', 'kk', 'en'] as const).map((l) => (
                <button key={l} type="button" className={translateTo === l ? 'segmented-item active' : 'segmented-item'} onClick={() => setTranslateTo(l)}>{LANG_LABEL[l]}</button>
              ))}
            </div>
          </div>
          <details className="rs-more">
            <summary>{t('moreChecks')}</summary>
            <div className="ar-actions">
              <button type="button" className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => doIssues('logic')}>{busy === 'logic' ? '…' : t('checkLogic')}</button>
              <button type="button" className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => doIssues('cite')}>{busy === 'cite' ? '…' : t('citeTitle')}</button>
            </div>
          </details>
          {error && <p className="rs-error">{error}</p>}
        </section>

        {suggestion?.kind === 'text' && (
          <section className="rs-panel ar-suggestion">
            <div className="rs-panel-head"><h3>{suggestion.label}</h3><button type="button" className="icon-btn" aria-label={tc('close')} onClick={reject}><IconClose size={15} /></button></div>
            <div className="ar-diff">
              {suggestion.streaming
                ? <span className="ar-stream">{suggestion.text || t('thinking')}<i className="ar-caret" /></span>
                : (suggestion.original && suggestion.action !== 'translate' ? wordDiff(suggestion.original, suggestion.text) : [{ kind: 'add' as const, text: suggestion.text }])
                  .map((p, i) => <span key={i} className={`ar-diff-${p.kind}`}>{p.text}</span>)}
            </div>
            {/\[\[TODO:/.test(suggestion.text) && <p className="muted rs-small">{t('todoHint')}</p>}
            <div className="rs-row" hidden={suggestion.streaming}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => accept('replace')}><IconCheck size={14} />{suggestion.range || suggestion.action !== 'draft' ? t('replace') : t('insert')}</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => accept('after')}><IconPlus size={14} />{t('addAfter')}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={reject}>{t('reject')}</button>
            </div>
          </section>
        )}
        {suggestion?.kind === 'issues' && (
          <section className="rs-panel ar-suggestion">
            <div className="rs-panel-head"><h3>{suggestion.label}</h3><button type="button" className="icon-btn" aria-label={tc('close')} onClick={() => setSuggestion(null)}><IconClose size={15} /></button></div>
            {suggestion.issues.length === 0 && <p className="muted rs-small">{t('noIssues')}</p>}
            <ol className="ar-issues">
              {suggestion.issues.map((it, i) => (
                <li key={i}>
                  <button type="button" className="ar-quote" onClick={() => findQuote(it.quote)} title={t('showInText')}>«{it.quote}»</button>
                  <p>{it.problem}</p>
                  {it.suggestion && <p className="muted">→ {it.suggestion}</p>}
                  {it.candidates && it.candidates.length > 0 && (
                    <div className="rs-row">{it.candidates.map((k) => (
                      <button key={k} type="button" className="chip" onClick={() => {
                        const idx = body.indexOf(it.quote);
                        if (idx >= 0) {
                          const end = idx + it.quote.length;
                          setBody(`${body.slice(0, end)} [@${k}]${body.slice(end)}`);
                        }
                      }}>+ [@{k}]</button>
                    ))}</div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
        </>}
      </aside>
    </div>
  );
}

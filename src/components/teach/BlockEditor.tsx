'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Block } from '@/lib/lms/blocks';
import {
  CALLOUT_TONES, CALLOUT_TONE_LABELS, MEDIA_LIMITS, newOptionId, parseGaps, videoEmbed,
  type AssignmentPayload, type AssignmentType, type CalloutPayload, type CodePayload, type FormulaPayload,
  type ImagePayload, type LabPayload, type SimulationPayload, type SpoilerPayload, type TextPayload, type VideoPayload,
} from '@/lib/lms/block-schema';
import { LIMITS } from '@/lib/lms/types';
import { LABS, labUrl } from '@/lib/labs';
import { generateForBlockHref } from '@/lib/lms/links';
import Markup, { Tex } from '@/components/lms/Markup';
import { CalloutBlock, VideoBlock } from '@/components/lms/ContentBlocks';
import { IconArrowDown, IconArrowUp, IconCheck, IconLibrary, IconPlus, IconTrash, IconUpload, IconWand } from '@/components/icons';
import { ASSIGNMENT_META, ASSIGNMENT_TYPES } from './block-meta';
import SimulationPicker from './SimulationPicker';
import SimStateEditor from './SimStateEditor';
import {
  fromAssignmentForm, markCorrect, toAssignmentForm, validateAssignmentForm,
  type AssignmentErrors, type AssignmentForm,
} from './assignment-form';

/** keepOpen — автосохранение: карточка остаётся открытой и страница не перечитывается. */
export type Save = (payload: unknown, opts?: { keepOpen?: boolean }) => Promise<boolean>;

interface Props {
  block: Block;
  simulationTitle: string | null;
  onSave: Save;
  onCancel: () => void;
  /** Карточка показывает «есть несохранённые правки» и спрашивает перед закрытием. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Отказ сервера при сохранении — встаёт над кнопками формы. */
  error?: string;
  /** Тип задания, выбранный в меню вставки: форма открывается сразу на нём. */
  initialType?: AssignmentType;
}

interface Shared { onSave: Save; onCancel: () => void; onDirtyChange?: (dirty: boolean) => void; error?: string }

export default function BlockEditor({ block, simulationTitle, initialType, ...shared }: Props) {
  const body = block.body;
  switch (body.kind) {
    case 'text':
      return <TextEditor payload={body.payload} {...shared} />;
    case 'callout':
      return <CalloutEditor payload={body.payload} {...shared} />;
    case 'formula':
      return <FormulaEditor payload={body.payload} {...shared} />;
    case 'image':
      return <ImageEditor payload={body.payload} {...shared} />;
    case 'video':
      return <VideoEditor payload={body.payload} {...shared} />;
    case 'spoiler':
      return <SpoilerEditor payload={body.payload} {...shared} />;
    case 'code':
      return <CodeEditor payload={body.payload} {...shared} />;
    case 'divider':
      return <p className="muted">У разделителя нет настроек — это просто черта между частями урока.</p>;
    case 'simulation':
      return <SimulationEditor blockId={block.id} payload={body.payload} title={simulationTitle} {...shared} />;
    case 'lab':
      return <LabEditor payload={body.payload} {...shared} />;
    case 'assignment':
      return <AssignmentEditor blockId={block.id} payload={body.payload} standTitle={simulationTitle} initialType={initialType} {...shared} />;
  }
}

/** Снимок формы на момент открытия: с ним сравнивается текущее состояние. */
function useDirty(value: unknown, onDirtyChange?: (dirty: boolean) => void): boolean {
  const initial = useRef(JSON.stringify(value));
  const dirty = JSON.stringify(value) !== initial.current;
  const notify = useRef(onDirtyChange);
  notify.current = onDirtyChange;
  useEffect(() => { notify.current?.(dirty); }, [dirty]);
  useEffect(() => () => notify.current?.(false), []);
  return dirty;
}

type AutoState = 'idle' | 'saving' | 'saved' | 'error';
const AUTOSAVE_DELAY = 1100;

/**
 * Автосохранение блоков-материалов: через секунду после последней правки содержимое уходит
 * на сервер, карточка остаётся открытой. У заданий его нет — там правка меняет ключ ответов.
 */
function useAutosave(value: unknown, onSave: Save, onDirtyChange?: (dirty: boolean) => void) {
  const json = JSON.stringify(value);
  const saved = useRef(json);
  const latest = useRef({ json, value, onSave });
  latest.current = { json, value, onSave };
  const [state, setState] = useState<AutoState>('idle');
  const [, bump] = useState(0);
  const dirty = json !== saved.current;
  const notify = useRef(onDirtyChange);
  notify.current = onDirtyChange;
  useEffect(() => { notify.current?.(dirty); }, [dirty]);
  useEffect(() => () => notify.current?.(false), []);

  async function flush(keepOpen: boolean): Promise<boolean> {
    const sending = latest.current.json;
    if (sending === saved.current) return true;
    setState('saving');
    const ok = await latest.current.onSave(latest.current.value, { keepOpen });
    if (ok) saved.current = sending;
    setState(ok ? 'saved' : 'error');
    bump((n) => n + 1);
    return ok;
  }

  useEffect(() => {
    if (json === saved.current) return;
    const timer = setTimeout(() => { void flush(true); }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
    // flush читает всё через ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json]);

  return { state, dirty, flush };
}

/** Рамка редактора с автосохранением: вместо «Сохранить блок» — состояние и «Готово». */
function AutoForm({ auto, onCancel, error, children }: {
  auto: ReturnType<typeof useAutosave>; onCancel: () => void; error?: string; children: React.ReactNode;
}) {
  return (
    <form className="cf-block-form" noValidate
      onSubmit={async (e) => { e.preventDefault(); if (await auto.flush(false)) onCancel(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.requestSubmit(); } }}>
      {children}
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="cf-form-foot">
        <button type="submit" className="btn btn-primary" disabled={auto.state === 'saving'}>Готово</button>
        <span className={`cf-autosave ${auto.state}`} role="status" aria-live="polite">
          {auto.state === 'saving' && 'Сохраняю…'}
          {auto.state === 'saved' && !auto.dirty && <><IconCheck size={14} />Сохранено</>}
          {auto.state === 'error' && 'Не сохранилось — проверьте поля'}
          {auto.state !== 'saving' && auto.dirty && auto.state !== 'error' && 'Есть правки…'}
        </span>
        <span className="muted cf-form-hint">Сохраняется само · Ctrl + Enter — готово</span>
      </div>
    </form>
  );
}

function EditorForm({ dirty, validate, onSubmit, onCancel, error, children }: {
  dirty: boolean;
  /** Возвращает true, если форму можно отправлять; иначе сама показывает ошибки у полей. */
  validate?: () => boolean;
  onSubmit: () => Promise<boolean>;
  onCancel: () => void;
  error?: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  async function submit() {
    if (busy) return;
    if (validate && !validate()) {
      // Фокус — на первое поле с ошибкой, чтобы не искать его глазами.
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    await onSubmit();
    setBusy(false);
  }

  return (
    <form ref={form} className="cf-block-form" noValidate
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}>
      {children}
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="cf-form-foot">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить блок'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>{dirty ? 'Отменить правки' : 'Свернуть'}</button>
        <span className="muted cf-form-hint">Ctrl + Enter — сохранить</span>
      </div>
    </form>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return <span id={id} className="cf-field-error" role="alert">{text}</span>;
}

/* --------------------------------- текст -------------------------------- */

type Wrap = { before: string; after: string; placeholder: string } | { linePrefix: string };
const MARKS: { key: string; label: string; title: string; hot?: string; wrap: Wrap }[] = [
  { key: 'b', label: 'Ж', title: 'Жирный (Ctrl+B)', hot: 'b', wrap: { before: '**', after: '**', placeholder: 'важное' } },
  { key: 'i', label: 'К', title: 'Курсив (Ctrl+I)', hot: 'i', wrap: { before: '*', after: '*', placeholder: 'термин' } },
  { key: 'h', label: 'Заголовок', title: 'Заголовок раздела', wrap: { linePrefix: '## ' } },
  { key: 'l', label: 'Список', title: 'Пункт списка', wrap: { linePrefix: '- ' } },
  { key: 'a', label: 'Ссылка', title: 'Ссылка (Ctrl+K)', hot: 'k', wrap: { before: '[', after: '](https://)', placeholder: 'текст ссылки' } },
  { key: 'f', label: 'ƒ(x)', title: 'Формула в строке (Ctrl+M)', hot: 'm', wrap: { before: '$', after: '$', placeholder: 'T = 2\\pi\\sqrt{L/g}' } },
];

/** Поле с разметкой и живым предпросмотром рядом: учитель сразу видит то, что увидит ученик. */
function RichField({ label, value, onChange, rows = 10, placeholder, max = LIMITS.text, preview }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; max?: number;
  preview?: (text: string) => React.ReactNode;
}) {
  const area = useRef<HTMLTextAreaElement>(null);

  function applyMark(wrap: Wrap) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: from, selectionEnd: to } = el;
    let next: string;
    let caret: [number, number];
    if ('linePrefix' in wrap) {
      const lineStart = value.lastIndexOf('\n', from - 1) + 1;
      next = value.slice(0, lineStart) + wrap.linePrefix + value.slice(lineStart);
      caret = [from + wrap.linePrefix.length, to + wrap.linePrefix.length];
    } else {
      const picked = value.slice(from, to) || wrap.placeholder;
      next = value.slice(0, from) + wrap.before + picked + wrap.after + value.slice(to);
      caret = [from + wrap.before.length, from + wrap.before.length + picked.length];
    }
    onChange(next.slice(0, max));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret[0], caret[1]); });
  }

  return (
    <div className="cf-rich">
      <div className="cf-rich-head">
        <span className="label">{label}</span>
        <div className="cf-marks" role="toolbar" aria-label="Разметка текста">
          {MARKS.map((m) => (
            <button key={m.key} type="button" className={`cf-mark cf-mark-${m.key}`} title={m.title} aria-label={m.title}
              onClick={() => applyMark(m.wrap)}>{m.label}</button>
          ))}
        </div>
      </div>
      <div className="cf-rich-panes">
        <textarea ref={area} className="input cf-textarea" rows={rows} value={value} maxLength={max} aria-label={label}
          placeholder={placeholder ?? 'Пустая строка начинает новый абзац. Формула в строке — $E = mc^2$, отдельной строкой — $$…$$'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (!(e.metaKey || e.ctrlKey) || e.key === 'Enter') return;
            const mark = MARKS.find((m) => m.hot === e.key.toLowerCase());
            if (mark) { e.preventDefault(); applyMark(mark.wrap); }
          }} />
        <div className="cf-preview" aria-label="Как увидит ученик">
          <span className="cf-preview-tag">как увидит ученик</span>
          {value.trim() ? (preview ? preview(value) : <Markup text={value} />) : <p className="muted">Здесь появится текст.</p>}
        </div>
      </div>
    </div>
  );
}

function TextEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: TextPayload } & Shared) {
  const [title, setTitle] = useState(payload.title);
  const [body, setBody] = useState(payload.body);
  const auto = useAutosave({ title, body }, onSave, onDirtyChange);
  return (
    <AutoForm auto={auto} error={error} onCancel={onCancel}>
      <label className="field"><span>Заголовок (необязательно)</span>
        <input value={title} maxLength={LIMITS.title} placeholder="Например, «Что такое период колебаний»"
          onChange={(e) => setTitle(e.target.value)} />
      </label>
      <RichField label="Текст" value={body} onChange={setBody} />
    </AutoForm>
  );
}

/* --------------------------- блоки-материалы ---------------------------- */

function CalloutEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: CalloutPayload } & Shared) {
  const [v, setV] = useState(payload);
  const auto = useAutosave(v, onSave, onDirtyChange);
  return (
    <AutoForm auto={auto} error={error} onCancel={onCancel}>
      <div className="cf-tone-row" role="radiogroup" aria-label="Вид врезки">
        {CALLOUT_TONES.map((tone) => (
          <button key={tone} type="button" role="radio" aria-checked={v.tone === tone}
            className={`cf-tone tone-${tone}${v.tone === tone ? ' active' : ''}`} onClick={() => setV({ ...v, tone })}>
            {CALLOUT_TONE_LABELS[tone]}
          </button>
        ))}
      </div>
      <label className="field"><span>Заголовок (необязательно)</span>
        <input value={v.title} maxLength={LIMITS.title} placeholder={CALLOUT_TONE_LABELS[v.tone]}
          onChange={(e) => setV({ ...v, title: e.target.value })} />
      </label>
      <RichField label="Текст врезки" rows={5} value={v.body} onChange={(body) => setV({ ...v, body })}
        preview={(body) => <CalloutBlock payload={{ ...v, body }} />} />
    </AutoForm>
  );
}

const TEX_SNIPPETS: [string, string][] = [
  ['a/b', '\\frac{a}{b}'], ['√', '\\sqrt{x}'], ['x²', 'x^{2}'], ['xₙ', 'x_{n}'], ['π', '\\pi'], ['Δ', '\\Delta'],
  ['α', '\\alpha'], ['ω', '\\omega'], ['·', '\\cdot'], ['≈', '\\approx'], ['≤', '\\le'], ['→', '\\to'],
  ['∑', '\\sum_{i=1}^{n}'], ['∫', '\\int_{a}^{b}'], ['вектор', '\\vec{F}'],
];

function FormulaEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: FormulaPayload } & Shared) {
  const [v, setV] = useState(payload);
  const area = useRef<HTMLTextAreaElement>(null);
  const auto = useAutosave(v, onSave, onDirtyChange);
  function insert(tex: string) {
    const el = area.current;
    const at = el ? el.selectionStart : v.latex.length;
    const end = el ? el.selectionEnd : at;
    setV({ ...v, latex: (v.latex.slice(0, at) + tex + v.latex.slice(end)).slice(0, MEDIA_LIMITS.latex) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + tex.length, at + tex.length); });
  }
  return (
    <AutoForm auto={auto} error={error} onCancel={onCancel}>
      <div className="cf-formula-preview" aria-label="Как увидит ученик">
        {v.latex.trim() ? <Tex tex={v.latex} /> : <span className="muted">Формула появится здесь</span>}
      </div>
      <div className="cf-snippets" role="toolbar" aria-label="Вставить обозначение">
        {TEX_SNIPPETS.map(([label, tex]) => (
          <button key={tex} type="button" className="cf-mark" title={tex} onClick={() => insert(tex)}>{label}</button>
        ))}
      </div>
      <label className="field"><span>Формула в LaTeX</span>
        <textarea ref={area} className="input cf-textarea cf-mono" rows={3} value={v.latex} maxLength={MEDIA_LIMITS.latex}
          placeholder="T = 2\\pi\\sqrt{\\frac{L}{g}}" spellCheck={false} onChange={(e) => setV({ ...v, latex: e.target.value })} />
      </label>
      <label className="field"><span>Подпись (необязательно)</span>
        <input value={v.caption} maxLength={LIMITS.caption} placeholder="Период малых колебаний маятника"
          onChange={(e) => setV({ ...v, caption: e.target.value })} />
      </label>
    </AutoForm>
  );
}

function ImageEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: ImagePayload } & Shared) {
  const [v, setV] = useState(payload);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [over, setOver] = useState(false);
  const [link, setLink] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const auto = useAutosave(v, onSave, onDirtyChange);

  async function upload(f: File | null | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setProblem('Это не картинка. Подходят PNG, JPEG, WebP и GIF.');
    setBusy(true);
    setProblem('');
    try {
      const res = await fetch('/api/lms/assets', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
      const data = await res.json().catch(() => null) as { src?: string; error?: string } | null;
      if (!res.ok || !data?.src) setProblem(data?.error ?? 'Не получилось загрузить картинку.');
      else setV((prev) => ({ ...prev, src: data.src as string }));
    } catch {
      setProblem('Сеть недоступна. Попробуйте ещё раз.');
    }
    setBusy(false);
  }

  return (
    <AutoForm auto={auto} error={error} onCancel={onCancel}>
      {v.src ? (
        <div className="cf-image-chosen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.src} alt="" />
          <div className="cf-inline">
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>Заменить</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setV({ ...v, src: '' })}>Убрать</button>
          </div>
        </div>
      ) : (
        <div className={over ? 'cf-drop over' : 'cf-drop'} tabIndex={0} role="button" aria-label="Загрузить картинку"
          onClick={() => file.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]); }}
          onPaste={(e) => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); void upload(f); } }}>
          <IconUpload size={22} />
          <strong>{busy ? 'Загружаю…' : 'Перетащите картинку сюда'}</strong>
          <span className="muted">или нажмите, чтобы выбрать файл · Ctrl+V вставит из буфера · до 4 МБ</span>
        </div>
      )}
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
        onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      {!v.src && (
        <div className="cf-inline cf-link-row">
          <input className="input" value={link} placeholder="…или ссылка https://" aria-label="Ссылка на картинку"
            onChange={(e) => setLink(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!/^https:\/\/\S+$/.test(link.trim())}
            onClick={() => { setV({ ...v, src: link.trim() }); setLink(''); }}>Вставить</button>
        </div>
      )}
      {problem && <p className="error-box" role="alert">{problem}</p>}
      <div className="form-grid cf-grid-top">
        <label className="field"><span>Подпись под картинкой</span>
          <input value={v.caption} maxLength={LIMITS.caption} onChange={(e) => setV({ ...v, caption: e.target.value })} />
        </label>
        <label className="field"><span>Описание для незрячих</span>
          <input value={v.alt} maxLength={LIMITS.caption} placeholder="Что изображено" onChange={(e) => setV({ ...v, alt: e.target.value })} />
        </label>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={v.wide} onChange={(e) => setV({ ...v, wide: e.target.checked })} />
        Во всю ширину урока
      </label>
    </AutoForm>
  );
}

function VideoEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: VideoPayload } & Shared) {
  const [v, setV] = useState(payload);
  const ok = !v.url.trim() || videoEmbed(v.url) !== null;
  // Неподдерживаемую ссылку на сервер не шлём: он ответит отказом на каждое нажатие клавиши.
  const auto = useAutosave(ok ? v : { ...v, url: payload.url }, onSave, onDirtyChange);
  return (
    <AutoForm auto={auto} error={error} onCancel={onCancel}>
      <label className="field"><span>Ссылка на видео</span>
        <input value={v.url} maxLength={MEDIA_LIMITS.url} placeholder="https://youtu.be/…" inputMode="url"
          aria-invalid={ok ? undefined : true} onChange={(e) => setV({ ...v, url: e.target.value.trim() })} />
        {!ok && <span className="cf-field-error" role="alert">Поддерживаются YouTube, Vimeo, Rutube и прямые ссылки на .mp4 / .webm.</span>}
      </label>
      {ok && v.url && <VideoBlock payload={{ url: v.url, caption: '' }} />}
      <label className="field"><span>Подпись (необязательно)</span>
        <input value={v.caption} maxLength={LIMITS.caption} placeholder="На что обратить внимание"
          onChange={(e) => setV({ ...v, caption: e.target.value })} />
      </label>
      <p className="muted">Чтобы начать не с начала, добавьте к ссылке YouTube «?t=90» — секунды.</p>
    </AutoForm>
  );
}

function SpoilerEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: SpoilerPayload } & Shared) {
  const [v, setV] = useState(payload);
  const auto = useAutosave(v, onSave, onDirtyChange);
  return (
    <AutoForm auto={auto} error={error} onCancel={onCancel}>
      <label className="field"><span>Надпись на кнопке</span>
        <input value={v.title} maxLength={LIMITS.title} placeholder="Показать решение" onChange={(e) => setV({ ...v, title: e.target.value })} />
      </label>
      <RichField label="Что скрыто" rows={6} value={v.body} onChange={(body) => setV({ ...v, body })} />
    </AutoForm>
  );
}

function CodeEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: CodePayload } & Shared) {
  const [v, setV] = useState(payload);
  const auto = useAutosave(v, onSave, onDirtyChange);
  return (
    <AutoForm auto={auto} error={error} onCancel={onCancel}>
      <label className="field cf-narrow"><span>Язык (подпись)</span>
        <input value={v.language} maxLength={30} placeholder="Python" list="cf-languages" onChange={(e) => setV({ ...v, language: e.target.value })} />
        <datalist id="cf-languages">{['Python', 'JavaScript', 'C++', 'Pascal', 'Java', 'SQL', 'Псевдокод'].map((l) => <option key={l} value={l} />)}</datalist>
      </label>
      <label className="field"><span>Код</span>
        <textarea className="input cf-textarea cf-mono" rows={10} value={v.code} maxLength={LIMITS.text} spellCheck={false}
          onChange={(e) => setV({ ...v, code: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== 'Tab' || e.shiftKey) return;
            e.preventDefault();
            const el = e.currentTarget;
            const at = el.selectionStart;
            setV({ ...v, code: `${v.code.slice(0, at)}    ${v.code.slice(el.selectionEnd)}` });
            requestAnimationFrame(() => el.setSelectionRange(at + 4, at + 4));
          }} />
      </label>
    </AutoForm>
  );
}

/* ------------------------------- тренажёр ------------------------------- */

function SimulationChooser({ blockId, simulationId, title, onChange, invalid, pickOnly }: {
  blockId: string; simulationId: string | null; title: string | null;
  onChange: (id: string, title: string) => void; invalid?: boolean;
  /** Задание «Состояние симуляции»: «Вставить в урок» из мастерской сюда не попадает — только выбор готового. */
  pickOnly?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      {simulationId ? (
        <div className="cf-sim-chosen">
          <img src={`/api/simulations/${simulationId}/thumbnail`} alt=""
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
          <div className="cf-sim-chosen-text">
            <span className="label">Выбран тренажёр</span>
            <strong>{title ?? 'Без названия'}</strong>
            <div className="cf-sim-chosen-actions">
              <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>Заменить</button>
              <a className="btn btn-sm btn-ghost" href={`/present/${simulationId}`} target="_blank" rel="noopener noreferrer">Открыть</a>
            </div>
          </div>
        </div>
      ) : (
        <div className={invalid ? 'cf-choice-tiles invalid' : 'cf-choice-tiles'}>
          <button type="button" className="cf-choice-tile" aria-invalid={invalid ? true : undefined} onClick={() => setPicking(true)}>
            <span className="cf-kind cf-kind-simulation" aria-hidden="true"><IconLibrary size={18} /></span>
            <span><strong>Выбрать готовый</strong>
              <span className="muted">Из вашей библиотеки или общего каталога — с поиском и превью.</span></span>
          </button>
          {!pickOnly && <a className="cf-choice-tile" href={generateForBlockHref(blockId)}>
            <span className="cf-kind cf-kind-assignment" aria-hidden="true"><IconWand size={18} /></span>
            <span><strong>Сгенерировать новый</strong>
              <span className="muted">Откроется мастерская. Когда симуляция будет готова, нажмите там «Вставить в урок».</span></span>
          </a>}
        </div>
      )}
      {simulationId && !pickOnly && (
        <p className="muted">
          Нужен другой тренажёр? <a href={generateForBlockHref(blockId)}>Сгенерировать новый</a> — генерация тратит вашу квоту;
          сохраните блок перед переходом.
        </p>
      )}
      {picking && (
        <SimulationPicker onClose={() => setPicking(false)} generateHref={pickOnly ? undefined : generateForBlockHref(blockId)}
          onPick={(item) => { onChange(item.id, item.title); setPicking(false); }} />
      )}
    </>
  );
}

function SimulationEditor({ blockId, payload, title, onSave, onCancel, onDirtyChange, error }: {
  blockId: string; payload: SimulationPayload; title: string | null;
} & Shared) {
  const [simulationId, setSimulationId] = useState(payload.simulationId);
  const [simTitle, setSimTitle] = useState(title);
  const [caption, setCaption] = useState(payload.caption);
  const dirty = useDirty({ simulationId, caption }, onDirtyChange);
  return (
    <EditorForm dirty={dirty} error={error} onCancel={onCancel} onSubmit={() => onSave({ simulationId, caption })}>
      <SimulationChooser blockId={blockId} simulationId={simulationId} title={simTitle}
        onChange={(id, t) => { setSimulationId(id); setSimTitle(t); }} />
      <label className="field"><span>Подпись под тренажёром</span>
        <input value={caption} maxLength={LIMITS.caption} placeholder="Что сделать: «Меняйте длину нити и следите за периодом»"
          onChange={(e) => setCaption(e.target.value)} />
      </label>
    </EditorForm>
  );
}

/* ------------------------------ лаборатория ----------------------------- */

function LabCards({ name, value, onChange }: { name: string; value: string; onChange: (slug: string) => void }) {
  return (
    <div className="cf-lab-grid" role="radiogroup" aria-label="Лаборатория">
      {LABS.map((l) => (
        <label key={l.slug} className={l.slug === value ? 'cf-lab-option active' : 'cf-lab-option'}>
          <input type="radio" className="visually-hidden" name={name} value={l.slug} checked={l.slug === value}
            onChange={() => onChange(l.slug)} />
          <img src={`/labs/${l.slug}.png`} alt="" loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
          <span className="cf-lab-option-text">
            <strong>{l.title}</strong>
            <span className="muted">{`${l.subject} · ${l.stations.join(', ')}`}</span>
          </span>
          {l.slug === value && <span className="cf-lab-check" aria-hidden="true"><IconCheck size={14} /></span>}
        </label>
      ))}
    </div>
  );
}

function LabEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: LabPayload } & Shared) {
  const [slug, setSlug] = useState(payload.slug);
  const [caption, setCaption] = useState(payload.caption);
  const name = useId();
  const dirty = useDirty({ slug, caption }, onDirtyChange);
  const lab = LABS.find((l) => l.slug === slug);
  return (
    <EditorForm dirty={dirty} error={error} onCancel={onCancel} onSubmit={() => onSave({ slug, caption })}>
      <LabCards name={name} value={slug} onChange={setSlug} />
      {lab && (
        <p className="muted">
          {lab.blurb} <a href={labUrl(lab.slug)} target="_blank" rel="noopener noreferrer">Открыть сцену</a>
        </p>
      )}
      <label className="field"><span>Подпись под лабораторией</span>
        <input value={caption} maxLength={LIMITS.caption} placeholder="Что сделать в сцене"
          onChange={(e) => setCaption(e.target.value)} />
      </label>
    </EditorForm>
  );
}

/* -------------------------------- задание ------------------------------- */

function AssignmentEditor({ blockId, payload, standTitle, initialType, onSave, onCancel, onDirtyChange, error }: {
  blockId: string; payload: AssignmentPayload; standTitle: string | null; initialType?: AssignmentType;
} & Shared) {
  const fresh = payload.prompt === 'Новое задание';
  const [f, setF] = useState<AssignmentForm>(() => {
    const form = toAssignmentForm(payload, standTitle);
    // Заготовка нового блока — не текст задания: поле открывается пустым, тип — тот, что выбран в меню.
    return fresh ? { ...form, prompt: '', type: initialType ?? form.type } : form;
  });
  const gapsArea = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<AssignmentErrors>({});
  const uid = useId();
  const set = (patch: Partial<AssignmentForm>) => {
    setF((prev) => ({ ...prev, ...patch }));
    if (Object.keys(errors).length > 0) setErrors({});
  };
  const setOption = (id: string, text: string) =>
    set({ options: f.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  const { standTitle: _ignored, ...persisted } = f;
  void _ignored;
  const dirty = useDirty(persisted, onDirtyChange);
  const err = (key: keyof AssignmentErrors) => ({
    'aria-invalid': errors[key] ? true as const : undefined,
    'aria-describedby': errors[key] ? `${uid}-${key}` : undefined,
  });

  return (
    <EditorForm dirty={dirty} error={error} onCancel={onCancel} onSubmit={() => onSave(fromAssignmentForm(f))}
      validate={() => {
        const found = validateAssignmentForm(f);
        setErrors(found);
        return Object.keys(found).length === 0;
      }}>
      <label className="field"><span>Текст задания</span>
        <textarea className="input cf-textarea" rows={4} value={f.prompt} maxLength={LIMITS.text} {...err('prompt')}
          placeholder="Например: «Во сколько раз изменится период, если длину нити увеличить в четыре раза?»"
          onChange={(e) => set({ prompt: e.target.value })} />
        <FieldError id={`${uid}-prompt`} text={errors.prompt} />
      </label>

      <fieldset className="cf-fieldset">
        <legend>Как отвечает ученик</legend>
        <div className="cf-type-tiles">
          {ASSIGNMENT_TYPES.map((type) => (
            <button key={type} type="button" aria-pressed={f.type === type}
              className={f.type === type ? 'cf-type-tile active' : 'cf-type-tile'} onClick={() => set({ type })}>
              <span className="cf-type-icon" aria-hidden="true">{ASSIGNMENT_META[type].icon(18)}</span>
              <strong>{ASSIGNMENT_META[type].label}</strong>
              <span className="muted">{ASSIGNMENT_META[type].hint}</span>
              <span className={ASSIGNMENT_META[type].auto ? 'cf-type-badge auto' : 'cf-type-badge'}>
                {ASSIGNMENT_META[type].auto ? 'проверяется само' : 'проверяете вы'}
              </span>
            </button>
          ))}
        </div>
        {f.type !== payload.spec.type && !fresh && (
          <p className="warn-banner">Тип ответа изменён: уже сданные ответы можно будет пересчитать после сохранения.</p>
        )}
      </fieldset>

      {f.type === 'choice' && (
        <fieldset className="cf-fieldset">
          <legend>Варианты ответа</legend>
          <p className="muted">Отметьте слева правильные. Балл ставится автоматически: полный — при точном совпадении, иначе 0.</p>
          {f.options.map((o, i) => (
            <div key={o.id} className={o.correct ? 'option-row cf-option correct' : 'option-row cf-option'}>
              <input type={f.multiple ? 'checkbox' : 'radio'} name={`correct-${blockId}`} checked={o.correct}
                aria-label={`Вариант ${i + 1} — правильный`}
                onChange={() => set({ options: markCorrect(f.options, o.id, f.multiple) })} />
              <input className="input" value={o.text} maxLength={LIMITS.option} placeholder={`Вариант ${i + 1}`}
                aria-label={`Текст варианта ${i + 1}`}
                aria-invalid={errors.options && !o.text.trim() ? true : undefined}
                onChange={(e) => setOption(o.id, e.target.value)} />
              <button type="button" className="icon-btn cf-icon-btn" aria-label={`Удалить вариант ${i + 1}`} title="Удалить вариант"
                disabled={f.options.length <= LIMITS.minOptions}
                onClick={() => set({ options: f.options.filter((x) => x.id !== o.id) })}>
                <IconTrash size={16} />
              </button>
            </div>
          ))}
          <FieldError id={`${uid}-options`} text={errors.options} />
          <FieldError id={`${uid}-correct`} text={errors.correct} />
          <div className="cf-inline">
            <button type="button" className="btn btn-sm" disabled={f.options.length >= LIMITS.maxOptions}
              onClick={() => set({ options: [...f.options, { id: newOptionId(), text: '', correct: false }] })}>
              <IconPlus size={15} />Добавить вариант
            </button>
            <label className="check-row">
              <input type="checkbox" checked={f.multiple}
                onChange={(e) => set({ multiple: e.target.checked,
                  options: e.target.checked ? f.options : markCorrect(f.options, f.options.find((o) => o.correct)?.id ?? '', false) })} />
              Правильных ответов несколько
            </label>
            <label className="check-row">
              <input type="checkbox" checked={f.shuffle} onChange={(e) => set({ shuffle: e.target.checked })} />
              Перемешивать варианты
            </label>
          </div>
        </fieldset>
      )}

      {f.type === 'short' && (
        <fieldset className="cf-fieldset">
          <legend>Правильный ответ</legend>
          <p className="muted">Регистр, «ё» и точка в конце не учитываются. Добавьте другие написания, если они тоже верны.</p>
          {f.accepted.map((a, i) => (
            <div key={i} className="option-row cf-option">
              <input className="input" value={a} maxLength={100} placeholder={i === 0 ? 'Например: дифракция' : 'Ещё одно написание'}
                aria-label={`Правильный ответ ${i + 1}`} aria-invalid={errors.accepted && i === 0 ? true : undefined}
                onChange={(e) => set({ accepted: f.accepted.map((x, k) => (k === i ? e.target.value : x)) })} />
              <button type="button" className="icon-btn cf-icon-btn" aria-label={`Удалить написание ${i + 1}`} title="Удалить"
                disabled={f.accepted.length <= 1} onClick={() => set({ accepted: f.accepted.filter((_, k) => k !== i) })}>
                <IconTrash size={16} />
              </button>
            </div>
          ))}
          <FieldError id={`${uid}-accepted`} text={errors.accepted} />
          <div className="cf-inline">
            <button type="button" className="btn btn-sm" disabled={f.accepted.length >= LIMITS.maxOptions}
              onClick={() => set({ accepted: [...f.accepted, ''] })}><IconPlus size={15} />Ещё написание</button>
          </div>
        </fieldset>
      )}

      {f.type === 'gaps' && (
        <fieldset className="cf-fieldset">
          <legend>Текст с пропусками</legend>
          <p className="muted">Напишите текст целиком, выделите слово и нажмите «Сделать пропуском». Несколько верных слов — через черту: {'{{растёт|увеличивается}}'}.</p>
          <div className="cf-inline">
            <button type="button" className="btn btn-sm" onClick={() => {
              const el = gapsArea.current;
              if (!el) return;
              const { selectionStart: from, selectionEnd: to } = el;
              const word = f.gapsText.slice(from, to).trim();
              if (!word || /[{}]/.test(word)) return;
              set({ gapsText: `${f.gapsText.slice(0, from)}{{${word}}}${f.gapsText.slice(to)}` });
              requestAnimationFrame(() => el.focus());
            }}>Сделать пропуском</button>
            <span className="muted">{`пропусков: ${parseGaps(f.gapsText).answers.length}`}</span>
          </div>
          <textarea ref={gapsArea} className="input cf-textarea" rows={5} value={f.gapsText} maxLength={LIMITS.text} {...err('gaps')}
            placeholder="Период маятника {{растёт}}, когда длина нити увеличивается, и не зависит от {{массы}} груза."
            onChange={(e) => set({ gapsText: e.target.value })} />
          <FieldError id={`${uid}-gaps`} text={errors.gaps} />
          {parseGaps(f.gapsText).answers.length > 0 && (
            <p className="cf-gaps-preview" aria-label="Как увидит ученик">
              {parseGaps(f.gapsText).parts.map((part, i, all) => (
                <span key={i}>{part}{i < all.length - 1 && <span className="cf-gap-slot" />}</span>
              ))}
            </p>
          )}
        </fieldset>
      )}

      {f.type === 'match' && (
        <fieldset className="cf-fieldset">
          <legend>Пары</legend>
          <p className="muted">Пишите пары как есть — ученику правая колонка придёт перемешанной. Балл — по доле верных пар.</p>
          {f.pairs.map((pair, i) => (
            <div key={pair.id} className="cf-pair-row">
              <input className="input" value={pair.left} maxLength={LIMITS.option} placeholder={`Слева ${i + 1}: термин`}
                aria-label={`Пара ${i + 1}, слева`} aria-invalid={errors.pairs && !pair.left.trim() ? true : undefined}
                onChange={(e) => set({ pairs: f.pairs.map((x) => (x.id === pair.id ? { ...x, left: e.target.value } : x)) })} />
              <span className="cf-pair-arrow" aria-hidden="true">→</span>
              <input className="input" value={pair.right} maxLength={LIMITS.option} placeholder="Справа: определение"
                aria-label={`Пара ${i + 1}, справа`} aria-invalid={errors.pairs && !pair.right.trim() ? true : undefined}
                onChange={(e) => set({ pairs: f.pairs.map((x) => (x.id === pair.id ? { ...x, right: e.target.value } : x)) })} />
              <button type="button" className="icon-btn cf-icon-btn" aria-label={`Удалить пару ${i + 1}`} title="Удалить пару"
                disabled={f.pairs.length <= LIMITS.minOptions} onClick={() => set({ pairs: f.pairs.filter((x) => x.id !== pair.id) })}>
                <IconTrash size={16} />
              </button>
            </div>
          ))}
          <FieldError id={`${uid}-pairs`} text={errors.pairs} />
          <div className="cf-inline">
            <button type="button" className="btn btn-sm" disabled={f.pairs.length >= LIMITS.maxOptions}
              onClick={() => set({ pairs: [...f.pairs, { id: newOptionId(), left: '', rightId: newOptionId(), right: '' }] })}>
              <IconPlus size={15} />Добавить пару
            </button>
          </div>
        </fieldset>
      )}

      {f.type === 'order' && (
        <fieldset className="cf-fieldset">
          <legend>Шаги в правильном порядке</legend>
          <p className="muted">Запишите сверху вниз так, как должно быть, — ученик получит их перемешанными.</p>
          {f.items.map((it, i) => (
            <div key={it.id} className="option-row cf-option">
              <span className="cf-step-num" aria-hidden="true">{i + 1}</span>
              <input className="input" value={it.text} maxLength={LIMITS.option} placeholder={`Шаг ${i + 1}`} aria-label={`Шаг ${i + 1}`}
                aria-invalid={errors.items && !it.text.trim() ? true : undefined}
                onChange={(e) => set({ items: f.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)) })} />
              <button type="button" className="icon-btn cf-icon-btn" aria-label={`Поднять шаг ${i + 1}`} title="Выше" disabled={i === 0}
                onClick={() => { const next = [...f.items]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; set({ items: next }); }}>
                <IconArrowUp size={15} /></button>
              <button type="button" className="icon-btn cf-icon-btn" aria-label={`Опустить шаг ${i + 1}`} title="Ниже" disabled={i === f.items.length - 1}
                onClick={() => { const next = [...f.items]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; set({ items: next }); }}>
                <IconArrowDown size={15} /></button>
              <button type="button" className="icon-btn cf-icon-btn" aria-label={`Удалить шаг ${i + 1}`} title="Удалить"
                disabled={f.items.length <= LIMITS.minOptions} onClick={() => set({ items: f.items.filter((x) => x.id !== it.id) })}>
                <IconTrash size={16} /></button>
            </div>
          ))}
          <FieldError id={`${uid}-items`} text={errors.items} />
          <div className="cf-inline">
            <button type="button" className="btn btn-sm" disabled={f.items.length >= LIMITS.maxOptions}
              onClick={() => set({ items: [...f.items, { id: newOptionId(), text: '' }] })}><IconPlus size={15} />Добавить шаг</button>
          </div>
        </fieldset>
      )}

      {f.type === 'number' && (
        <fieldset className="cf-fieldset">
          <legend>Правильный ответ</legend>
          <div className="form-grid cf-grid-top">
            <label className="field"><span>Число</span>
              <input value={f.answer} inputMode="decimal" placeholder="9,8" {...err('answer')}
                onChange={(e) => set({ answer: e.target.value })} />
              <FieldError id={`${uid}-answer`} text={errors.answer} />
            </label>
            <label className="field"><span>Допуск (±)</span>
              <input value={f.tolerance} inputMode="decimal" placeholder="0" {...err('tolerance')}
                onChange={(e) => set({ tolerance: e.target.value })} />
              <FieldError id={`${uid}-tolerance`} text={errors.tolerance} />
            </label>
            <label className="field"><span>Единицы (необязательно)</span>
              <input value={f.unit} maxLength={LIMITS.unit} placeholder="м/с²" onChange={(e) => set({ unit: e.target.value })} />
            </label>
          </div>
          <p className="muted">Ответ ученика засчитается, если отличается от числа не больше чем на допуск.</p>
        </fieldset>
      )}

      {f.type === 'sim_state' && (
        <fieldset className="cf-fieldset">
          <legend>Симуляция и цель</legend>
          <SimulationChooser blockId={blockId} simulationId={f.standSimulationId} title={f.standTitle} pickOnly
            invalid={Boolean(errors.stand)}
            onChange={(id, t) => set(id === f.standSimulationId
              ? { standTitle: t } : { standSimulationId: id, standTitle: t, simTargets: [] })} />
          <FieldError id={`${uid}-stand`} text={errors.stand} />
          {f.standSimulationId && (
            <SimStateEditor simulationId={f.standSimulationId} rows={f.simTargets} showHints={f.showHints}
              invalid={Boolean(errors.targets)}
              onRows={(simTargets) => set({ simTargets })} onShowHints={(showHints) => set({ showHints })} />
          )}
          <FieldError id={`${uid}-targets`} text={errors.targets} />
        </fieldset>
      )}

      {f.type === 'text' && (
        <p className="cf-note">Развёрнутый ответ проверяете вы: он появится в «Ответах» со статусом «сдано».</p>
      )}

      <fieldset className="cf-fieldset">
        <legend>Оценивание</legend>
        <div className="form-grid cf-grid-top">
          <label className="field"><span>Баллы за задание</span>
            <input type="number" min={0} max={LIMITS.maxPoints} step={1} value={f.points} {...err('points')}
              onChange={(e) => set({ points: e.target.value })} />
            <FieldError id={`${uid}-points`} text={errors.points} />
          </label>
          <div className="field"><span>Попытки</span>
            <div className="segmented" role="group" aria-label="Попытки">
              <button type="button" aria-pressed={!f.allowRetry}
                className={!f.allowRetry ? 'segmented-item active' : 'segmented-item'} onClick={() => set({ allowRetry: false })}>Одна</button>
              <button type="button" aria-pressed={f.allowRetry}
                className={f.allowRetry ? 'segmented-item active' : 'segmented-item'} onClick={() => set({ allowRetry: true })}>Можно пересдавать</button>
            </div>
          </div>
        </div>
      </fieldset>

      <label className="field"><span>Пояснение к правильному ответу — ученик увидит его после проверки</span>
        <textarea className="input cf-textarea" rows={2} value={f.explanation} maxLength={LIMITS.comment}
          placeholder="Например: «Период зависит только от длины нити и g — масса в формулу не входит»"
          onChange={(e) => set({ explanation: e.target.value })} />
      </label>

      {f.type !== 'sim_state' && <fieldset className="cf-fieldset">
        <legend>Стенд рядом с вопросом</legend>
        <div className="segmented cf-segmented-wrap" role="group" aria-label="Стенд рядом с вопросом">
          {([['none', 'Без стенда'], ['simulation', 'Тренажёр'], ['lab', 'Лаборатория']] as const).map(([kind, label]) => (
            <button key={kind} type="button" aria-pressed={f.standKind === kind}
              className={f.standKind === kind ? 'segmented-item active' : 'segmented-item'}
              onClick={() => set({ standKind: kind })}>{label}</button>
          ))}
        </div>
        {f.standKind === 'none' && <p className="muted">Стенд — тренажёр или лаборатория, на которых ученик находит ответ.</p>}
        {f.standKind === 'lab' && <LabCards name={`${uid}-lab`} value={f.standLab} onChange={(slug) => set({ standLab: slug })} />}
        {f.standKind === 'simulation' && (
          <>
            <SimulationChooser blockId={blockId} simulationId={f.standSimulationId} title={f.standTitle}
              invalid={Boolean(errors.stand)} onChange={(id, t) => set({ standSimulationId: id, standTitle: t })} />
            <FieldError id={`${uid}-stand`} text={errors.stand} />
          </>
        )}
      </fieldset>}
    </EditorForm>
  );
}

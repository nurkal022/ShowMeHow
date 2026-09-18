'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Block } from '@/lib/lms/blocks';
import {
  ASSIGNMENT_TYPE_LABELS, newOptionId, type AssignmentPayload, type AssignmentType,
  type LabPayload, type SimulationPayload, type TextPayload,
} from '@/lib/lms/block-schema';
import { LIMITS } from '@/lib/lms/types';
import { LABS, labUrl } from '@/lib/labs';
import { generateForBlockHref } from '@/lib/lms/links';
import Markup from '@/components/lms/Markup';
import { IconCheck, IconLibrary, IconPlus, IconTrash, IconWand } from '@/components/icons';
import SimulationPicker from './SimulationPicker';
import SimStateEditor from './SimStateEditor';
import {
  fromAssignmentForm, markCorrect, toAssignmentForm, validateAssignmentForm,
  type AssignmentErrors, type AssignmentForm,
} from './assignment-form';

type Save = (payload: unknown) => Promise<boolean>;

interface Props {
  block: Block;
  simulationTitle: string | null;
  onSave: Save;
  onCancel: () => void;
  /** Карточка показывает «есть несохранённые правки» и спрашивает перед закрытием. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Отказ сервера при сохранении — встаёт над кнопками формы. */
  error?: string;
}

interface Shared { onSave: Save; onCancel: () => void; onDirtyChange?: (dirty: boolean) => void; error?: string }

export default function BlockEditor({ block, simulationTitle, ...shared }: Props) {
  const body = block.body;
  switch (body.kind) {
    case 'text':
      return <TextEditor payload={body.payload} {...shared} />;
    case 'simulation':
      return <SimulationEditor blockId={block.id} payload={body.payload} title={simulationTitle} {...shared} />;
    case 'lab':
      return <LabEditor payload={body.payload} {...shared} />;
    case 'assignment':
      return <AssignmentEditor blockId={block.id} payload={body.payload} standTitle={simulationTitle} {...shared} />;
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
const MARKS: { key: string; label: string; title: string; wrap: Wrap }[] = [
  { key: 'b', label: 'Ж', title: 'Жирный', wrap: { before: '**', after: '**', placeholder: 'важное' } },
  { key: 'i', label: 'К', title: 'Курсив', wrap: { before: '*', after: '*', placeholder: 'термин' } },
  { key: 'h', label: 'Заголовок', title: 'Заголовок раздела', wrap: { linePrefix: '## ' } },
  { key: 'l', label: 'Список', title: 'Пункт списка', wrap: { linePrefix: '- ' } },
  { key: 'a', label: 'Ссылка', title: 'Ссылка', wrap: { before: '[', after: '](https://)', placeholder: 'текст ссылки' } },
];

function TextEditor({ payload, onSave, onCancel, onDirtyChange, error }: { payload: TextPayload } & Shared) {
  const [title, setTitle] = useState(payload.title);
  const [body, setBody] = useState(payload.body);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [bodyError, setBodyError] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const errId = useId();
  const dirty = useDirty({ title, body }, onDirtyChange);

  function applyMark(wrap: Wrap) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: from, selectionEnd: to } = el;
    let next: string;
    let caret: [number, number];
    if ('linePrefix' in wrap) {
      const lineStart = body.lastIndexOf('\n', from - 1) + 1;
      next = body.slice(0, lineStart) + wrap.linePrefix + body.slice(lineStart);
      caret = [from + wrap.linePrefix.length, to + wrap.linePrefix.length];
    } else {
      const picked = body.slice(from, to) || wrap.placeholder;
      next = body.slice(0, from) + wrap.before + picked + wrap.after + body.slice(to);
      caret = [from + wrap.before.length, from + wrap.before.length + picked.length];
    }
    setBody(next.slice(0, LIMITS.text));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret[0], caret[1]); });
  }

  return (
    <EditorForm dirty={dirty} error={error} onCancel={onCancel} onSubmit={() => onSave({ title, body })}
      validate={() => {
        const empty = !title.trim() && !body.trim();
        setBodyError(empty ? 'Напишите текст блока или хотя бы заголовок.' : '');
        if (empty) setTab('edit');
        return !empty;
      }}>
      <label className="field"><span>Заголовок (необязательно)</span>
        <input value={title} maxLength={LIMITS.title} placeholder="Например, «Что такое период колебаний»"
          onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="cf-text-tools">
        <div className="segmented" role="group" aria-label="Режим">
          <button type="button" aria-pressed={tab === 'edit'}
            className={tab === 'edit' ? 'segmented-item active' : 'segmented-item'} onClick={() => setTab('edit')}>Редактор</button>
          <button type="button" aria-pressed={tab === 'preview'}
            className={tab === 'preview' ? 'segmented-item active' : 'segmented-item'} onClick={() => setTab('preview')}>Как увидит ученик</button>
        </div>
        {tab === 'edit' && (
          <div className="cf-marks" role="toolbar" aria-label="Разметка текста">
            {MARKS.map((m) => (
              <button key={m.key} type="button" className={`cf-mark cf-mark-${m.key}`} title={m.title} aria-label={m.title}
                onClick={() => applyMark(m.wrap)}>{m.label}</button>
            ))}
          </div>
        )}
      </div>
      {tab === 'edit' ? (
        <label className="field"><span>Текст</span>
          <textarea ref={area} className="input cf-textarea" rows={10} value={body} maxLength={LIMITS.text}
            aria-invalid={bodyError ? true : undefined} aria-describedby={bodyError ? errId : undefined}
            placeholder="Пустая строка начинает новый абзац."
            onChange={(e) => { setBody(e.target.value); setBodyError(''); }} />
          <FieldError id={errId} text={bodyError} />
        </label>
      ) : (
        <div className="cf-preview">
          {title && <h3>{title}</h3>}
          {body.trim() ? <Markup text={body} /> : <p className="muted">Текста пока нет.</p>}
        </div>
      )}
    </EditorForm>
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

const TYPES: { type: AssignmentType; hint: string }[] = [
  { type: 'choice', hint: 'Один или несколько вариантов. Проверяется автоматически.' },
  { type: 'number', hint: 'Число с допуском и единицами. Проверяется автоматически.' },
  { type: 'text', hint: 'Свободный текст. Балл и комментарий ставите вы.' },
  { type: 'sim_state', hint: 'Ученик настраивает симуляцию до заданной цели. Проверяется автоматически.' },
];

function AssignmentEditor({ blockId, payload, standTitle, onSave, onCancel, onDirtyChange, error }: {
  blockId: string; payload: AssignmentPayload; standTitle: string | null;
} & Shared) {
  const [f, setF] = useState<AssignmentForm>(() => {
    const form = toAssignmentForm(payload, standTitle);
    // Заготовка нового блока — не текст задания: поле открывается пустым.
    return form.prompt === 'Новое задание' ? { ...form, prompt: '' } : form;
  });
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
          {TYPES.map(({ type, hint }) => (
            <button key={type} type="button" aria-pressed={f.type === type}
              className={f.type === type ? 'cf-type-tile active' : 'cf-type-tile'} onClick={() => set({ type })}>
              <strong>{ASSIGNMENT_TYPE_LABELS[type]}</strong>
              <span className="muted">{hint}</span>
            </button>
          ))}
        </div>
        {f.type !== payload.spec.type && payload.prompt !== 'Новое задание' && (
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

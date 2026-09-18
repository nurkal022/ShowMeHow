'use client';
import { useState } from 'react';
import type { Block } from '@/lib/lms/blocks';
import {
  ASSIGNMENT_TYPE_LABELS, newOptionId, type AssignmentPayload, type AssignmentType,
  type LabPayload, type SimulationPayload, type TextPayload,
} from '@/lib/lms/block-schema';
import { LIMITS } from '@/lib/lms/types';
import { LABS } from '@/lib/labs';
import { generateForBlockHref } from '@/lib/lms/links';
import Markup from '@/components/lms/Markup';
import { IconPlus, IconTrash, IconWand } from '@/components/icons';
import SimulationPicker from './SimulationPicker';
import {
  fromAssignmentForm, markCorrect, toAssignmentForm, type AssignmentForm,
} from './assignment-form';

type Save = (payload: unknown) => Promise<boolean>;

interface Props {
  block: Block;
  simulationTitle: string | null;
  onSave: Save;
  onCancel: () => void;
}

export default function BlockEditor({ block, simulationTitle, onSave, onCancel }: Props) {
  const body = block.body;
  switch (body.kind) {
    case 'text':
      return <TextEditor payload={body.payload} onSave={onSave} onCancel={onCancel} />;
    case 'simulation':
      return <SimulationEditor blockId={block.id} payload={body.payload} title={simulationTitle}
        onSave={onSave} onCancel={onCancel} />;
    case 'lab':
      return <LabEditor payload={body.payload} onSave={onSave} onCancel={onCancel} />;
    case 'assignment':
      return <AssignmentEditor blockId={block.id} payload={body.payload} standTitle={simulationTitle}
        onSave={onSave} onCancel={onCancel} />;
  }
}

function EditorForm({ onSubmit, onCancel, children }: {
  onSubmit: () => Promise<boolean>; onCancel: () => void; children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form className="settings-list" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      await onSubmit();
      setBusy(false);
    }}>
      {children}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить блок'}</button>
        <button type="button" className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

function TextEditor({ payload, onSave, onCancel }: { payload: TextPayload; onSave: Save; onCancel: () => void }) {
  const [title, setTitle] = useState(payload.title);
  const [body, setBody] = useState(payload.body);
  const [preview, setPreview] = useState(false);
  return (
    <EditorForm onSubmit={() => onSave({ title, body })} onCancel={onCancel}>
      <label className="field"><span>Заголовок (необязательно)</span>
        <input value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field"><span>Текст</span>
        <textarea className="input" rows={10} value={body} maxLength={LIMITS.text} onChange={(e) => setBody(e.target.value)} />
      </label>
      <p className="muted">
        Разметка: **жирный**, *курсив*, строка с «- » — пункт списка, «## » — заголовок,
        [текст](https://адрес) — ссылка. Пустая строка начинает новый абзац.
      </p>
      <label className="check-row">
        <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
        Показать, как увидит ученик
      </label>
      {preview && <div className="lesson-block">{title && <h2>{title}</h2>}<Markup text={body} /></div>}
    </EditorForm>
  );
}

function SimulationChooser({ blockId, simulationId, title, onChange }: {
  blockId: string; simulationId: string | null; title: string | null;
  onChange: (id: string, title: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span>{simulationId ? `Выбран тренажёр «${title ?? 'без названия'}».` : 'Тренажёр не выбран.'}</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => setPicking(true)}>Выбрать тренажёр</button>
        <a className="btn btn-ghost" href={generateForBlockHref(blockId)}>
          <IconWand size={16} />Сгенерировать тренажёр для этого блока
        </a>
      </div>
      <p className="muted">
        Генерация тратит вашу квоту. Сохраните блок перед переходом: когда симуляция будет готова,
        нажмите в мастерской «Вставить в урок».
      </p>
      {picking && (
        <SimulationPicker onClose={() => setPicking(false)}
          onPick={(item) => { onChange(item.id, item.title); setPicking(false); }} />
      )}
    </>
  );
}

function SimulationEditor({ blockId, payload, title, onSave, onCancel }: {
  blockId: string; payload: SimulationPayload; title: string | null; onSave: Save; onCancel: () => void;
}) {
  const [simulationId, setSimulationId] = useState(payload.simulationId);
  const [simTitle, setSimTitle] = useState(title);
  const [caption, setCaption] = useState(payload.caption);
  return (
    <EditorForm onSubmit={() => onSave({ simulationId, caption })} onCancel={onCancel}>
      <SimulationChooser blockId={blockId} simulationId={simulationId} title={simTitle}
        onChange={(id, t) => { setSimulationId(id); setSimTitle(t); }} />
      <label className="field"><span>Подпись</span>
        <input value={caption} maxLength={LIMITS.caption} placeholder="Что сделать с тренажёром"
          onChange={(e) => setCaption(e.target.value)} />
      </label>
    </EditorForm>
  );
}

function LabEditor({ payload, onSave, onCancel }: { payload: LabPayload; onSave: Save; onCancel: () => void }) {
  const [slug, setSlug] = useState(payload.slug);
  const [caption, setCaption] = useState(payload.caption);
  return (
    <EditorForm onSubmit={() => onSave({ slug, caption })} onCancel={onCancel}>
      <label className="field"><span>Лаборатория</span>
        <select value={slug} onChange={(e) => setSlug(e.target.value)}>
          {LABS.map((l) => <option key={l.slug} value={l.slug}>{`${l.title} — ${l.subject}`}</option>)}
        </select>
      </label>
      <label className="field"><span>Подпись</span>
        <input value={caption} maxLength={LIMITS.caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
    </EditorForm>
  );
}

const TYPES: AssignmentType[] = ['choice', 'number', 'text'];

function AssignmentEditor({ blockId, payload, standTitle, onSave, onCancel }: {
  blockId: string; payload: AssignmentPayload; standTitle: string | null; onSave: Save; onCancel: () => void;
}) {
  const [f, setF] = useState<AssignmentForm>(() => toAssignmentForm(payload, standTitle));
  const set = (patch: Partial<AssignmentForm>) => setF((prev) => ({ ...prev, ...patch }));
  const setOption = (id: string, text: string) =>
    set({ options: f.options.map((o) => (o.id === id ? { ...o, text } : o)) });

  return (
    <EditorForm onSubmit={() => onSave(fromAssignmentForm(f))} onCancel={onCancel}>
      <label className="field"><span>Текст задания</span>
        <textarea className="input" rows={4} value={f.prompt} maxLength={LIMITS.text} required
          onChange={(e) => set({ prompt: e.target.value })} />
      </label>
      <div className="field"><span>Тип ответа</span>
        <div className="segmented" role="group" aria-label="Тип ответа">
          {TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={f.type === t}
              className={f.type === t ? 'segmented-item active' : 'segmented-item'}
              onClick={() => set({ type: t })}>{ASSIGNMENT_TYPE_LABELS[t]}</button>
          ))}
        </div>
      </div>

      {f.type === 'choice' && (
        <div className="settings-list">
          <label className="check-row">
            <input type="checkbox" checked={f.multiple}
              onChange={(e) => set({ multiple: e.target.checked,
                options: e.target.checked ? f.options : markCorrect(f.options, f.options.find((o) => o.correct)?.id ?? '', false) })} />
            Несколько правильных ответов
          </label>
          {f.options.map((o, i) => (
            <div key={o.id} className="option-row">
              <input type={f.multiple ? 'checkbox' : 'radio'} name={`correct-${blockId}`} checked={o.correct}
                aria-label={`Правильный вариант ${i + 1}`}
                onChange={() => set({ options: markCorrect(f.options, o.id, f.multiple) })} />
              <input className="input" value={o.text} maxLength={LIMITS.option} required
                aria-label={`Вариант ${i + 1}`} onChange={(e) => setOption(o.id, e.target.value)} />
              <button type="button" className="icon-btn" aria-label={`Удалить вариант ${i + 1}`}
                disabled={f.options.length <= LIMITS.minOptions}
                onClick={() => set({ options: f.options.filter((x) => x.id !== o.id) })}>
                <IconTrash size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}
            disabled={f.options.length >= LIMITS.maxOptions}
            onClick={() => set({ options: [...f.options, { id: newOptionId(), text: '', correct: false }] })}>
            <IconPlus size={15} />Добавить вариант
          </button>
          <p className="muted">Балл ставится автоматически: полный — при точном совпадении, иначе 0.</p>
        </div>
      )}

      {f.type === 'number' && (
        <div className="form-grid">
          <label className="field"><span>Правильное число</span>
            <input value={f.answer} required inputMode="decimal" onChange={(e) => set({ answer: e.target.value })} />
          </label>
          <label className="field"><span>Допуск (±)</span>
            <input value={f.tolerance} inputMode="decimal" onChange={(e) => set({ tolerance: e.target.value })} />
          </label>
          <label className="field"><span>Единицы</span>
            <input value={f.unit} maxLength={LIMITS.unit} placeholder="с" onChange={(e) => set({ unit: e.target.value })} />
          </label>
        </div>
      )}

      {f.type === 'text' && <p className="muted">Развёрнутый ответ проверяете вы: он появится в «Ответах» со статусом «сдано».</p>}

      <div className="form-grid">
        <label className="field"><span>Баллы</span>
          <input type="number" min={0} max={LIMITS.maxPoints} step={1} value={f.points}
            onChange={(e) => set({ points: e.target.value })} />
        </label>
        <label className="field"><span>Стенд рядом с вопросом</span>
          <select value={f.standKind} onChange={(e) => set({ standKind: e.target.value as AssignmentForm['standKind'] })}>
            <option value="none">Без стенда</option>
            <option value="simulation">Тренажёр</option>
            <option value="lab">Лаборатория</option>
          </select>
        </label>
        {f.standKind === 'lab' && (
          <label className="field"><span>Лаборатория стенда</span>
            <select value={f.standLab} onChange={(e) => set({ standLab: e.target.value })}>
              {LABS.map((l) => <option key={l.slug} value={l.slug}>{l.title}</option>)}
            </select>
          </label>
        )}
      </div>
      {f.standKind === 'simulation' && (
        <SimulationChooser blockId={blockId} simulationId={f.standSimulationId} title={f.standTitle}
          onChange={(id, t) => set({ standSimulationId: id, standTitle: t })} />
      )}
      <label className="check-row">
        <input type="checkbox" checked={f.allowRetry} onChange={(e) => set({ allowRetry: e.target.checked })} />
        Разрешить сдавать повторно
      </label>
      {f.type !== payload.spec.type && (
        <p className="warn-banner">Тип ответа изменён: уже сданные ответы можно будет пересчитать после сохранения.</p>
      )}
    </EditorForm>
  );
}

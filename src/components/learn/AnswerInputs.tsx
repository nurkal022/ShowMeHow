'use client';
import type { Answer } from '@/lib/lms/answers';
import type { StudentAssignmentSpec } from '@/lib/lms/block-schema';
import { LIMITS } from '@/lib/lms/types';

/** Поля ответа ученика. Управляемые: состояние хранит AnswerForm. */
export default function AnswerInputs({ name, spec, answer, disabled, onChange }: {
  name: string; spec: StudentAssignmentSpec; answer: Answer; disabled: boolean; onChange: (a: Answer) => void;
}) {
  if (spec.type === 'choice') {
    const selected = answer.type === 'choice' ? answer.selected : [];
    return (
      <fieldset className="choice-list" style={{ border: 'none', margin: 0, padding: 0 }} disabled={disabled}>
        <legend className="visually-hidden">Варианты ответа</legend>
        {spec.options.map((o) => (
          <label key={o.id} className="choice">
            <input type={spec.multiple ? 'checkbox' : 'radio'} name={name} value={o.id}
              checked={selected.includes(o.id)}
              onChange={(e) => {
                const next = spec.multiple
                  ? (e.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id))
                  : [o.id];
                onChange({ type: 'choice', selected: next });
              }} />
            {o.text}
          </label>
        ))}
      </fieldset>
    );
  }
  if (spec.type === 'number') {
    return (
      <label className="field" style={{ maxWidth: 260 }}><span>Ваш ответ</span>
        <span className="row" style={{ gap: 8 }}>
          <input className="input" inputMode="decimal" value={answer.type === 'number' ? answer.value : ''}
            maxLength={LIMITS.numberAnswer} disabled={disabled}
            onChange={(e) => onChange({ type: 'number', value: e.target.value })} />
          {spec.unit && <span>{spec.unit}</span>}
        </span>
      </label>
    );
  }
  return (
    <label className="field"><span>Ваш ответ</span>
      <textarea className="input" rows={6} value={answer.type === 'text' ? answer.text : ''}
        maxLength={LIMITS.textAnswer} disabled={disabled}
        onChange={(e) => onChange({ type: 'text', text: e.target.value })} />
    </label>
  );
}

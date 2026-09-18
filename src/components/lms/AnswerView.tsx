import type { Answer } from '@/lib/lms/answers';
import type { AssignmentSpec, StudentAssignmentSpec } from '@/lib/lms/block-schema';
import { formatScore } from '@/lib/lms/format';
import { checkTargets } from '@/lib/lms/sim-state';
import { IconCheck, IconClose } from '@/components/icons';

/**
 * Ответ ученика. Учительская схема несёт правильные варианты и число — тогда
 * они видны; студенческая их не содержит, и показать их нечем.
 */
export default function AnswerView({ spec, answer }: {
  spec: AssignmentSpec | StudentAssignmentSpec; answer: Answer | null;
}) {
  if (!answer) return <p className="muted">Ответа нет.</p>;
  if (spec.type === 'choice' && answer.type === 'choice') {
    // У учительской схемы у варианта есть correct, у студенческой — нет.
    const options = spec.options as { id: string; text: string; correct?: boolean }[];
    const graded = options.some((o) => o.correct !== undefined);
    return (
      <ul className="cf-answer-options">
        {options.map((o) => {
          const picked = answer.selected.includes(o.id);
          const right = o.correct === true;
          const tone = !graded ? (picked ? 'picked' : '') : picked ? (right ? 'good' : 'bad') : right ? 'missed' : '';
          return (
            <li key={o.id} className={`cf-answer-option ${tone}`.trim()}>
              <span className="cf-answer-mark" aria-hidden="true">
                {picked ? (graded && !right ? <IconClose size={13} /> : <IconCheck size={13} />) : null}
              </span>
              <span className="cf-answer-option-text">{`${picked ? '●' : '○'} ${o.text}${right ? ' — правильный' : ''}`}</span>
              {picked && <span className="cf-answer-tag">выбор ученика</span>}
            </li>
          );
        })}
      </ul>
    );
  }
  if (spec.type === 'number' && answer.type === 'number') {
    const unit = spec.unit ? ` ${spec.unit}` : '';
    const key = 'answer' in spec ? ` (правильный ответ: ${formatScore(spec.answer)} ± ${formatScore(spec.tolerance)})` : '';
    return <p className="cf-answer-number">{`${answer.value || '—'}${unit}${key}`}</p>;
  }
  if (spec.type === 'sim_state' && answer.type === 'sim_state') {
    // Учительская схема несёт цель и допуск; студенческая — только подписи (и то с подсказками).
    const rows = (spec.targets ?? []) as { name: string; label: string; value?: number; tolerance?: number }[];
    if (rows.length === 0) return <p className="muted">Состояние симуляции сдано.</p>;
    const hinted = new Map((answer.hints ?? []).map((h) => [h.name, h.matched]));
    return (
      <ul className="cf-answer-options">
        {rows.map((t) => {
          const got = answer.controls[t.name];
          const matched = t.value !== undefined
            ? checkTargets([{ name: t.name, label: t.label, value: t.value, tolerance: t.tolerance ?? 0 }], answer.controls)[0].matched
            : hinted.get(t.name);
          const key = t.value !== undefined ? ` (цель: ${formatScore(t.value)} ± ${formatScore(t.tolerance ?? 0)})` : '';
          return (
            <li key={t.name} className={`cf-answer-option ${matched === undefined ? '' : matched ? 'good' : 'bad'}`.trim()}>
              <span className="cf-answer-mark" aria-hidden="true">
                {matched === undefined ? null : matched ? <IconCheck size={13} /> : <IconClose size={13} />}
              </span>
              <span className="cf-answer-option-text">{`${t.label}: ${got === undefined ? '—' : formatScore(got)}${key}`}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (answer.type === 'text') return <p className="answer-text cf-answer-text">{answer.text || '—'}</p>;
  return <p className="muted">Ответ дан к прежней версии задания.</p>;
}

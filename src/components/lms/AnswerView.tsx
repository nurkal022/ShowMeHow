import type { Answer } from '@/lib/lms/answers';
import type { AssignmentSpec, StudentAssignmentSpec } from '@/lib/lms/block-schema';
import { formatScore } from '@/lib/lms/format';
import { checkTargets } from '@/lib/lms/sim-state';
import { normalizeWord, parseGaps } from '@/lib/lms/block-schema';
import MeasureChart from './MeasureChart';
import { IconCheck, IconClose } from '@/components/icons';

/**
 * Ответ ученика. Учительская схема несёт правильные варианты и число — тогда
 * они видны; студенческая их не содержит, и показать их нечем.
 */
export default function AnswerView({ spec, answer, keyed = true }: {
  spec: AssignmentSpec | StudentAssignmentSpec; answer: Answer | null;
  /** «Порядок» у учительской и студенческой схем выглядит одинаково: false — шаги перемешаны, сверять не с чем. */
  keyed?: boolean;
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
  if (spec.type === 'short' && answer.type === 'short') {
    const accepted = 'accepted' in spec ? spec.accepted : null;
    const ok = accepted ? accepted.some((a) => normalizeWord(a) === normalizeWord(answer.text)) : undefined;
    return (
      <p className={`cf-answer-number ${ok === undefined ? '' : ok ? 'good' : 'bad'}`.trim()}>
        {answer.text || '—'}{accepted && !ok ? ` (правильно: ${accepted.join(' или ')})` : ''}
      </p>
    );
  }
  if (spec.type === 'gaps' && answer.type === 'gaps') {
    const parts = 'parts' in spec ? spec.parts : parseGaps(spec.text).parts;
    const key = 'text' in spec ? parseGaps(spec.text).answers : null;
    return (
      <p className="cf-answer-gaps">
        {parts.map((part, i) => {
          const given = answer.values[i] ?? '';
          const ok = key?.[i] ? key[i].some((a) => normalizeWord(a) === normalizeWord(given)) : undefined;
          return (
            <span key={i}>{part}{i < parts.length - 1 && (
              <mark className={ok === undefined ? '' : ok ? 'good' : 'bad'}>
                {given || '—'}{ok === false && key ? <small>{` → ${key[i][0]}`}</small> : null}
              </mark>
            )}</span>
          );
        })}
      </p>
    );
  }
  if (spec.type === 'match' && answer.type === 'match') {
    const rows = 'pairs' in spec
      ? spec.pairs.map((p) => ({ id: p.id, left: p.left, want: p.right, wantId: p.rightId as string | undefined,
        given: spec.pairs.find((x) => x.rightId === answer.pairs[p.id])?.right }))
      : spec.left.map((l) => ({ id: l.id, left: l.text, want: undefined as string | undefined, wantId: undefined as string | undefined,
        given: spec.right.find((r) => r.id === answer.pairs[l.id])?.text }));
    return (
      <ul className="cf-answer-options">
        {rows.map((r) => {
          const ok = r.wantId === undefined ? undefined : answer.pairs[r.id] === r.wantId;
          return (
            <li key={r.id} className={`cf-answer-option ${ok === undefined ? '' : ok ? 'good' : 'bad'}`.trim()}>
              <span className="cf-answer-mark" aria-hidden="true">{ok === undefined ? null : ok ? <IconCheck size={13} /> : <IconClose size={13} />}</span>
              <span className="cf-answer-option-text">{`${r.left} → ${r.given ?? '—'}${ok === false ? ` (правильно: ${r.want})` : ''}`}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (spec.type === 'order' && answer.type === 'order') {
    const text = new Map(spec.items.map((i) => [i.id, i.text]));
    // Учительская схема хранит шаги в правильном порядке; у студенческой они перемешаны, сверять не с чем.
    const graded = keyed;
    const given = answer.order.length ? answer.order : spec.items.map((i) => i.id);
    return (
      <ol className="cf-answer-options cf-answer-order">
        {given.map((id, i) => {
          const ok = graded ? spec.items[i]?.id === id : undefined;
          return (
            <li key={id} className={`cf-answer-option ${ok === undefined ? '' : ok ? 'good' : 'bad'}`.trim()}>
              <span className="cf-answer-mark" aria-hidden="true">{ok === undefined ? null : ok ? <IconCheck size={13} /> : <IconClose size={13} />}</span>
              <span className="cf-answer-option-text">{`${i + 1}. ${text.get(id) ?? '—'}${ok === false ? ` (здесь: ${spec.items[i]?.text ?? '—'})` : ''}`}</span>
            </li>
          );
        })}
      </ol>
    );
  }
  if (spec.type === 'table' && answer.type === 'table') {
    return (
      <div className="cf-answer-table">
        <table>
          <thead><tr><th>№</th>{spec.columns.map((c) => <th key={c.id}>{c.unit ? `${c.label}, ${c.unit}` : c.label}</th>)}</tr></thead>
          <tbody>{answer.rows.map((r, i) => <tr key={i}><td>{i + 1}</td>{spec.columns.map((c, k) => <td key={c.id}>{r[k] || '—'}</td>)}</tr>)}</tbody>
        </table>
        <MeasureChart columns={spec.columns} rows={answer.rows} />
      </div>
    );
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

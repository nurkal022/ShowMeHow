import type { Answer } from '@/lib/lms/answers';
import type { AssignmentSpec, StudentAssignmentSpec } from '@/lib/lms/block-schema';
import { formatScore } from '@/lib/lms/format';

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
    return (
      <ul className="choice-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {options.map((o) => {
          const picked = answer.selected.includes(o.id);
          const right = o.correct === true;
          return (
            <li key={o.id} className={right ? 'choice right' : 'choice'}>
              {`${picked ? '●' : '○'} ${o.text}${right ? ' — правильный' : ''}`}
            </li>
          );
        })}
      </ul>
    );
  }
  if (spec.type === 'number' && answer.type === 'number') {
    const unit = spec.unit ? ` ${spec.unit}` : '';
    const key = 'answer' in spec ? ` (правильный ответ: ${formatScore(spec.answer)} ± ${formatScore(spec.tolerance)})` : '';
    return <p>{`${answer.value || '—'}${unit}${key}`}</p>;
  }
  if (answer.type === 'text') return <p className="answer-text">{answer.text || '—'}</p>;
  return <p className="muted">Ответ дан к прежней версии задания.</p>;
}

'use client';
import type { MutableRefObject } from 'react';
import type { Answer } from '@/lib/lms/answers';
import type { StudentAssignmentSpec } from '@/lib/lms/block-schema';
import SimStateFrame, { type CaptureSimState } from '@/components/lms/SimStateFrame';

/**
 * Задание «Состояние симуляции» глазами ученика: симуляция и, после сдачи, список
 * «что совпало» — если учитель не отключил подсказки. Снимает состояние AnswerForm.
 */
export default function SimStateAnswer({ spec, answer, captureRef }: {
  spec: Extract<StudentAssignmentSpec, { type: 'sim_state' }>; answer: Answer;
  captureRef: MutableRefObject<CaptureSimState | null>;
}) {
  const hints = answer.type === 'sim_state' ? answer.hints : undefined;
  const taken = answer.type === 'sim_state' && answer.capturedAt !== '';
  return (
    <div className="sim-state-answer">
      <SimStateFrame simulationId={spec.simulationId} captureRef={captureRef} />
      <p className="muted">
        Добейтесь нужного состояния симуляции и нажмите «Сдать состояние» — проверка автоматическая.
        {spec.targets && spec.targets.length > 0 && ` Проверяются параметры: ${spec.targets.map((t) => t.label).join(', ')}.`}
      </p>
      {hints && hints.length > 0 && (
        <ul className="sim-state-hints" aria-label="Что совпало с целью">
          {hints.map((h) => (
            <li key={h.name} className={h.matched ? 'ok' : 'miss'}>
              <span aria-hidden="true">{h.matched ? '✓' : '✗'}</span>
              {`${h.label} — ${h.matched ? 'совпало' : 'не совпало'}`}
            </li>
          ))}
        </ul>
      )}
      {taken && !hints && <p className="muted">Учитель отключил подсказки: видно только итоговый балл.</p>}
    </div>
  );
}

'use client';
import type { MutableRefObject } from 'react';
import type { Answer } from '@/lib/lms/answers';
import type { StudentAssignmentSpec } from '@/lib/lms/block-schema';
import { useT } from '@/i18n/client';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import SimStateFrame, { type CaptureSimState } from '@/components/lms/SimStateFrame';

/**
 * Задание «Состояние симуляции» глазами ученика: симуляция и, после сдачи, список
 * «что совпало» — если учитель не отключил подсказки. Снимает состояние AnswerForm.
 */
export default function SimStateAnswer({ spec, answer, captureRef }: {
  spec: Extract<StudentAssignmentSpec, { type: 'sim_state' }>; answer: Answer;
  captureRef: MutableRefObject<CaptureSimState | null>;
}) {
  const t = useT(learnLesson);
  const hints = answer.type === 'sim_state' ? answer.hints : undefined;
  const taken = answer.type === 'sim_state' && answer.capturedAt !== '';
  return (
    <div className="sim-state-answer">
      <SimStateFrame simulationId={spec.simulationId} captureRef={captureRef} />
      <p className="muted">
        {t('simStateHelp')}
        {spec.targets && spec.targets.length > 0 && t('simTargets', { list: spec.targets.map((x) => x.label).join(', ') })}
      </p>
      {hints && hints.length > 0 && (
        <ul className="sim-state-hints" aria-label={t('hintsAria')}>
          {hints.map((h) => (
            <li key={h.name} className={h.matched ? 'ok' : 'miss'}>
              <span aria-hidden="true">{h.matched ? '✓' : '✗'}</span>
              {t(h.matched ? 'matched' : 'missed', { label: h.label })}
            </li>
          ))}
        </ul>
      )}
      {taken && !hints && <p className="muted">{t('hintsOff')}</p>}
    </div>
  );
}

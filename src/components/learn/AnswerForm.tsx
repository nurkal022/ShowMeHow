'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AUTOSAVE_MS, canSaveDraft, canSubmit, emptyAnswer, type Answer, type StudentSubmission,
} from '@/lib/lms/answers';
import type { StudentAssignmentPayload } from '@/lib/lms/block-schema';
import type { AnswerState } from '@/lib/lms/types';
import { callApi } from '@/components/cabinet/api';
import { bridgeProblem } from '@/lib/lms/sim-bridge';
import type { CaptureSimState } from '@/components/lms/SimStateFrame';
import AnswerInputs from './AnswerInputs';
import SubmissionStatus from './SubmissionStatus';

/**
 * Форма ответа. Текст сохраняется черновиком раз в 5 секунд, пока ответ не сдан.
 * В режиме «Как видит ученик» ничего не отправляется.
 */
export default function AnswerForm({ blockId, payload, initial, preview }: {
  blockId: string; payload: StudentAssignmentPayload; initial: StudentSubmission | null; preview: boolean;
}) {
  const [sub, setSub] = useState(initial);
  const [answer, setAnswer] = useState<Answer>(initial?.answer ?? emptyAnswer(payload.spec));
  const [reopened, setReopened] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const answerRef = useRef(answer);
  const dirty = useRef(false);
  const captureRef = useRef<CaptureSimState | null>(null);
  const isSim = payload.spec.type === 'sim_state';
  const state: AnswerState = sub?.status ?? 'none';
  const draftable = !preview && canSaveDraft(state);
  const editable = !preview && (draftable || reopened);

  answerRef.current = answer;

  async function save(submit: boolean) {
    if (preview) return;
    dirty.current = false;
    setSaving('saving');
    setError('');
    const res = await callApi<{ submission: StudentSubmission }>(
      `/api/learn/blocks/${blockId}/answer`, 'PUT', { answer: answerRef.current, submit });
    if (!res.ok) {
      dirty.current = true;
      setSaving('idle');
      setError(res.error);
      return;
    }
    setSub(res.data.submission);
    // В сданное состояние сервер дописывает «что совпало» — показываем его версию.
    if (isSim && res.data.submission.answer) setAnswer(res.data.submission.answer);
    setSaving('saved');
    if (submit) setReopened(false);
  }

  /** Состояние симуляции: снять значения контролов через мост и сразу сдать. */
  async function submitSimState() {
    if (preview) return;
    setSaving('saving');
    setError('');
    const reply = captureRef.current ? await captureRef.current() : null;
    if (!reply || !reply.ok) {
      setSaving('idle');
      setError(reply ? bridgeProblem(reply) : 'Симуляция ещё не загрузилась.');
      return;
    }
    const controls: Record<string, number> = {};
    for (const c of reply.controls) controls[c.name] = c.value;
    answerRef.current = { type: 'sim_state', controls, capturedAt: new Date().toISOString() };
    await save(true);
  }

  useEffect(() => {
    if (!draftable || payload.spec.type !== 'text') return;
    const timer = setInterval(() => { if (dirty.current) void save(false); }, AUTOSAVE_MS);
    return () => clearInterval(timer);
    // save читает ответ через ref, поэтому пересоздавать таймер на каждый ввод не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftable, payload.spec.type]);

  function change(next: Answer) {
    setAnswer(next);
    dirty.current = true;
    setSaving('idle');
  }

  return (
    <div className="settings-list">
      {preview && <p className="warn-banner">Режим просмотра: ответы не сохраняются.</p>}
      <SubmissionStatus sub={sub} points={payload.points} />
      <AnswerInputs name={`answer-${blockId}`} spec={payload.spec} answer={answer} disabled={!editable} onChange={change}
        captureRef={captureRef} />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {editable && (
          <button type="button" className="btn btn-primary" disabled={saving === 'saving'} onClick={() => (isSim ? submitSimState() : save(true))}>
            {isSim ? (state === 'none' || state === 'draft' ? 'Сдать состояние' : 'Сдать состояние заново')
              : state === 'none' || state === 'draft' ? 'Сдать' : 'Сдать заново'}
          </button>
        )}
        {draftable && !isSim && (
          <button type="button" className="btn" disabled={saving === 'saving'} onClick={() => save(false)}>
            Сохранить черновик
          </button>
        )}
        {!editable && !preview && canSubmit(state, payload.allowRetry) && (
          <button type="button" className="btn" onClick={() => setReopened(true)}>Сдать заново</button>
        )}
        {saving === 'saved' && <span className="saved-note">Сохранено</span>}
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
    </div>
  );
}

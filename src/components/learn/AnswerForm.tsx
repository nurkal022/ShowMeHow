'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AUTOSAVE_MS, canSaveDraft, canSubmit, emptyAnswer, type Answer, type StudentSubmission,
} from '@/lib/lms/answers';
import type { StudentAssignmentPayload } from '@/lib/lms/block-schema';
import type { AnswerState } from '@/lib/lms/types';
import { callApi } from '@/components/cabinet/api';
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
    setSaving('saved');
    if (submit) setReopened(false);
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
      <AnswerInputs name={`answer-${blockId}`} spec={payload.spec} answer={answer} disabled={!editable} onChange={change} />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {editable && (
          <button type="button" className="btn btn-primary" disabled={saving === 'saving'} onClick={() => save(true)}>
            {state === 'none' || state === 'draft' ? 'Сдать' : 'Сдать заново'}
          </button>
        )}
        {draftable && (
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

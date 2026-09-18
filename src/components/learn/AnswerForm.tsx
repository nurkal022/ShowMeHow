'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AUTOSAVE_MS, canSaveDraft, canSubmit, emptyAnswer, isAnswerComplete, tableFilledRows, type Answer, type StudentSubmission,
} from '@/lib/lms/answers';
import type { Reveal, StudentAssignmentPayload } from '@/lib/lms/block-schema';
import type { AnswerState } from '@/lib/lms/types';
import { formatScore } from '@/lib/lms/format';
import { callApi } from '@/components/cabinet/api';
import { bridgeProblem } from '@/lib/lms/sim-bridge';
import type { CaptureSimState } from '@/components/lms/SimStateFrame';
import AnswerView from '@/components/lms/AnswerView';
import Markup from '@/components/lms/Markup';
import { useConfirm } from '@/components/lms/ui/useConfirm';
import { IconBulb, IconCheck } from '@/components/icons';
import AnswerInputs from './AnswerInputs';
import SubmissionStatus, { scoreTone } from './SubmissionStatus';

/**
 * Форма ответа. Черновик уходит на сервер сам, через полторы секунды после правки.
 * Единственную попытку сдают через подтверждение. После проверки — разбор: что верно,
 * правильный ответ и пояснение учителя. В режиме «Как видит ученик» ничего не отправляется.
 */
export default function AnswerForm({ blockId, payload, initial, preview }: {
  blockId: string; payload: StudentAssignmentPayload; initial: StudentSubmission | null; preview: boolean;
}) {
  const [sub, setSub] = useState(initial);
  const [answer, setAnswer] = useState<Answer>(initial?.answer ?? emptyAnswer(payload.spec));
  const [reveal, setReveal] = useState<Reveal | null>(
    payload.solution ? { solution: payload.solution, explanation: payload.explanation ?? '' } : null);
  const [reopened, setReopened] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const [ask, confirmDialog] = useConfirm();
  const answerRef = useRef(answer);
  const captureRef = useRef<CaptureSimState | null>(null);
  const isSim = payload.spec.type === 'sim_state';
  const state: AnswerState = sub?.status ?? 'none';
  const draftable = !preview && canSaveDraft(state);
  const editable = !preview && (draftable || reopened);

  answerRef.current = answer;

  /** Порядок, который ученик не трогал, — тоже ответ: тот, что он видит на экране. */
  function ready(a: Answer): Answer {
    if (a.type === 'order' && a.order.length === 0 && payload.spec.type === 'order') {
      return { type: 'order', order: payload.spec.items.map((i) => i.id) };
    }
    return a;
  }

  async function save(submit: boolean) {
    if (preview) return;
    const sending = submit ? ready(answerRef.current) : answerRef.current;
    setSaving('saving');
    setError('');
    const res = await callApi<{ submission: StudentSubmission; reveal: Reveal | null }>(
      `/api/learn/blocks/${blockId}/answer`, 'PUT', { answer: sending, submit });
    if (!res.ok) {
      setSaving('idle');
      setError(res.error);
      return;
    }
    const next = res.data.submission;
    setSub(next);
    setReveal(res.data.reveal);
    // В сданное состояние сервер дописывает «что совпало» — показываем его версию.
    if (submit && next.answer) setAnswer(next.answer);
    setSaving('saved');
    if (submit) {
      setReopened(false);
      if (next.status === 'graded' && scoreTone(next.score, payload.points) === 'full' && payload.points > 0) {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 1600);
      }
    }
  }

  async function submit() {
    if (preview) return;
    if (payload.spec.type === 'table' && answerRef.current.type === 'table'
      && tableFilledRows(answerRef.current.rows) < payload.spec.minRows) {
      setError(`Нужно заполнить числами не меньше ${payload.spec.minRows} строк.`);
      return;
    }
    if (!isSim && !isAnswerComplete(ready(answerRef.current))) {
      setError(payload.spec.type === 'gaps' ? 'Заполните все пропуски.'
        : payload.spec.type === 'table' ? 'Заполните числами хотя бы одну строку таблицы.' : 'Сначала дайте ответ.');
      return;
    }
    if (!payload.allowRetry && !(await ask({
      title: 'Сдать ответ?', confirmLabel: 'Сдать',
      text: 'У этого задания одна попытка: после сдачи изменить ответ будет нельзя.',
    }))) return;
    if (isSim) return submitSimState();
    await save(true);
  }

  /** Состояние симуляции: снять значения контролов через мост и сразу сдать. */
  async function submitSimState() {
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

  // Черновик сохраняется сам: после правки ждём паузу и отправляем.
  const [dirtyTick, setDirtyTick] = useState(0);
  useEffect(() => {
    if (!draftable || isSim || dirtyTick === 0) return;
    const timer = setTimeout(() => { void save(false); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // save читает ответ через ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyTick, draftable, isSim]);

  function change(next: Answer) {
    setAnswer(next);
    setSaving('idle');
    setError('');
    setDirtyTick((n) => n + 1);
  }

  const graded = sub?.status === 'graded';
  const tone = graded ? scoreTone(sub.score, payload.points) : null;
  const first = state === 'none' || state === 'draft';

  return (
    <div className={`settings-list learn-answer${celebrate ? ' celebrate' : ''}`}>
      {preview && <p className="warn-banner">Режим просмотра: ответы не сохраняются.</p>}
      {!(reveal && sub?.status === 'graded' && !editable) && <SubmissionStatus sub={sub} points={payload.points} />}

      {reveal && graded && !editable ? (
        <div className={`learn-review ${tone}`}>
          <div className="learn-review-head">
            <span className="learn-review-score"><strong>{formatScore(sub.score)}</strong>{` из ${payload.points}`}</span>
            <span className="learn-review-title">
              {tone === 'full' ? 'Всё верно' : tone === 'part' ? 'Верно частично' : 'Пока неверно'}
            </span>
          </div>
          {reveal.solution.type !== 'text' && <AnswerView spec={reveal.solution} answer={sub.answer} />}
          {sub.comment && <p className="teacher-note learn-note">{`Комментарий учителя: ${sub.comment}`}</p>}
          {reveal.explanation && (
            <div className="learn-explain"><IconBulb size={18} /><Markup text={reveal.explanation} /></div>
          )}
        </div>
      ) : (
        <AnswerInputs name={`answer-${blockId}`} spec={payload.spec} answer={answer} disabled={!editable} onChange={change}
          captureRef={captureRef} />
      )}

      <div className="row learn-answer-foot">
        {editable && (
          <button type="button" className="btn btn-primary" disabled={saving === 'saving'} onClick={submit}>
            {isSim ? (first ? 'Сдать состояние' : 'Сдать состояние заново') : first ? 'Сдать ответ' : 'Сдать заново'}
          </button>
        )}
        {!editable && !preview && canSubmit(state, payload.allowRetry) && (
          <button type="button" className="btn" onClick={() => setReopened(true)}>Попробовать ещё раз</button>
        )}
        {draftable && !isSim && (
          <span className="saved-note learn-draft-note" role="status" aria-live="polite">
            {saving === 'saving' && 'Сохраняю черновик…'}
            {saving === 'saved' && state === 'draft' && <><IconCheck size={14} />Черновик сохранён</>}
          </span>
        )}
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      {celebrate && <span className="learn-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>}
      {confirmDialog}
    </div>
  );
}

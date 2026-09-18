'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITS } from '@/lib/lms/types';
import { callApi } from '@/components/cabinet/api';

/** Оценка одной работы: балл из максимума, комментарий, «сохранить и к следующему». */
export default function GradeForm({ submissionId, points, score, comment, nextHref }: {
  submissionId: string; points: number; score: number | null; comment: string | null;
  /** Следующая непроверенная работа. Без него форма сама находит её в таблице ответов. */
  nextHref?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(score === null ? '' : String(score).replace('.', ','));
  const [text, setText] = useState(comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scoreError, setScoreError] = useState('');
  const [done, setDone] = useState('');

  function parsed(): number | null {
    const n = Number(value.trim().replace(',', '.'));
    return value.trim() !== '' && Number.isFinite(n) ? n : null;
  }

  function findNext(): string | null {
    if (nextHref !== undefined) return nextHref;
    return document.querySelector<HTMLAnchorElement>('a[data-next-answer]')?.getAttribute('href') ?? null;
  }

  async function send(action: 'grade' | 'return', thenNext: boolean) {
    setError('');
    setDone('');
    if (action === 'grade') {
      const n = parsed();
      if (n === null) return setScoreError('Введите балл числом.');
      if (n < 0 || n > points) return setScoreError(`Балл — от 0 до ${points}.`);
    } else if (!text.trim()) {
      return setError('Напишите в комментарии, что нужно доработать, — ученик увидит его рядом с заданием.');
    }
    setScoreError('');
    // Адрес следующей работы берётся до запроса: после него эта работа уже не «ждёт проверки».
    const next = thenNext ? findNext() : null;
    setBusy(true);
    const res = await callApi(`/api/teach/submissions/${submissionId}`, 'PATCH', { action, score: value, comment: text });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (next) {
      router.push(next, { scroll: false });
      router.refresh();
      return;
    }
    setDone(action === 'grade'
      ? thenNext ? 'Оценка поставлена. Непроверенных работ больше нет.' : 'Оценка поставлена.'
      : 'Работа возвращена на доработку.');
    router.refresh();
  }

  const quick = [...new Set([0, Math.round(points / 2), points])];

  return (
    <form className="cf-grade" noValidate onSubmit={(e) => { e.preventDefault(); void send('grade', true); }}>
      <div className="cf-grade-score">
        <label className="field"><span>Балл</span>
          <span className="cf-score-input">
            <input value={value} inputMode="decimal" autoComplete="off" aria-invalid={scoreError ? true : undefined}
              aria-describedby="grade-score-note" onChange={(e) => { setValue(e.target.value); setScoreError(''); }} />
            <span className="cf-score-max" id="grade-score-note">{`из ${points}`}</span>
          </span>
        </label>
        <div className="cf-quick" role="group" aria-label="Быстрый балл">
          {quick.map((q) => (
            <button key={q} type="button" className="cf-chip" onClick={() => { setValue(String(q)); setScoreError(''); }}>
              {q === points && points > 0 ? `${q} — максимум` : String(q)}
            </button>
          ))}
        </div>
      </div>
      {scoreError && <span className="cf-field-error" role="alert">{scoreError}</span>}
      <label className="field"><span>Комментарий ученику</span>
        <textarea className="input cf-textarea" rows={3} value={text} maxLength={LIMITS.comment}
          placeholder="Что получилось и что поправить." onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="cf-grade-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить и к следующему'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => send('grade', false)}>Сохранить</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => send('return', false)}>Вернуть на доработку</button>
      </div>
      {done && <p className="ok-box" role="status">{done}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </form>
  );
}

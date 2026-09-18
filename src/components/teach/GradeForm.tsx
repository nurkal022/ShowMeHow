'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITS } from '@/lib/lms/types';
import { callApi } from '@/components/cabinet/api';

export default function GradeForm({ submissionId, points, score, comment }: {
  submissionId: string; points: number; score: number | null; comment: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(score === null ? '' : String(score));
  const [text, setText] = useState(comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function send(action: 'grade' | 'return') {
    setBusy(true);
    setError('');
    setDone('');
    const res = await callApi(`/api/teach/submissions/${submissionId}`, 'PATCH', { action, score: value, comment: text });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone(action === 'grade' ? 'Оценка поставлена.' : 'Работа возвращена на доработку.');
    router.refresh();
  }

  return (
    <form className="settings-list" onSubmit={(e) => { e.preventDefault(); void send('grade'); }}>
      <div className="row">
        <label className="field" style={{ width: 140 }}><span>Балл</span>
          <input value={value} inputMode="decimal" required onChange={(e) => setValue(e.target.value)} />
        </label>
        <span className="muted">{`из ${points}`}</span>
      </div>
      <label className="field"><span>Комментарий</span>
        <textarea className="input" rows={3} value={text} maxLength={LIMITS.comment} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>Поставить</button>
        <button type="button" className="btn" disabled={busy} onClick={() => send('return')}>Вернуть на доработку</button>
      </div>
      {done && <p className="ok-box" role="status">{done}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </form>
  );
}

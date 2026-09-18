'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITS } from '@/lib/lms/types';
import type { RubricItem } from '@/lib/lms/block-schema';
import { callApi } from '@/components/cabinet/api';
import { IconClose, IconKeyboard, IconPlus } from '@/components/icons';

const BANK_KEY = 'tesseract.grade.comments';
const DEFAULT_BANK = [
  'Отлично, всё верно.', 'Верно, но не хватает вывода.', 'Проверь единицы измерения.',
  'Нет объяснения — опиши, почему так.', 'Перечитай теорию в начале темы и попробуй ещё раз.',
];
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Оценка одной работы. Лента проверки: Ctrl+Enter — сохранить и к следующей,
 * Alt+←/→ — соседние работы, Alt+1…3 — быстрый балл. Критерии складывают балл сами,
 * заготовки комментариев живут в браузере учителя.
 */
export default function GradeForm({ submissionId, points, score, comment, nextHref, rubric = [], suggested = null, prevHref, nextAnyHref }: {
  submissionId: string; points: number; score: number | null; comment: string | null;
  /** Следующая непроверенная работа. Без него форма сама находит её в таблице ответов. */
  nextHref?: string | null;
  rubric?: RubricItem[];
  /** Балл автопроверки — подставляется, пока учитель не поставил свой. */
  suggested?: number | null;
  prevHref?: string | null; nextAnyHref?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(score !== null ? fmt(score) : suggested !== null ? fmt(suggested) : '');
  const [text, setText] = useState(comment ?? '');
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [bank, setBank] = useState<string[]>(DEFAULT_BANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scoreError, setScoreError] = useState('');
  const [done, setDone] = useState('');
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BANK_KEY) ?? 'null');
      if (Array.isArray(saved) && saved.every((x) => typeof x === 'string')) setBank(saved);
    } catch { /* приватный режим */ }
  }, []);
  const saveBank = (next: string[]) => { setBank(next); try { localStorage.setItem(BANK_KEY, JSON.stringify(next)); } catch { /* не беда */ } };

  const quick = [...new Set([0, Math.round(points / 2), points])];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft' && prevHref) { e.preventDefault(); router.push(prevHref, { scroll: false }); }
      if (e.key === 'ArrowRight' && nextAnyHref) { e.preventDefault(); router.push(nextAnyHref, { scroll: false }); }
      const q = quick[Number(e.key) - 1];
      if (q !== undefined && rubric.length === 0) { e.preventDefault(); setValue(String(q)); setScoreError(''); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // quick зависит только от points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevHref, nextAnyHref, points, rubric.length]);

  function mark(id: string, v: number) {
    const next = { ...marks, [id]: v };
    setMarks(next);
    setValue(fmt(Math.min(points, rubric.reduce((a, r) => a + (next[r.id] ?? 0), 0))));
    setScoreError('');
  }

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
    // Отмеченные критерии уходят ученику строками комментария: он видит, за что именно балл.
    const lines = rubric.filter((r) => marks[r.id] !== undefined).map((r) => `• ${r.label}: ${fmt(marks[r.id])} из ${fmt(r.points)}`);
    const full = [text.trim(), lines.join('\n')].filter(Boolean).join('\n').slice(0, LIMITS.comment);
    // Адрес следующей работы берётся до запроса: после него эта работа уже не «ждёт проверки».
    const next = thenNext ? findNext() : null;
    setBusy(true);
    const res = await callApi(`/api/teach/submissions/${submissionId}`, 'PATCH', { action, score: value, comment: full });
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

  return (
    <form ref={form} className="cf-grade" noValidate onSubmit={(e) => { e.preventDefault(); void send('grade', true); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send('grade', true); } }}>
      {rubric.length > 0 && (
        <fieldset className="cf-rubric">
          <legend>Критерии</legend>
          {rubric.map((r) => {
            const steps = [...new Set([0, r.points / 2, r.points])];
            return (
              <div key={r.id} className="cf-rubric-item">
                <span>{r.label}</span>
                <span className="cf-rubric-steps" role="group" aria-label={r.label}>
                  {steps.map((v) => (
                    <button key={v} type="button" aria-pressed={marks[r.id] === v}
                      className={marks[r.id] === v ? 'cf-rubric-step on' : 'cf-rubric-step'} onClick={() => mark(r.id, v)}>{fmt(v)}</button>
                  ))}
                </span>
              </div>
            );
          })}
        </fieldset>
      )}
      <div className="cf-grade-score">
        <label className="field"><span>Балл</span>
          <span className="cf-score-input">
            <input value={value} inputMode="decimal" autoComplete="off" aria-invalid={scoreError ? true : undefined}
              aria-describedby="grade-score-note" onChange={(e) => { setValue(e.target.value); setScoreError(''); }} />
            <span className="cf-score-max" id="grade-score-note">{`из ${points}`}</span>
          </span>
        </label>
        {rubric.length === 0 && (
          <div className="cf-quick" role="group" aria-label="Быстрый балл">
            {quick.map((q, i) => (
              <button key={q} type="button" className="cf-chip" title={`Alt + ${i + 1}`} onClick={() => { setValue(String(q)); setScoreError(''); }}>
                {q === points && points > 0 ? `${q} — максимум` : String(q)}
              </button>
            ))}
          </div>
        )}
      </div>
      {scoreError && <span className="cf-field-error" role="alert">{scoreError}</span>}
      <label className="field"><span>Комментарий ученику</span>
        <textarea className="input cf-textarea" rows={3} value={text} maxLength={LIMITS.comment}
          placeholder="Что получилось и что поправить." onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="cf-bank" role="group" aria-label="Заготовки комментариев">
        {bank.map((b) => (
          <span key={b} className="cf-bank-item">
            <button type="button" className="cf-bank-text" title="Вставить в комментарий"
              onClick={() => setText((t) => (t.trim() ? `${t.trim()} ${b}` : b).slice(0, LIMITS.comment))}>{b}</button>
            <button type="button" className="cf-bank-x" aria-label={`Убрать заготовку «${b}»`} onClick={() => saveBank(bank.filter((x) => x !== b))}><IconClose size={12} /></button>
          </span>
        ))}
        {text.trim() && !bank.includes(text.trim()) && text.trim().length <= 160 && (
          <button type="button" className="cf-bank-add" onClick={() => saveBank([...bank, text.trim()].slice(-12))}><IconPlus size={13} />В заготовки</button>
        )}
      </div>
      <div className="cf-grade-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить и к следующему'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => send('grade', false)}>Сохранить</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => send('return', false)}>Вернуть на доработку</button>
      </div>
      <p className="cf-keys muted"><IconKeyboard size={15} />Ctrl + Enter — сохранить и дальше · Alt + ← → — соседние работы{rubric.length === 0 && ' · Alt + 1–3 — быстрый балл'}</p>
      {done && <p className="ok-box" role="status">{done}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </form>
  );
}

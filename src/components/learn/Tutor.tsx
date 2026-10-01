'use client';
import { useEffect, useRef, useState } from 'react';
import type { TutorMessage } from '@/lib/lms/tutor';
import { callApi } from '@/components/cabinet/api';
import Markup from '@/components/lms/Markup';
import { IconChevron, IconClose, IconSend, IconSpark } from '@/components/icons';
import { useFormat, useT } from '@/i18n/client';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import type { TFn } from '@/i18n/core';

type Mode = 'hint' | 'explain' | 'check' | 'ask';
interface Seed { mode: Mode; question: string; at: number }

type Chip = { mode: Mode; text: string; label: string };
// Текст кнопки уходит в чат от имени ученика; «: » в конце — значит, ученик допишет сам.
const THEORY_CHIPS = (t: TFn<typeof learnLesson.ru>): Chip[] => [
  { mode: 'explain', text: t('askExplain'), label: t('explainSimple') },
  { mode: 'ask', text: t('askWhere'), label: t('whereInLife') },
  { mode: 'check', text: t('askUnderstood'), label: t('chipUnderstood') },
];
const TASK_CHIPS = (t: TFn<typeof learnLesson.ru>): Chip[] => [
  { mode: 'hint', text: '', label: t('chipHint') },
  { mode: 'ask', text: t('askStart'), label: t('chipStart') },
  { mode: 'check', text: t('askCheck'), label: t('helpCheck') },
];

/**
 * Наставник — часть страницы урока, а не всплывающее окно: колонка справа, которая
 * сворачивается в закладку у края. Он видит текущий шаг, к заданиям даёт лестницу
 * из трёх подсказок и никогда не называет ответ.
 */
export default function Tutor({ topicId, open, initial, seed, stepTitle, stepBlockIds, hasTask, onToggle }: {
  topicId: string; open: boolean; initial: TutorMessage[]; seed: Seed | null;
  stepTitle: string; stepBlockIds: string[]; hasTask: boolean; timer?: boolean;
  onToggle: (open: boolean) => void;
}) {
  const t = useT(learnLesson);
  const f = useFormat();
  const [messages, setMessages] = useState<TutorMessage[]>(initial);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const seedAt = useRef(0);
  const hints = messages.filter((m) => m.role === 'tutor' && m.hintLevel !== null).reduce((a, m) => Math.max(a, m.hintLevel ?? 0), 0);

  const send = async (mode: Mode, question: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    if (question.trim()) setMessages((m) => [...m, { id: `tmp${Date.now()}`, role: 'student', text: question.trim(), hintLevel: null, at: new Date().toISOString(), blockId: null }]);
    setText('');
    const draft = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('.learn-task textarea, .learn-task input[type="text"]')?.value ?? '';
    const res = await callApi<{ student: TutorMessage | null; tutor: TutorMessage; chips: string[] }>(
      '/api/learn/tutor', 'POST', { topicId, mode, question, blockIds: stepBlockIds, draftAnswer: draft });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMessages((m) => [...m.filter((x) => !x.id.startsWith('tmp')), ...(res.data.student ? [res.data.student] : []), res.data.tutor]);
    setChips(res.data.chips);
  };

  // Кнопки в самом уроке («Объясни проще», «Подскажи») открывают наставника и спрашивают за ученика.
  useEffect(() => {
    if (!seed || seed.at === seedAt.current) return;
    seedAt.current = seed.at;
    if (seed.question.endsWith(': ')) { setText(seed.question); input.current?.focus(); return; }
    void send(seed.mode, seed.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  if (!open) {
    return (
      <button type="button" className="tutor-tab" onClick={() => onToggle(true)} aria-label={t('openTutor')}>
        <span className="tutor-orb sm"><IconSpark size={16} /></span>
        <span className="tutor-tab-text">{t('tutor')}</span>
      </button>
    );
  }

  const suggestions = hasTask ? TASK_CHIPS(t) : THEORY_CHIPS(t);
  return (
    <aside className="tutor" aria-label={t('tutor')}>
      <header className="tutor-head">
        <span className="tutor-orb"><IconSpark size={18} /></span>
        <div>
          <b>{t('tutor')}</b>
          <span className="muted">{t('seesStep', { title: stepTitle })}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={t('collapseTutor')} onClick={() => onToggle(false)}><IconClose size={16} /></button>
      </header>

      <div className="tutor-feed" ref={feed}>
        {messages.length === 0 && (
          <div className="tutor-intro">
            <p><b>{t('introBold')}</b>{t('introRest')}</p>
            <p className="muted">{t('introMuted')}</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'student' ? 'tutor-msg me' : 'tutor-msg'}>
            {m.role === 'tutor' && m.hintLevel !== null && <span className="tutor-hint-badge">{t('hintBadge', { n: m.hintLevel })}</span>}
            {m.role === 'tutor' ? <Markup text={m.text} /> : <p>{m.text}</p>}
          </div>
        ))}
        {busy && <div className="tutor-msg typing"><span /><span /><span /></div>}
        {error && <p className="error-box" role="alert">{f.message(error)}</p>}
      </div>

      <div className="tutor-chips">
        {(chips.length ? chips.map((c) => ({ mode: 'ask' as Mode, text: c, label: c })) : suggestions)
          .filter((c) => !(c.mode === 'hint' && hints >= 3))
          .map((c) => (
            <button key={c.label} type="button" className={c.mode === 'hint' ? 'tutor-chip hint' : 'tutor-chip'} disabled={busy}
              onClick={() => (c.text.endsWith(': ') ? (setText(c.text), input.current?.focus()) : void send(c.mode, c.text))}>
              {c.label}{c.mode === 'hint' && hints > 0 ? ` (${hints + 1}/3)` : ''}
            </button>
          ))}
      </div>

      <form className="tutor-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send('ask', text); }}>
        <textarea ref={input} rows={1} value={text} maxLength={1000} placeholder={t('tutorPlaceholder')}
          aria-label={t('tutorAria')} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) void send('ask', text); } }} />
        <button type="submit" className="tutor-send" disabled={busy || !text.trim()} aria-label={t('ask')}><IconSend size={16} /></button>
      </form>
      <p className="tutor-foot">
        {hasTask && <span className={hints >= 3 ? 'tutor-hints out' : 'tutor-hints'}>{t('hintsUsed', { n: hints })}</span>}
        <span className="muted">{t('tutorFoot')}<IconChevron size={12} /></span>
      </p>
    </aside>
  );
}

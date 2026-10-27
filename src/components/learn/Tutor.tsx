'use client';
import { useEffect, useRef, useState } from 'react';
import type { TutorMessage } from '@/lib/lms/tutor';
import { callApi } from '@/components/cabinet/api';
import { describeSimScreens, highlightInSims } from '@/lib/lms/sim-bridge';
import Markup from '@/components/lms/Markup';
import TutorPlotView from './TutorPlotView';
import { IconChevron, IconClose, IconSend, IconSound, IconSpark } from '@/components/icons';
import { speak, type Speech } from '@/lib/lms/speech';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import type { TFn } from '@/i18n/core';

type Mode = 'hint' | 'explain' | 'check' | 'ask';
interface Seed { mode: Mode; question: string; at: number }

type Chip = { mode: Mode; text: string; label: string };
// Текст кнопки уходит в чат от имени студента; «: » в конце — значит, студент допишет сам.
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

const simFrames = () => [...document.querySelectorAll<HTMLIFrameElement>('.lv-blocks iframe')];

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
  const locale = useLocale();
  const [speaking, setSpeaking] = useState<string | null>(null);
  const speech = useRef<Speech | null>(null);
  useEffect(() => () => speech.current?.stop(), []);
  function toggleSpeak(m: TutorMessage) {
    speech.current?.stop();
    if (speaking === m.id) { setSpeaking(null); return; }
    setSpeaking(m.id);
    speech.current = speak(m.text, locale, () => setSpeaking((cur) => (cur === m.id ? null : cur)));
  }
  const [messages, setMessages] = useState<TutorMessage[]>(initial);
  const [chips, setChips] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  // Последнее «посмотри сюда» наставника: подсветка в тренажёре и кнопка, чтобы повторить её.
  const [point, setPoint] = useState<{ id: string; target: string; note: string } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const seedAt = useRef(0);
  // Ответы из истории стоят сразу; только новый проявляется по абзацам.
  const seen = useRef(new Set(initial.map((m) => m.id)));
  const hints = messages.filter((m) => m.role === 'tutor' && m.hintLevel !== null).reduce((a, m) => Math.max(a, m.hintLevel ?? 0), 0);

  const send = async (mode: Mode, question: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    if (question.trim()) setMessages((m) => [...m, { id: `tmp${Date.now()}`, role: 'student', text: question.trim(), hintLevel: null, at: new Date().toISOString(), blockId: null }]);
    setText('');
    const draft = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('.learn-task textarea, .learn-task input[type="text"]')?.value ?? '';
    // Наставник видит не только текст шага, но и то, что студент сейчас выставил в тренажёре.
    const simState = await describeSimScreens(simFrames());
    setOptions([]);
    const res = await callApi<{ student: TutorMessage | null; tutor: TutorMessage; chips: string[]; options: string[]; point: { target: string; note: string } | null }>(
      '/api/learn/tutor', 'POST', { topicId, mode, question, blockIds: stepBlockIds, draftAnswer: draft, simState });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMessages((m) => [...m.filter((x) => !x.id.startsWith('tmp')), ...(res.data.student ? [res.data.student] : []), res.data.tutor]);
    setChips(res.data.chips);
    setOptions(res.data.options ?? []);
    const p = res.data.point ? { id: res.data.tutor.id, ...res.data.point } : null;
    setPoint(p);
    if (p) void highlightInSims(simFrames(), p.target, p.note);
  };

  // Кнопки в самом уроке («Объясни проще», «Подскажи») открывают наставника и спрашивают за студента.
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
          <div key={m.id} className={m.role === 'student' ? 'tutor-msg me' : seen.current.has(m.id) ? 'tutor-msg' : 'tutor-msg fresh'}>
            {m.role === 'tutor' && m.hintLevel !== null && <span className="tutor-hint-badge">{t('hintBadge', { n: m.hintLevel })}</span>}
            {m.role === 'tutor' ? <Markup text={m.text} /> : <p>{m.text}</p>}
            {m.plot && <TutorPlotView plot={m.plot} />}
            {m.role === 'tutor' && (
              <button type="button" className={speaking === m.id ? 'tutor-speak on' : 'tutor-speak'} onClick={() => toggleSpeak(m)}
                aria-pressed={speaking === m.id} title={t(speaking === m.id ? 'speakStop' : 'speak')} aria-label={t(speaking === m.id ? 'speakStop' : 'speak')}>
                <IconSound size={14} />
              </button>
            )}
            {point?.id === m.id && (
              <button type="button" className="tutor-point" onClick={() => void highlightInSims(simFrames(), point.target, point.note)}>
                {t('showInSim', { target: point.target })}
              </button>
            )}
          </div>
        ))}
        {busy && <div className="tutor-msg typing"><span /><span /><span /></div>}
        {error && <p className="error-box" role="alert">{f.message(error)}</p>}
      </div>

      {options.length > 0 && !busy && (
        <div className="tutor-options" role="group" aria-label={t('answerOptions')}>
          {options.map((o) => <button key={o} type="button" className="tutor-option" onClick={() => void send('check', o)}>{o}</button>)}
        </div>
      )}

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

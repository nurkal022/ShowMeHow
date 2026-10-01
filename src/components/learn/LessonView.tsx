'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { StudentBlockBody } from '@/lib/lms/block-schema';
import type { StudentSubmission } from '@/lib/lms/answers';
import type { TopicProgress } from '@/lib/lms/learn-view';
import type { Comment } from '@/lib/lms/discussion-types';
import type { TutorMessage } from '@/lib/lms/tutor';
import type { StepNote } from '@/lib/lms/notes';
import { buildSteps, stepState, type Step, type StepKind, type StepState } from '@/lib/lms/steps';
import { learnCourseHref, learnTopicHref } from '@/lib/lms/links';
import { useLocale, useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import { learnDue } from './format';
import { callApi } from '@/components/cabinet/api';
import LessonBlock from './LessonBlock';
import SlideDeck from './SlideDeck';
import ExamTimer from './ExamTimer';
import Discussion from './Discussion';
import Tutor from './Tutor';
import StepNotes from './StepNotes';
import {
  IconBack, IconCheck, IconChevron, IconLab, IconPlay, IconTask, IconText,
} from '@/components/icons';
import { IconList } from '@/components/cabinet/icons';

export interface LessonBlockData { id: string; body: StudentBlockBody; missing: boolean; submission: StudentSubmission | null }

const STEP_ICON: Record<StepKind, (n: number) => React.ReactNode> = {
  theory: (n) => <IconText size={n} />, sim: (n) => <IconPlay size={n} />, lab: (n) => <IconLab size={n} />, task: (n) => <IconTask size={n} />,
};

/**
 * Урок глазами ученика: слева оглавление курса, в центре — шаги (теория, тренажёр,
 * задание) по одному, справа — наставник. Пройденные шаги отмечаются сами, место
 * в уроке живёт в адресе (?step=), поэтому его можно переслать и вернуться.
 */
export default function LessonView({
  course, topic, topics, blocks, viewedIds, preview, exam, comments, tutorMessages, notes, canDeleteAny, me,
}: {
  course: { id: string; title: string; subject: string };
  topic: { id: string; title: string; index: number; format: string; dueAt: string | null };
  topics: TopicProgress[];
  blocks: LessonBlockData[];
  viewedIds: string[];
  preview: boolean;
  /** Контрольная: шагов нет, задания идут списком, время идёт. */
  exam: { deadline: string | null; over: boolean; finished: boolean } | null;
  comments: Comment[];
  me: string;
  tutorMessages: TutorMessage[];
  /** Заметки и закладки ученика по шагам этой темы. */
  notes: StepNote[];
  canDeleteAny: boolean;
}) {
  const t = useT(learnLesson);
  const tl = useT(learn);
  const locale = useLocale();
  const steps = useMemo(() => buildSteps(blocks.map((b) => ({ id: b.id, body: b.body }))), [blocks]);
  const answers = useMemo(
    () => new Map(blocks.flatMap((b) => (b.submission ? [[b.id, { status: b.submission.status }] as const] : []))),
    [blocks]);
  const [viewed, setViewed] = useState<Set<string>>(() => new Set(viewedIds));
  const [noteMap, setNoteMap] = useState<Map<string, { body: string; bookmarked: boolean }>>(
    () => new Map(notes.map((n) => [n.blockId, { body: n.body, bookmarked: n.bookmarked }])));
  const [current, setCurrent] = useState(0);
  const [nav, setNav] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorSeed, setTutorSeed] = useState<{ mode: 'hint' | 'explain' | 'check' | 'ask'; question: string; at: number } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // Место в уроке — в адресе: ссылку можно переслать, а возврат «назад» не сбрасывает шаг.
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('step'));
    if (Number.isInteger(n) && n >= 1) setCurrent(Math.min(steps.length - 1, n - 1));
    // Ссылка вида #block-<id> (из заметок и «проверено недавно») открывает шаг с этим блоком.
    const anchor = window.location.hash.replace('#block-', '');
    if (anchor) {
      const i = steps.findIndex((s) => s.blockIds.includes(anchor));
      if (i >= 0) setCurrent(i);
    }
    try { setTutorOpen(localStorage.getItem('tesseract.tutor.open') !== '0'); } catch { /* приватный режим */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = steps[current];
  const shown = exam || topic.format === 'slides' ? blocks : blocks.filter((b) => step?.blockIds.includes(b.id));

  // Открытый шаг отмечается пройденным: прогресс курса считается по шагам, а не по теме.
  useEffect(() => {
    if (preview || shown.length === 0) return;
    const ids = shown.map((b) => b.id).filter((id) => !viewed.has(id));
    if (ids.length === 0) return;
    const t = setTimeout(() => {
      setViewed((v) => new Set([...v, ...ids]));
      void callApi('/api/learn/steps', 'POST', { blockIds: ids });
    }, 1200);
    return () => clearTimeout(t);
  }, [preview, shown, viewed]);

  const go = useCallback((i: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, i));
    setCurrent(next);
    setNav(false);
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(next + 1));
    window.history.replaceState(null, '', url);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, go]);

  const stateOf = (s: Step): StepState => stepState(s, viewed, answers);
  const doneCount = steps.filter((s) => stateOf(s) === 'done').length;
  const percent = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const prevTopic = topics[topic.index - 1];
  const nextTopic = topics[topic.index + 1];
  const due = topic.dueAt && !preview ? learnDue(topic.dueAt, locale) : null;
  // Шаг без своего заголовка buildSteps называет «Теория», «Задание»… — такие названия переводим.
  const titleOf = (s: Step) => (s.title === learn.ru[`step_${s.kind}`] ? tl(`step_${s.kind}`) : s.title);
  const courseDone = topics.filter((t) => t.state === 'done').length;

  function askTutor(mode: 'hint' | 'explain' | 'check' | 'ask', question: string) {
    setTutorOpen(true);
    setTutorSeed({ mode, question, at: Date.now() });
  }

  return (
    <div className={`lv${tutorOpen ? ' with-tutor' : ''}${nav ? ' nav-open' : ''}`}>
      <aside className="lv-side" aria-label={t('sideAria')}>
        <Link className="lv-side-course" href={learnCourseHref(course.id, preview)}>
          <IconBack size={15} /><span>{course.title}</span>
        </Link>
        <div className="lv-side-progress">
          <div className="lv-bar"><i style={{ width: `${topics.length ? Math.round((courseDone / topics.length) * 100) : 0}%` }} /></div>
          <span className="muted">{t('courseTopicsDone', { done: courseDone, n: topics.length })}</span>
        </div>
        <ol className="lv-topics">
          {topics.map((tp, i) => {
            const here = tp.topicId === topic.id;
            return (
              <li key={tp.topicId} className={`${here ? 'here' : ''} ${tp.state}`}>
                <Link href={learnTopicHref(tp.topicId, preview)} aria-current={here ? 'page' : undefined}>
                  <span className="lv-topic-dot">{tp.state === 'done' ? <IconCheck size={12} /> : i + 1}</span>
                  <span className="lv-topic-text">
                    <b>{tp.title}</b>
                    <small>{tp.assignmentsTotal > 0 ? t('topicTasks', { done: tp.assignmentsDone, n: tp.assignmentsTotal }) : t('noTasks')}</small>
                  </span>
                </Link>
                {here && steps.length > 0 && !exam && (
                  <ol className="lv-substeps">
                    {steps.map((s, si) => {
                      const st = stateOf(s);
                      return (
                        <li key={s.id}>
                          <button type="button" className={`lv-substep s-${st}${si === current ? ' current' : ''}`} onClick={() => go(si)}>
                            <span className="lv-substep-icon">{st === 'done' ? <IconCheck size={11} /> : STEP_ICON[s.kind](12)}</span>
                            <span>{titleOf(s)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      </aside>
      <button type="button" className="lv-scrim" aria-label={t('closeContents')} onClick={() => setNav(false)} />

      <main className="lv-main">
        <div className="lv-top" ref={top}>
          <div className="lv-top-row">
            <button type="button" className="btn btn-sm btn-ghost lv-nav-toggle" onClick={() => setNav((v) => !v)}>
              <IconList size={16} />{t('contents')}
            </button>
            <span className="lv-crumb">
              <span className="muted">{t('topicOf', { i: topic.index + 1, n: topics.length })}</span>
              <b>{topic.title}</b>
            </span>
            {exam?.deadline && !exam.finished && <ExamTimer deadline={exam.deadline} />}
            {due && <span className={`learn-due ${due.tone}`}>{due.text}</span>}
            {!exam && steps.length > 0 && (
              <span className="lv-progress" title={t('stepsDone', { done: doneCount, n: steps.length })}>
                <span className="lv-bar"><i style={{ width: `${percent}%` }} /></span>
                <b>{doneCount}/{steps.length}</b>
              </span>
            )}
          </div>
          {!exam && steps.length > 1 && (
            <ol className="lv-strip" aria-label={t('stepsAria')}>
              {steps.map((s, i) => {
                const st = stateOf(s);
                return (
                  <li key={s.id}>
                    <button type="button" aria-current={i === current ? 'step' : undefined} title={`${tl(`step_${s.kind}`)}: ${titleOf(s)}`}
                      className={`lv-pill k-${s.kind} s-${st}${i === current ? ' current' : ''}`} onClick={() => go(i)}>
                      <span className="lv-pill-icon">{st === 'done' ? <IconCheck size={12} /> : STEP_ICON[s.kind](13)}</span>
                      <span className="lv-pill-num">{i + 1}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="lv-content">
          {preview && <p className="warn-banner">{t('previewBanner')}</p>}
          {exam?.over && <p className="warn-banner">{t('examOver')}</p>}
          {exam?.finished && !exam.over && <p className="ok-box">{t('examDone')}</p>}

          {!exam && step && (
            <header className="lv-step-head">
              <span className={`lv-step-kind k-${step.kind}`}>{STEP_ICON[step.kind](14)}{tl(`step_${step.kind}`)}</span>
              <h1>{titleOf(step)}</h1>
              <span className="muted">{t('stepOf', { i: current + 1, n: steps.length })}{step.points > 0 ? ` · ${tl('pointsN', { n: step.points })}` : ''}</span>
            </header>
          )}
          {exam && <header className="lv-step-head"><h1>{topic.title}</h1><span className="muted">{t('examWork')}</span></header>}

          {blocks.length === 0 && <p className="empty-state">{t('noMaterials')}</p>}

          <div className="lv-blocks" key={exam ? 'exam' : step?.id}>
            {topic.format === 'slides' && !exam
              ? <SlideDeck>{shown.map((b) => <LessonBlock key={b.id} blockId={b.id} body={b.body} preview={preview} missing={b.missing} submission={b.submission} />)}</SlideDeck>
              : shown.map((b) => (
                <div key={b.id} className="lv-block-wrap">
                  <LessonBlock blockId={b.id} body={b.body} preview={preview || (exam?.over ?? false)} missing={b.missing} submission={b.submission} />
                  {!preview && b.body.kind === 'assignment' && b.submission?.status !== 'graded' && b.submission?.status !== 'submitted' && (
                    <div className="lv-help">
                      <button type="button" className="lv-help-btn" onClick={() => askTutor('hint', '')}>{t('helpHint')}</button>
                      <button type="button" className="lv-help-btn" onClick={() => askTutor('check', t('askCheck'))}>{t('helpCheck')}</button>
                    </div>
                  )}
                </div>
              ))}
            {!preview && !exam && step?.kind === 'theory' && (
              <div className="lv-help lv-help-theory">
                <span className="muted">{t('unclear')}</span>
                <button type="button" className="lv-help-btn" onClick={() => askTutor('explain', t('askExplain'))}>{t('explainSimple')}</button>
                <button type="button" className="lv-help-btn" onClick={() => askTutor('ask', t('askWhere'))}>{t('whereInLife')}</button>
              </div>
            )}
          </div>

          {!preview && !exam && step && (
            <StepNotes blockId={step.blockIds[0]}
              body={noteMap.get(step.blockIds[0])?.body ?? ''}
              bookmarked={noteMap.get(step.blockIds[0])?.bookmarked ?? false}
              onChange={(n) => setNoteMap((m) => new Map(m).set(step.blockIds[0], n))} />
          )}

          {!exam && steps.length > 0 && (
            <nav className="lv-stepnav" aria-label={t('stepNavAria')}>
              <button type="button" className="btn btn-ghost" disabled={current === 0} onClick={() => go(current - 1)}>
                <IconChevron size={16} className="rot-left" />{t('back')}
              </button>
              <span className="muted lv-stepnav-hint">{t('stepNavHint')}</span>
              {current < steps.length - 1
                ? <button type="button" className="btn btn-primary" onClick={() => go(current + 1)}>{t('next')}<IconChevron size={16} /></button>
                : nextTopic
                  ? <Link className="btn btn-primary" href={learnTopicHref(nextTopic.topicId, preview)}>{t('nextTopic')}<IconChevron size={16} /></Link>
                  : <Link className="btn btn-primary" href={learnCourseHref(course.id, preview)}>{t('courseDone')}<IconCheck size={16} /></Link>}
            </nav>
          )}

          {current === steps.length - 1 && !preview && (
            <nav className="lv-topicnav" aria-label={t('topicNavAria')}>
              {prevTopic
                ? <Link className="learn-nav-card" href={learnTopicHref(prevTopic.topicId, preview)}><span className="learn-eyebrow">{t('prevTopicArrow')}</span><span>{prevTopic.title}</span></Link>
                : <span />}
              {nextTopic && <Link className="learn-nav-card next" href={learnTopicHref(nextTopic.topicId, preview)}><span className="learn-eyebrow">{t('nextTopicArrow')}</span><span>{nextTopic.title}</span></Link>}
            </nav>
          )}

          {/* В режиме «как видит ученик» учитель тоже видит обсуждение — чтобы ответить прямо отсюда. */}
          {(!preview || canDeleteAny) && <Discussion topicId={topic.id} initial={comments} canDeleteAny={canDeleteAny} me={me} />}
        </div>
      </main>

      {!preview && (
        <Tutor topicId={topic.id} open={tutorOpen} initial={tutorMessages} seed={tutorSeed}
          stepTitle={exam ? topic.title : step ? titleOf(step) : topic.title}
          stepBlockIds={shown.map((b) => b.id)}
          hasTask={shown.some((b) => b.body.kind === 'assignment')}
          onToggle={(v) => {
            setTutorOpen(v);
            try { localStorage.setItem('tesseract.tutor.open', v ? '1' : '0'); } catch { /* приватный режим */ }
          }} />
      )}
    </div>
  );
}

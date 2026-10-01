'use client';
import { formatNumber } from '@/i18n/core';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CoursePlan, PlanTopic } from '@/lib/lms/ai';
import { callApi } from '@/components/cabinet/api';
import { courseEditorHref, withOrgParam } from '@/lib/lms/links';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { teachCourse } from '@/i18n/messages/teach-course';
import { AiBusy } from './AiAssist';
import { formatClock } from '@/components/cabinet/useDraft';
import { IconArrowDown, IconArrowUp, IconCheck, IconPlus, IconSpark, IconTrash, IconUpload } from '@/components/icons';

type Step = 'program' | 'plan' | 'build';
type TopicState = 'wait' | 'work' | 'done' | 'error';
interface EditTopic extends PlanTopic { key: string }
interface Built { id: string; title: string; format: string; state: TopicState; created?: number; error?: string }

let seq = 0;
const key = () => `t${++seq}`;
/** Сколько тем наполняем одновременно: быстрее, но не заваливаем провайдера. */
const PARALLEL = 2;

/**
 * Мастер «Курс из программы»: программа → план (правится) → курс с темами, которые
 * помощник наполняет по очереди. Уйти можно в любой момент: пустые темы останутся,
 * их можно дополнить в редакторе кнопкой «Собрать урок с помощником».
 */
export default function CourseFromProgram({ org, groups }: { org: string; groups: { id: string; title: string }[] }) {
  const tr = useT(teachCourse);
  const fmt = useFormat();
  const locale = useLocale();
  const EXAMPLE = tr('example');
  const [step, setStep] = useState<Step>('program');
  const [program, setProgram] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [weeks, setWeeks] = useState('');
  const [wishes, setWishes] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Omit<CoursePlan, 'topics'> | null>(null);
  const [topics, setTopics] = useState<EditTopic[]>([]);
  const [fill, setFill] = useState(true);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [built, setBuilt] = useState<Built[]>([]);
  const file = useRef<HTMLInputElement>(null);
  // Черновик мастера: программа и поправленный план переживают закрытие вкладки.
  const draftKey = `tesseract.program-draft.${org}`;
  const [restored, setRestored] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
      if (d && typeof d.program === 'string') {
        setProgram(d.program); setSubject(d.subject ?? ''); setGrade(d.grade ?? ''); setWeeks(d.weeks ?? ''); setWishes(d.wishes ?? '');
        setGroupIds(Array.isArray(d.groupIds) ? d.groupIds : []);
        if (d.plan && Array.isArray(d.topics)) { setPlan(d.plan); setTopics(d.topics); setStep('plan'); }
        setRestored(d.at);
      }
    } catch { /* испорченный черновик */ }
    setLoaded(true);
  }, [draftKey]);
  useEffect(() => {
    if (!loaded || step === 'build' || (!program.trim() && !plan)) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), program, subject, grade, weeks, wishes, groupIds, plan, topics })); } catch { /* не беда */ }
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, step, draftKey, program, subject, grade, weeks, wishes, groupIds, plan, topics]);
  function startOver() {
    try { localStorage.removeItem(draftKey); } catch { /* не беда */ }
    setRestored(null); setProgram(''); setPlan(null); setTopics([]); setStep('program');
  }

  async function readFile(f: File) {
    if (f.size > 400_000) return setError(tr('fileTooBig'));
    if (!/\.(txt|md|csv|tsv)$/i.test(f.name) && !f.type.startsWith('text/')) {
      return setError(tr('fileNotText'));
    }
    setProgram((await f.text()).slice(0, 12000));
    setError('');
  }

  async function makePlan() {
    setBusy(true);
    setError('');
    const res = await callApi<{ plan: CoursePlan }>('/api/teach/ai', 'POST', {
      action: 'plan', org, program, subject, grade, weeks: Number(weeks) || 0, wishes,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const { topics: t, ...rest } = res.data.plan;
    setPlan(rest);
    setTopics(t.map((x) => ({ ...x, key: key() })));
    setStep('plan');
  }

  const patch = (k: string, p: Partial<EditTopic>) => setTopics((ts) => ts.map((t) => (t.key === k ? { ...t, ...p } : t)));
  const move = (i: number, d: -1 | 1) => setTopics((ts) => {
    const j = i + d;
    if (j < 0 || j >= ts.length) return ts;
    const next = [...ts];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  async function build() {
    if (!plan) return;
    const clean = topics.filter((t) => t.title.trim());
    if (!plan.title.trim()) return setError(tr('nameIt'));
    if (clean.length === 0) return setError(tr('planEmpty'));
    setBusy(true);
    setError('');
    const res = await callApi<{ courseId: string; topics: { id: string; title: string; format: string }[] }>(
      '/api/teach/courses/from-plan', 'POST', {
        org, title: plan.title, subject: plan.subject, description: plan.description, groupIds,
        topics: clean.map((t) => ({ title: t.title, format: t.format })),
      });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setCourseId(res.data.courseId);
    try { localStorage.removeItem(draftKey); } catch { /* не беда */ }
    const list: Built[] = res.data.topics.map((t) => ({ ...t, state: fill ? 'wait' : 'done' }));
    setBuilt(list);
    setStep('build');
    if (!fill) return;
    const goals = new Map(clean.map((t, i) => [res.data.topics[i]?.id, t.goals]));
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const t = list[next++];
        setBuilt((b) => b.map((x) => (x.id === t.id ? { ...x, state: 'work' } : x)));
        const r = await callApi<{ created: number }>('/api/teach/ai', 'POST', {
          action: 'lesson', topicId: t.id, topic: t.title, grade: plan.grade, exam: t.format === 'exam',
          wishes: [goals.get(t.id), wishes].filter(Boolean).join('. '),
        });
        setBuilt((b) => b.map((x) => (x.id === t.id
          ? r.ok ? { ...x, state: 'done', created: r.data.created } : { ...x, state: 'error', error: r.error } : x)));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  }

  const done = built.filter((b) => b.state === 'done' || b.state === 'error').length;
  const percent = built.length ? Math.round((done / built.length) * 100) : 0;
  const stepIndex = { program: 0, plan: 1, build: 2 }[step];

  return (
    <div className="cfp">
      {restored && step !== 'build' && (
        <div className="cs-restored" role="status">
          <span><b>{tr('restoredDraft', { time: formatClock(restored) })}</b> {tr('continueHint')}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={startOver}>{tr('startOver')}</button>
        </div>
      )}
      <ol className="cfp-steps" aria-label={tr('steps')}>
        {[tr('stepProgram'), tr('stepPlan'), tr('stepBuild')].map((label, i) => (
          <li key={label} className={i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}>
            <span>{i < stepIndex ? <IconCheck size={14} /> : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 'program' && (
        <section className="cab-card cfp-card">
          {busy ? <AiBusy text={tr('readingProgram')} /> : (
            <>
              <div className="cfp-program">
                <label className="field"><span>{tr('programLabel')}</span>
                  <textarea className="input cfp-textarea" rows={12} value={program} maxLength={12000}
                    placeholder={EXAMPLE} onChange={(e) => setProgram(e.target.value)} />
                </label>
                <div className="cfp-program-tools">
                  <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}><IconUpload size={15} />{tr('uploadTxt')}</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setProgram(EXAMPLE)}>{tr('insertExample')}</button>
                  <span className="muted">{formatNumber(program.length, locale)} / {formatNumber(12000, locale)}</span>
                  <input ref={file} type="file" accept=".txt,.md,.csv,.tsv,text/*" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
                </div>
              </div>
              <div className="cfp-grid">
                <label className="field"><span>{tr('subject')}</span><input className="input" value={subject} maxLength={60} placeholder={tr('subjectAuto')} onChange={(e) => setSubject(e.target.value)} /></label>
                <label className="field"><span>{tr('grade')}</span><input className="input" value={grade} maxLength={40} placeholder={tr('gradePh')} onChange={(e) => setGrade(e.target.value)} /></label>
                <label className="field"><span>{tr('lessonsApprox')}</span><input className="input" value={weeks} inputMode="numeric" maxLength={2} placeholder={tr('byProgram')} onChange={(e) => setWeeks(e.target.value.replace(/\D/g, ''))} /></label>
              </div>
              <label className="field"><span>{tr('wishes')}</span>
                <input className="input" value={wishes} maxLength={800} placeholder={tr('wishesProgramPh')} onChange={(e) => setWishes(e.target.value)} />
              </label>
              {groups.length > 0 && (
                <fieldset className="cfp-groups">
                  <legend>{tr('openToGroups')}</legend>
                  {groups.map((g) => (
                    <label key={g.id} className={groupIds.includes(g.id) ? 'chip-toggle on' : 'chip-toggle'}>
                      <input type="checkbox" checked={groupIds.includes(g.id)}
                        onChange={(e) => setGroupIds((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id)))} />
                      {g.title}
                    </label>
                  ))}
                  <span className="muted">{tr('draftNote')}</span>
                </fieldset>
              )}
              {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}
              <div className="cfp-actions">
                <button type="button" className="btn btn-primary ai-btn" disabled={program.trim().length < 20} onClick={makePlan}>
                  <IconSpark size={16} />{tr('makePlan')}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 'plan' && plan && (
        <section className="cab-card cfp-card">
          {busy ? <AiBusy text={tr('creatingCourse')} /> : (
            <>
              <div className="cfp-grid cfp-grid-2">
                <label className="field"><span>{tr('courseName')}</span><input className="input" value={plan.title} maxLength={200} onChange={(e) => setPlan({ ...plan, title: e.target.value })} /></label>
                <label className="field"><span>{tr('subject')}</span><input className="input" value={plan.subject} maxLength={60} onChange={(e) => setPlan({ ...plan, subject: e.target.value })} /></label>
              </div>
              <label className="field"><span>{tr('description')}</span>
                <textarea className="input" rows={2} value={plan.description} maxLength={2000} onChange={(e) => setPlan({ ...plan, description: e.target.value })} />
              </label>
              <div className="cfp-plan-head">
                <h2>{tr('topics', { n: topics.length })}</h2>
                <span className="muted">{tr('planHint')}</span>
              </div>
              <ol className="cfp-topics">
                {topics.map((t, i) => (
                  <li key={t.key} className={t.format === 'exam' ? 'exam' : ''}>
                    <span className="cfp-num">{i + 1}</span>
                    <div className="cfp-topic-body">
                      <input className="input cfp-topic-title" value={t.title} maxLength={200} aria-label={tr('topicN', { n: i + 1 })}
                        onChange={(e) => patch(t.key, { title: e.target.value })} />
                      <textarea className="input cfp-topic-goals" rows={2} value={t.goals} maxLength={600} placeholder={tr('goalsPh')}
                        aria-label={tr('goalsN', { n: i + 1 })} onChange={(e) => patch(t.key, { goals: e.target.value })} />
                    </div>
                    <div className="cfp-topic-tools">
                      <div className="segmented" role="group" aria-label={tr('format')}>
                        <button type="button" className={t.format === 'lesson' ? 'segmented-item active' : 'segmented-item'} onClick={() => patch(t.key, { format: 'lesson' })}>{tr('lessonCap')}</button>
                        <button type="button" className={t.format === 'exam' ? 'segmented-item active' : 'segmented-item'} onClick={() => patch(t.key, { format: 'exam' })}>{tr('examCap')}</button>
                      </div>
                      <span className="cfp-icon-row">
                        <button type="button" className="cab-icon-btn" aria-label={tr('up')} disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={16} /></button>
                        <button type="button" className="cab-icon-btn" aria-label={tr('down')} disabled={i === topics.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={16} /></button>
                        <button type="button" className="cab-icon-btn" aria-label={tr('removeTopic')} onClick={() => setTopics((ts) => ts.filter((x) => x.key !== t.key))}><IconTrash size={16} /></button>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <button type="button" className="btn btn-sm" onClick={() => setTopics((ts) => [...ts, { key: key(), title: '', goals: '', format: 'lesson', hours: 1 }])}>
                <IconPlus size={15} />{tr('addTopic')}
              </button>
              <label className="cfp-fill">
                <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
                <span><b>{tr('fillNow')}</b>{tr('fillNowText', { n: Math.max(1, Math.round((topics.length * 40) / PARALLEL / 60)) })}</span>
              </label>
              {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}
              <div className="cfp-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep('program')}>{tr('back')}</button>
                <button type="button" className="btn btn-primary ai-btn" onClick={build}><IconSpark size={16} />{tr('createCourse')}</button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 'build' && courseId && (
        <section className="cab-card cfp-card">
          <div className="cfp-build-head">
            <div>
              <h2>{percent === 100 ? tr('courseReady') : tr('aiBuilds')}</h2>
              <span className="muted">{tr('buildHint', { done, total: built.length })}</span>
            </div>
            <b className="cfp-percent">{percent}%</b>
          </div>
          <div className="cfp-bar"><i style={{ width: `${percent}%` }} /></div>
          <ol className="cfp-build">
            {built.map((b) => (
              <li key={b.id} className={`s-${b.state}`}>
                <span className="cfp-state" aria-hidden="true">{b.state === 'done' ? <IconCheck size={14} /> : b.state === 'error' ? '!' : ''}</span>
                <span className="cfp-build-title">{b.title}{b.format === 'exam' && <small className="chip-sm">{tr('exam')}</small>}</span>
                <span className="muted">
                  {b.state === 'wait' ? tr('sWait') : b.state === 'work' ? tr('sWork') : b.state === 'error' ? fmt.message(b.error ?? '')
                    : b.created !== undefined ? tr('blocks', { n: b.created }) : tr('emptyTopic')}
                </span>
                {b.state === 'done' && <Link href={withOrgParam(courseEditorHref(courseId, b.id), org)} className="btn btn-sm btn-ghost">{tr('open')}</Link>}
              </li>
            ))}
          </ol>
          <div className="cfp-actions">
            <Link className="btn btn-primary" href={withOrgParam(courseEditorHref(courseId), org)}>{tr('openInEditor')}</Link>
          </div>
        </section>
      )}
    </div>
  );
}

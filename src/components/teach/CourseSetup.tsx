'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlanTopic } from '@/lib/lms/ai';
import { courseStatusLabels, LIMITS, type Course, type TopicFormat } from '@/lib/lms/types';
import { courseEditorHref, learnCourseHref, withOrgParam } from '@/lib/lms/links';
import { coverStyle } from '@/lib/lms/covers';
import { callApi } from '@/components/cabinet/api';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { COURSE_GRADES, COURSE_SUBJECTS, teachCourse } from '@/i18n/messages/teach-course';
import { Ring } from '@/components/cabinet/viz';
import { LessonBuilderButton } from './LessonBuilder';
import { useConfirm, type ConfirmOptions } from '@/components/lms/ui/useConfirm';
import { formatClock, useDraft } from '@/components/cabinet/useDraft';
import {
  IconArrowDown, IconArrowUp, IconBook, IconCheck, IconEdit, IconEye, IconFold, IconHistory, IconLock, IconPlus, IconSpark, IconText,
  IconTrash, IconUndo,
} from '@/components/icons';
import { IconGroup } from '@/components/cabinet/icons';

interface SetupTopic { id: string; title: string; format: TopicFormat; blocks: number; tasks: number }
interface SetupGroup { id: string; title: string; students: number }
interface CourseDraft { title: string; subject: string; grade: string; description: string; groupIds: string[] }
interface Suggestion extends PlanTopic { key: string; on: boolean }
type Fill = 'wait' | 'work' | 'done' | 'error';

let seq = 0;

/**
 * Паспорт курса. Правки копятся в черновике (он живёт в браузере и переживает закрытие
 * вкладки) и уходят на сервер кнопкой «Сохранить» или Cmd/Ctrl+S. Темы и курс целиком
 * можно переименовать, переставить, удалить или отправить в архив прямо здесь.
 */
export default function CourseSetup({ course: initial, fresh, org, topics, groups, lockedGroups, selectedGroupIds }: {
  course: Course; fresh: boolean; org: string; topics: SetupTopic[];
  groups: SetupGroup[]; lockedGroups: SetupGroup[]; selectedGroupIds: string[];
}) {
  const router = useRouter();
  const t = useT(teachCourse);
  const fmt = useFormat();
  const locale = useLocale();
  const SUBJECTS = COURSE_SUBJECTS[locale];
  const GRADES = COURSE_GRADES[locale];
  const [course, setCourse] = useState(initial);
  const draft = useDraft<CourseDraft>(`tesseract.course-draft.${initial.id}`, {
    title: initial.title, subject: initial.subject, grade: initial.grade, description: initial.description, groupIds: selectedGroupIds,
  });
  const { title, subject, grade, description, groupIds: picked } = draft.value;
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [describing, setDescribing] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [autoPlan, setAutoPlan] = useState(false);
  const [ask, confirmDialog] = useConfirm();
  const planRef = useRef<HTMLElement>(null);
  const link = (href: string) => withOrgParam(href, org);

  async function patch(p: Record<string, unknown>): Promise<Course | null> {
    setError('');
    const res = await callApi<{ course: Course }>(`/api/teach/courses/${course.id}`, 'PATCH', p);
    if (!res.ok) { setError(res.error); return null; }
    setCourse(res.data.course);
    return res.data.course;
  }

  async function save(): Promise<boolean> {
    if (!title.trim()) { setError(t('needTitle')); return false; }
    setSaving(true);
    const next = await patch({ title, subject, grade, description, groupIds: picked });
    setSaving(false);
    if (!next) return false;
    draft.markSaved({ title: next.title, subject: next.subject, grade: next.grade, description: next.description, groupIds: picked });
    setSavedAt(Date.now());
    router.refresh();
    return true;
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saveRef.current(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function describe() {
    setDescribing(true);
    setError('');
    const res = await callApi<{ description: string }>('/api/teach/ai', 'POST', { action: 'describe', courseId: course.id, title, subject, grade });
    setDescribing(false);
    if (!res.ok) return setError(res.error);
    draft.set({ description: res.data.description });
  }

  async function fillAll() {
    if (!description.trim()) void describe();
    setPlanOpen(true);
    setAutoPlan(true);
    requestAnimationFrame(() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function setStatus(status: 'draft' | 'published' | 'archived') {
    if (draft.dirty && !(await save())) return;
    if (await patch({ status })) router.refresh();
  }

  async function removeCourse() {
    if (!(await ask({
      title: t('deleteCourseQ', { title: course.title }),
      text: t('deleteCourseText2'),
      confirmLabel: t('deleteCourse'), danger: true,
    }))) return;
    const res = await callApi(`/api/teach/courses/${course.id}`, 'DELETE');
    if (!res.ok) return setError(res.error);
    draft.discard();
    router.push(link('/teach/courses'));
  }

  const allFilled = topics.length > 0 && topics.every((x) => x.blocks > 0);
  const checks = [
    { ok: !!course.title.trim(), label: t('chkTitle') },
    { ok: !!course.subject && !!course.grade, label: t('chkSubject') },
    { ok: !!course.description.trim(), label: t('chkDesc') },
    { ok: topics.length > 0, label: t('chkPlan') },
    { ok: allFilled, label: t('chkFilled') },
    { ok: selectedGroupIds.length + lockedGroups.length > 0, label: t('chkGroups') },
    { ok: course.status === 'published', label: t('chkPublished') },
  ];
  const ready = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const audience = [...groups.filter((g) => picked.includes(g.id)), ...lockedGroups];
  const students = audience.reduce((a, g) => a + g.students, 0);

  return (
    <div className="cs">
      {draft.restoredAt && (
        <div className="cs-restored" role="status">
          <IconHistory size={18} />
          <span><b>{t('restoredDraft', { time: formatClock(draft.restoredAt) })}</b> {t('restoredNote')}</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()}>{t('save')}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={draft.discard}>{t('discardDraft')}</button>
        </div>
      )}
      {fresh && !draft.restoredAt && (
        <section className="cs-welcome">
          <div>
            <span className="cs-welcome-kicker"><IconCheck size={15} />{t('created')}</span>
            <h2>{t('fillTitle', { title: course.title })}</h2>
            <p>{t('fillText')}</p>
          </div>
          <button type="button" className="btn btn-light" onClick={fillAll}><IconSpark size={16} />{t('fillWithAi')}</button>
        </section>
      )}

      <div className="cs-grid">
        <div className="cs-main">
          <section className="cab-card cs-card">
            <header className="cs-card-head"><span className="cs-num">1</span><div><h2>{t('basics')}</h2><span className="muted">{t('basicsSub')}</span></div></header>
            <label className="nx-field"><span>{t('courseName')}</span>
              <input className="input nc-title" value={title} maxLength={LIMITS.title} onChange={(e) => draft.set({ title: e.target.value })} />
            </label>
            <div className="nx-field"><span>{t('subject')}</span>
              <div className="nc-subjects">
                {SUBJECTS.map((s) => (
                  <button key={s} type="button" aria-pressed={subject === s} className={subject === s ? 'nc-subject on' : 'nc-subject'}
                    style={coverStyle(s)} onClick={() => draft.set({ subject: subject === s ? '' : s })}>{s}</button>
                ))}
                <input className="input nc-subject-own" value={SUBJECTS.includes(subject) ? '' : subject} maxLength={LIMITS.subject}
                  placeholder={t('otherPh')} aria-label={t('otherSubject')} onChange={(e) => draft.set({ subject: e.target.value })} />
              </div>
            </div>
            <div className="nx-field"><span>{t('grade')}</span>
              <div className="nq-grades">
                {GRADES.map((g) => (
                  <button key={g.value} type="button" aria-pressed={grade === g.value} className={grade === g.value ? 'nq-grade on' : 'nq-grade'}
                    onClick={() => draft.set({ grade: grade === g.value ? '' : g.value })}>{g.short}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="cab-card cs-card">
            <header className="cs-card-head">
              <span className="cs-num">2</span>
              <div><h2>{t('description')}</h2><span className="muted">{t('descriptionSub')}</span></div>
              <button type="button" className="btn btn-sm ai-btn" disabled={describing} onClick={describe}>
                <IconSpark size={15} />{describing ? t('writing') : description.trim() ? t('anotherVariant') : t('writeWithAi')}
              </button>
            </header>
            <div className={describing ? 'cs-desc writing' : 'cs-desc'}>
              <textarea className="input" rows={5} value={description} maxLength={LIMITS.description}
                placeholder={t('descriptionPh')}
                onChange={(e) => draft.set({ description: e.target.value })} />
              <span className="cs-counter">{description.length} / {LIMITS.description}</span>
            </div>
          </section>

          <section className="cab-card cs-card" ref={planRef}>
            <header className="cs-card-head">
              <span className="cs-num">3</span>
              <div><h2>{t('plan')}</h2><span className="muted">{topics.length ? t('planSub', { n: topics.length, filled: topics.filter((x) => x.blocks > 0).length }) : t('noTopics')}</span></div>
              {!planOpen && <button type="button" className="btn btn-sm ai-btn" onClick={() => setPlanOpen(true)}><IconSpark size={15} />{t('suggestPlan')}</button>}
            </header>
            {planOpen && (
              <PlanAssistant courseId={course.id} auto={autoPlan} hasTopics={topics.length > 0}
                onClose={() => { setPlanOpen(false); setAutoPlan(false); }} onAdded={() => router.refresh()} />
            )}
            {topics.length > 0 && (
              <ol className="cs-topics">
                {topics.map((x, i) => (
                  <TopicRow key={x.id} topic={x} index={i} total={topics.length} course={course} org={org} ask={ask}
                    onChanged={() => router.refresh()} onError={setError} />
                ))}
              </ol>
            )}
            <div className="cs-topic-actions">
              <AddTopic courseId={course.id} onAdded={() => router.refresh()} />
              <LessonBuilderButton courseId={course.id} subject={course.subject} variant="small" label={t('lessonWithAi')} onDone={() => router.refresh()} />
            </div>
          </section>

          <section className="cab-card cs-card">
            <header className="cs-card-head"><span className="cs-num">4</span><div><h2>{t('audience')}</h2><span className="muted">{t('audienceSub')}</span></div></header>
            {groups.length === 0 && lockedGroups.length === 0 ? (
              <p className="muted">{t('noGroups')}</p>
            ) : (
              <div className="cs-groups">
                {groups.map((g) => {
                  const on = picked.includes(g.id);
                  return (
                    <button key={g.id} type="button" aria-pressed={on} className={on ? 'cs-group on' : 'cs-group'}
                      onClick={() => draft.set({ groupIds: on ? picked.filter((x) => x !== g.id) : [...picked, g.id] })}>
                      <span className="cs-group-badge"><IconGroup size={16} /></span>
                      <b>{g.title}</b><small>{t('students', { n: g.students })}</small>
                      <span className="cs-group-check">{on ? <IconCheck size={14} /> : <IconPlus size={14} />}</span>
                    </button>
                  );
                })}
                {lockedGroups.map((g) => (
                  <span key={g.id} className="cs-group on locked" title={t('lockedGroup')}>
                    <span className="cs-group-badge"><IconLock size={15} /></span><b>{g.title}</b><small>{t('openedByAdmin')}</small>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="cab-card cs-card cs-danger">
            <header className="cs-card-head"><span className="cs-num">5</span><div><h2>{t('manage')}</h2><span className="muted">{t('manageSub')}</span></div></header>
            <div className="cs-danger-row">
              {course.status === 'archived'
                ? <button type="button" className="btn" onClick={() => setStatus('draft')}><IconUndo size={16} />{t('restore')}</button>
                : <button type="button" className="btn" onClick={() => setStatus('archived')}><IconFold size={16} />{t('sendArchive')}</button>}
              <button type="button" className="btn cs-delete" onClick={removeCourse}><IconTrash size={16} />{t('deleteCourse')}</button>
            </div>
          </section>
        </div>

        <aside className="cs-side">
          <div className="nc-card">
            <div className="course-tile-cover" style={coverStyle(subject || title || 'курс')}>
              <span className="course-tile-glyph">{(subject || title || t('colCourse')).slice(0, 1).toUpperCase()}</span>
              <span className="course-tile-subject">{subject || t('subjectPh')}{grade ? ` · ${grade}` : ''}</span>
            </div>
            <div className="nc-card-body">
              <span className={course.status === 'published' ? 'status-pill ok' : 'status-pill'}>{courseStatusLabels(locale)[course.status]}</span>
              <h3>{title.trim() || t('namePlaceholder')}</h3>
              <p className="muted">{description.trim() || t('descAppears')}</p>
              <div className="chip-row">
                <span className="chip-sm">{t('topics', { n: topics.length })}</span>
                {audience.length ? audience.map((g) => <span key={g.id} className="chip-sm">{g.title}</span>) : <span className="chip-sm warn">{t('notOpened')}</span>}
              </div>
            </div>
          </div>

          <div className={draft.dirty ? 'cab-card cs-savecard dirty' : 'cab-card cs-savecard'}>
            {draft.dirty ? (
              <>
                <div className="cs-savecard-state"><span className="cs-pulse" /><div><b>{t('unsaved')}</b>
                  <span className="muted">{draft.draftAt ? t('draftOnDevice', { time: formatClock(draft.draftAt) }) : t('draftSaving')}</span></div></div>
                <div className="cs-savecard-actions">
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}><IconCheck size={16} />{saving ? t('saving') : t('save')}</button>
                  <button type="button" className="btn btn-ghost" disabled={saving} onClick={draft.discard}>{t('undo')}</button>
                </div>
                <small className="muted">{t('saveKeys')}</small>
              </>
            ) : (
              <div className="cs-savecard-state ok"><IconCheck size={18} /><div><b>{t('allSaved')}</b>
                <span className="muted">{savedAt ? t('savedAt', { time: formatClock(savedAt) }) : t('canClose')}</span></div></div>
            )}
          </div>

          <div className="cab-card cs-ready">
            <div className="cs-ready-head">
              <Ring value={ready} size={58} stroke={6} tone={ready === 100 ? 'var(--success)' : 'var(--accent)'} label={t('readyRing', { n: ready })} />
              <div><b>{t('readiness')}</b><span className="muted">{ready === 100 ? t('allReady') : t('stepsLeft', { n: checks.filter((c) => !c.ok).length })}</span></div>
            </div>
            <ul className="cs-checks">
              {checks.map((c) => <li key={c.label} className={c.ok ? 'ok' : ''}><span>{c.ok ? <IconCheck size={12} /> : ''}</span>{c.label}</li>)}
            </ul>
            {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}
            <div className="cs-ready-actions">
              {course.status === 'published'
                ? <button type="button" className="btn" onClick={() => setStatus('draft')}>{t('unpublish')}</button>
                : <button type="button" className="btn btn-primary" disabled={topics.length === 0 || course.status === 'archived'} onClick={() => setStatus('published')}>{t('publish')}</button>}
              <Link className="btn" href={link(courseEditorHref(course.id))}><IconText size={16} />{t('lessonEditor')}</Link>
              <a className="btn btn-ghost" href={learnCourseHref(course.id, true)} target="_blank" rel="noopener noreferrer"><IconEye size={16} />{t('studentView')}</a>
            </div>
            {students > 0 && <p className="muted cs-audience">{t('willSee', { n: students })}</p>}
          </div>
        </aside>
      </div>
      {draft.dirty && (
        <div className="cs-savebar" role="status">
          <span className="cs-pulse" />
          <span>{draft.draftAt ? t('unsavedBarDraft', { time: formatClock(draft.draftAt) }) : t('unsavedBar')}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={draft.discard}>{t('undo')}</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => void save()}>{saving ? t('saving') : t('save')}</button>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

/** Строка темы: переименовать, урок/контрольная, переставить, удалить — сразу на сервере. */
function TopicRow({ topic: t, index: i, total, course, org, ask, onChanged, onError }: {
  topic: SetupTopic; index: number; total: number; course: Course; org: string;
  ask: (o: ConfirmOptions) => Promise<boolean>; onChanged: () => void; onError: (e: string) => void;
}) {
  const tr = useT(teachCourse);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(t.title);
  const [busy, setBusy] = useState(false);
  async function act(method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) {
    setBusy(true);
    const res = await callApi(`/api/teach/topics/${t.id}`, method, body);
    setBusy(false);
    if (!res.ok) { onError(res.error); return false; }
    onChanged();
    return true;
  }
  async function remove() {
    if (!(await ask({
      title: tr('deleteTopicQ', { title: t.title }),
      text: t.blocks ? tr('deleteTopicText', { n: t.blocks }) : tr('deleteTopicEmpty'),
      confirmLabel: tr('deleteTopic'), danger: true,
    }))) return;
    await act('DELETE');
  }
  return (
    <li className={`${t.format === 'exam' ? 'exam' : ''}${busy ? ' busy' : ''}`}>
      <span className="cs-topic-num">{i + 1}</span>
      {editing ? (
        <form className="cs-rename" onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim() || value.trim() === t.title) return setEditing(false);
          if (await act('PATCH', { title: value })) setEditing(false);
        }}>
          <input className="input" value={value} autoFocus maxLength={LIMITS.title} aria-label={tr('newTopicName')}
            onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setValue(t.title); setEditing(false); } }} />
          <button type="submit" className="btn btn-sm btn-primary">{tr('save')}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setValue(t.title); setEditing(false); }}>{tr('cancel')}</button>
        </form>
      ) : (
        <div>
          <Link href={withOrgParam(courseEditorHref(course.id, t.id), org)}>{t.title}</Link>
          <small className="muted">{t.blocks ? tr('topicStats', { b: t.blocks, t: t.tasks }) : tr('emptyTopic')}</small>
        </div>
      )}
      {!editing && (
        <span className="cs-topic-tools">
          <button type="button" className={t.format === 'exam' ? 'chip-sm cs-format exam' : 'chip-sm cs-format'} title={tr('toggleFormat')}
            onClick={() => act('PATCH', t.format === 'exam' ? { format: 'lesson', timeLimitMin: null } : { format: 'exam', timeLimitMin: 40 })}>
            {t.format === 'exam' ? tr('exam') : t.format === 'slides' ? tr('slides') : tr('lesson')}
          </button>
          {t.blocks === 0
            ? <LessonBuilderButton courseId={course.id} subject={course.subject} topicId={t.id} topicTitle={t.title} variant="small" label={tr('buildLesson')} onDone={onChanged} />
            : <span className="cs-topic-ok" title={tr('lessonFilled')}><IconCheck size={14} /></span>}
          <span className="cs-topic-icons">
            <button type="button" className="cab-icon-btn" aria-label={tr('renameQ', { title: t.title })} title={tr('rename')} onClick={() => setEditing(true)}><IconEdit size={15} /></button>
            <button type="button" className="cab-icon-btn" aria-label={tr('up')} title={tr('up')} disabled={i === 0} onClick={() => act('PATCH', { move: 'up' })}><IconArrowUp size={15} /></button>
            <button type="button" className="cab-icon-btn" aria-label={tr('down')} title={tr('down')} disabled={i === total - 1} onClick={() => act('PATCH', { move: 'down' })}><IconArrowDown size={15} /></button>
            <button type="button" className="cab-icon-btn cs-del" aria-label={tr('deleteQ', { title: t.title })} title={tr('delete')} onClick={remove}><IconTrash size={15} /></button>
          </span>
        </span>
      )}
    </li>
  );
}

function AddTopic({ courseId, onAdded }: { courseId: string; onAdded: () => void }) {
  const t = useT(teachCourse);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}><IconPlus size={15} />{t('topic')}</button>;
  return (
    <form className="cs-add" onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return;
      setBusy(true);
      const res = await callApi(`/api/teach/courses/${courseId}/topics`, 'POST', { title });
      setBusy(false);
      if (res.ok) { setTitle(''); setOpen(false); onAdded(); }
    }}>
      <input className="input" autoFocus value={title} maxLength={LIMITS.title} placeholder={t('topicName')} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
      <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>{t('add')}</button>
    </form>
  );
}

/** Помощник плана: предлагает темы, учитель отмечает нужные — они создаются и, по желанию, наполняются уроками. */
function PlanAssistant({ courseId, auto, hasTopics, onClose, onAdded }: {
  courseId: string; auto: boolean; hasTopics: boolean; onClose: () => void; onAdded: () => void;
}) {
  const tr = useT(teachCourse);
  const fmt = useFormat();
  const [lessons, setLessons] = useState(8);
  const [wishes, setWishes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [fill, setFill] = useState(true);
  const [progress, setProgress] = useState<{ title: string; state: Fill }[] | null>(null);

  useEffect(() => { if (auto) void suggest(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [auto]);

  async function suggest() {
    setBusy(true);
    setError('');
    const res = await callApi<{ topics: PlanTopic[] }>('/api/teach/ai', 'POST', { action: 'outline', courseId, lessons, wishes });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setItems(res.data.topics.map((t) => ({ ...t, key: `p${++seq}`, on: true })));
  }

  const move = (i: number, d: -1 | 1) => setItems((xs) => {
    if (!xs) return xs;
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  async function add() {
    const chosen = (items ?? []).filter((x) => x.on && x.title.trim());
    if (!chosen.length) return setError(tr('pickOne'));
    setError('');
    const list = chosen.map((c) => ({ title: c.title, state: 'wait' as Fill }));
    setProgress(list);
    const created: { id: string; t: Suggestion }[] = [];
    for (const t of chosen) {
      const res = await callApi<{ topic: { id: string } }>(`/api/teach/courses/${courseId}/topics`, 'POST', { title: t.title });
      if (!res.ok) continue;
      if (t.format === 'exam') await callApi(`/api/teach/topics/${res.data.topic.id}`, 'PATCH', { format: 'exam', timeLimitMin: 40 });
      created.push({ id: res.data.topic.id, t });
    }
    if (!fill) { setProgress(null); setItems(null); onAdded(); onClose(); return; }
    let next = 0;
    const mark = (title: string, state: Fill) => setProgress((p) => p && p.map((x) => (x.title === title ? { ...x, state } : x)));
    const worker = async () => {
      while (next < created.length) {
        const { id, t } = created[next++];
        mark(t.title, 'work');
        const r = await callApi('/api/teach/ai', 'POST', { action: 'lesson', topicId: id, topic: t.title, wishes: t.goals, exam: t.format === 'exam' });
        mark(t.title, r.ok ? 'done' : 'error');
      }
    };
    await Promise.all([worker(), worker()]);
    onAdded();
  }

  if (progress) {
    const done = progress.filter((p) => p.state === 'done' || p.state === 'error').length;
    const pct = Math.round((done / progress.length) * 100);
    return (
      <div className="cs-plan">
        <div className="cfp-build-head"><div><b>{pct === 100 ? tr('lessonsReady') : tr('aiWritesLessons')}</b><span className="muted"> · {tr('doneOf', { done, total: progress.length })}</span></div><b className="cfp-percent">{pct}%</b></div>
        <div className="cfp-bar"><i style={{ width: `${pct}%` }} /></div>
        <ol className="cfp-build">
          {progress.map((p) => (
            <li key={p.title} className={`s-${p.state}`}>
              <span className="cfp-state" aria-hidden="true">{p.state === 'done' ? <IconCheck size={14} /> : p.state === 'error' ? '!' : ''}</span>
              <span className="cfp-build-title">{p.title}</span>
              <span className="muted">{p.state === 'wait' ? tr('sWait') : p.state === 'work' ? tr('sWork') : p.state === 'done' ? tr('sDone') : tr('sError')}</span>
              <span />
            </li>
          ))}
        </ol>
        {pct === 100 && <button type="button" className="btn btn-sm" onClick={() => { setProgress(null); setItems(null); onClose(); }}>{tr('done')}</button>}
      </div>
    );
  }

  return (
    <div className="cs-plan">
      <div className="cs-plan-form">
        <div className="nx-field"><span>{tr('howMany')}</span>
          <span className="lb-stepper">
            <button type="button" aria-label={tr('fewer')} disabled={lessons <= 2} onClick={() => setLessons((n) => n - 1)}>−</button>
            <span>{lessons}</span>
            <button type="button" aria-label={tr('more')} disabled={lessons >= 40} onClick={() => setLessons((n) => n + 1)}>+</button>
          </span>
        </div>
        <label className="nx-field cs-grow"><span>{tr('wishes')}</span>
          <input className="input" value={wishes} maxLength={800} placeholder={hasTopics ? tr('wishesPhMore') : tr('wishesPh')}
            onChange={(e) => setWishes(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary ai-btn" disabled={busy} onClick={suggest}><IconSpark size={15} />{busy ? tr('composing') : items ? tr('anotherOption') : tr('suggest')}</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{tr('hide')}</button>
      </div>
      {busy && <div className="cs-plan-skeleton">{[0, 1, 2, 3].map((i) => <i key={i} className="skeleton" />)}</div>}
      {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}
      {items && !busy && (
        <>
          <ol className="cs-suggest">
            {items.map((t, i) => (
              <li key={t.key} className={`${t.on ? '' : 'off'}${t.format === 'exam' ? ' exam' : ''}`}>
                <input type="checkbox" checked={t.on} aria-label={tr('takeTopic', { title: t.title })}
                  onChange={(e) => setItems((xs) => xs && xs.map((x) => (x.key === t.key ? { ...x, on: e.target.checked } : x)))} />
                <div>
                  <input className="cs-suggest-title" value={t.title} maxLength={200}
                    onChange={(e) => setItems((xs) => xs && xs.map((x) => (x.key === t.key ? { ...x, title: e.target.value } : x)))} />
                  <small className="muted">{t.goals}</small>
                </div>
                <button type="button" className={t.format === 'exam' ? 'chip-sm cs-format exam' : 'chip-sm cs-format'}
                  onClick={() => setItems((xs) => xs && xs.map((x) => (x.key === t.key ? { ...x, format: x.format === 'exam' ? 'lesson' : 'exam' } : x)))}>
                  {t.format === 'exam' ? tr('exam') : tr('lesson')}
                </button>
                <span className="cfp-icon-row">
                  <button type="button" className="cab-icon-btn" aria-label={tr('up')} disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={14} /></button>
                  <button type="button" className="cab-icon-btn" aria-label={tr('down')} disabled={i === items.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={14} /></button>
                  <button type="button" className="cab-icon-btn" aria-label={tr('remove')} onClick={() => setItems((xs) => xs && xs.filter((x) => x.key !== t.key))}><IconTrash size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
          <div className="cs-plan-foot">
            <label className="cs-fill"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
              <span><IconBook size={15} />{tr('writeLessonsNow')}</span></label>
            <button type="button" className="btn btn-primary" onClick={add}>
              <IconPlus size={16} />{tr('addTopics', { n: items.filter((x) => x.on).length })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

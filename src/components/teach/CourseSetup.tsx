'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlanTopic } from '@/lib/lms/ai';
import { COURSE_STATUS_LABELS, LIMITS, type Course, type TopicFormat } from '@/lib/lms/types';
import { courseEditorHref, learnCourseHref, withOrgParam } from '@/lib/lms/links';
import { coverStyle } from '@/lib/lms/covers';
import { ruPlural } from '@/lib/lms/format';
import { callApi } from '@/components/cabinet/api';
import { SUBJECTS } from '@/components/cabinet/NewCourseDialog';
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

const GRADES = ['5 класс', '6 класс', '7 класс', '8 класс', '9 класс', '10 класс', '11 класс', 'колледж'];
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
    if (!title.trim()) { setError('У курса должно быть название.'); return false; }
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
      title: `Удалить курс «${course.title}»?`,
      text: 'Удалятся все темы, уроки и задания курса. Вернуть их будет нельзя. Если по курсу уже есть ответы учеников, удалить его не получится — только в архив.',
      confirmLabel: 'Удалить курс', danger: true,
    }))) return;
    const res = await callApi(`/api/teach/courses/${course.id}`, 'DELETE');
    if (!res.ok) return setError(res.error);
    draft.discard();
    router.push(link('/teach/courses'));
  }

  const allFilled = topics.length > 0 && topics.every((t) => t.blocks > 0);
  const checks = [
    { ok: !!course.title.trim(), label: 'Название' },
    { ok: !!course.subject && !!course.grade, label: 'Предмет и класс' },
    { ok: !!course.description.trim(), label: 'Описание для учеников' },
    { ok: topics.length > 0, label: 'План тем' },
    { ok: allFilled, label: 'Уроки наполнены' },
    { ok: selectedGroupIds.length + lockedGroups.length > 0, label: 'Открыт группам' },
    { ok: course.status === 'published', label: 'Опубликован' },
  ];
  const ready = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const audience = [...groups.filter((g) => picked.includes(g.id)), ...lockedGroups];
  const students = audience.reduce((a, g) => a + g.students, 0);

  return (
    <div className="cs">
      {draft.restoredAt && (
        <div className="cs-restored" role="status">
          <IconHistory size={18} />
          <span><b>Восстановлен черновик от {formatClock(draft.restoredAt)}.</b> Эти правки ещё не сохранены в курсе.</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()}>Сохранить</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={draft.discard}>Отбросить черновик</button>
        </div>
      )}
      {fresh && !draft.restoredAt && (
        <section className="cs-welcome">
          <div>
            <span className="cs-welcome-kicker"><IconCheck size={15} />Курс создан</span>
            <h2>Осталось наполнить «{course.title}»</h2>
            <p>Не спешите: курс остаётся черновиком, пока вы его не опубликуете, а всё, что вы вводите, сохраняется в черновике — можно вернуться завтра.</p>
          </div>
          <button type="button" className="btn btn-light" onClick={fillAll}><IconSpark size={16} />Заполнить с помощником</button>
        </section>
      )}

      <div className="cs-grid">
        <div className="cs-main">
          <section className="cab-card cs-card">
            <header className="cs-card-head"><span className="cs-num">1</span><div><h2>Основное</h2><span className="muted">Название, предмет и класс — по ним помощник пишет уроки нужного уровня</span></div></header>
            <label className="nx-field"><span>Название курса</span>
              <input className="input nc-title" value={title} maxLength={LIMITS.title} onChange={(e) => draft.set({ title: e.target.value })} />
            </label>
            <div className="nx-field"><span>Предмет</span>
              <div className="nc-subjects">
                {SUBJECTS.map((s) => (
                  <button key={s} type="button" aria-pressed={subject === s} className={subject === s ? 'nc-subject on' : 'nc-subject'}
                    style={coverStyle(s)} onClick={() => draft.set({ subject: subject === s ? '' : s })}>{s}</button>
                ))}
                <input className="input nc-subject-own" value={SUBJECTS.includes(subject) ? '' : subject} maxLength={LIMITS.subject}
                  placeholder="другой…" aria-label="Другой предмет" onChange={(e) => draft.set({ subject: e.target.value })} />
              </div>
            </div>
            <div className="nx-field"><span>Класс</span>
              <div className="nq-grades">
                {GRADES.map((g) => (
                  <button key={g} type="button" aria-pressed={grade === g} className={grade === g ? 'nq-grade on' : 'nq-grade'}
                    onClick={() => draft.set({ grade: grade === g ? '' : g })}>{g.replace(' класс', '')}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="cab-card cs-card">
            <header className="cs-card-head">
              <span className="cs-num">2</span>
              <div><h2>Описание</h2><span className="muted">Его видят ученики и родители на странице курса</span></div>
              <button type="button" className="btn btn-sm ai-btn" disabled={describing} onClick={describe}>
                <IconSpark size={15} />{describing ? 'Пишу…' : description.trim() ? 'Другой вариант' : 'Написать с помощником'}
              </button>
            </header>
            <div className={describing ? 'cs-desc writing' : 'cs-desc'}>
              <textarea className="input" rows={5} value={description} maxLength={LIMITS.description}
                placeholder="О чём курс, что ученик будет понимать и уметь в конце, как устроены уроки"
                onChange={(e) => draft.set({ description: e.target.value })} />
              <span className="cs-counter">{description.length} / {LIMITS.description}</span>
            </div>
          </section>

          <section className="cab-card cs-card" ref={planRef}>
            <header className="cs-card-head">
              <span className="cs-num">3</span>
              <div><h2>План курса</h2><span className="muted">{topics.length ? `${topics.length} ${ruPlural(topics.length, 'тема', 'темы', 'тем')} · ${topics.filter((t) => t.blocks > 0).length} наполнено · темы сохраняются сразу` : 'Тем пока нет'}</span></div>
              {!planOpen && <button type="button" className="btn btn-sm ai-btn" onClick={() => setPlanOpen(true)}><IconSpark size={15} />Предложить план</button>}
            </header>
            {planOpen && (
              <PlanAssistant courseId={course.id} auto={autoPlan} hasTopics={topics.length > 0}
                onClose={() => { setPlanOpen(false); setAutoPlan(false); }} onAdded={() => router.refresh()} />
            )}
            {topics.length > 0 && (
              <ol className="cs-topics">
                {topics.map((t, i) => (
                  <TopicRow key={t.id} topic={t} index={i} total={topics.length} course={course} org={org} ask={ask}
                    onChanged={() => router.refresh()} onError={setError} />
                ))}
              </ol>
            )}
            <div className="cs-topic-actions">
              <AddTopic courseId={course.id} onAdded={() => router.refresh()} />
              <LessonBuilderButton courseId={course.id} subject={course.subject} variant="small" label="Урок с помощником" onDone={() => router.refresh()} />
            </div>
          </section>

          <section className="cab-card cs-card">
            <header className="cs-card-head"><span className="cs-num">4</span><div><h2>Кому открыт</h2><span className="muted">Ученики увидят курс, когда он будет опубликован</span></div></header>
            {groups.length === 0 && lockedGroups.length === 0 ? (
              <p className="muted">У вас пока нет групп — их назначает администратор организации.</p>
            ) : (
              <div className="cs-groups">
                {groups.map((g) => {
                  const on = picked.includes(g.id);
                  return (
                    <button key={g.id} type="button" aria-pressed={on} className={on ? 'cs-group on' : 'cs-group'}
                      onClick={() => draft.set({ groupIds: on ? picked.filter((x) => x !== g.id) : [...picked, g.id] })}>
                      <span className="cs-group-badge"><IconGroup size={16} /></span>
                      <b>{g.title}</b><small>{g.students} {ruPlural(g.students, 'ученик', 'ученика', 'учеников')}</small>
                      <span className="cs-group-check">{on ? <IconCheck size={14} /> : <IconPlus size={14} />}</span>
                    </button>
                  );
                })}
                {lockedGroups.map((g) => (
                  <span key={g.id} className="cs-group on locked" title="Эту группу открыл администратор организации">
                    <span className="cs-group-badge"><IconLock size={15} /></span><b>{g.title}</b><small>открыл администратор</small>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="cab-card cs-card cs-danger">
            <header className="cs-card-head"><span className="cs-num">5</span><div><h2>Управление курсом</h2><span className="muted">Архив прячет курс от учеников, но сохраняет ответы и оценки</span></div></header>
            <div className="cs-danger-row">
              {course.status === 'archived'
                ? <button type="button" className="btn" onClick={() => setStatus('draft')}><IconUndo size={16} />Вернуть из архива</button>
                : <button type="button" className="btn" onClick={() => setStatus('archived')}><IconFold size={16} />Отправить в архив</button>}
              <button type="button" className="btn cs-delete" onClick={removeCourse}><IconTrash size={16} />Удалить курс</button>
            </div>
          </section>
        </div>

        <aside className="cs-side">
          <div className="nc-card">
            <div className="course-tile-cover" style={coverStyle(subject || title || 'курс')}>
              <span className="course-tile-glyph">{(subject || title || 'К').slice(0, 1).toUpperCase()}</span>
              <span className="course-tile-subject">{subject || 'Предмет'}{grade ? ` · ${grade}` : ''}</span>
            </div>
            <div className="nc-card-body">
              <span className={course.status === 'published' ? 'status-pill ok' : 'status-pill'}>{COURSE_STATUS_LABELS[course.status]}</span>
              <h3>{title.trim() || 'Название курса'}</h3>
              <p className="muted">{description.trim() || 'Описание появится здесь.'}</p>
              <div className="chip-row">
                <span className="chip-sm">{topics.length} {ruPlural(topics.length, 'тема', 'темы', 'тем')}</span>
                {audience.length ? audience.map((g) => <span key={g.id} className="chip-sm">{g.title}</span>) : <span className="chip-sm warn">никому не открыт</span>}
              </div>
            </div>
          </div>

          <div className={draft.dirty ? 'cab-card cs-savecard dirty' : 'cab-card cs-savecard'}>
            {draft.dirty ? (
              <>
                <div className="cs-savecard-state"><span className="cs-pulse" /><div><b>Есть несохранённые правки</b>
                  <span className="muted">{draft.draftAt ? `Черновик на этом устройстве · ${formatClock(draft.draftAt)}` : 'Черновик сохраняется…'}</span></div></div>
                <div className="cs-savecard-actions">
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}><IconCheck size={16} />{saving ? 'Сохраняю…' : 'Сохранить'}</button>
                  <button type="button" className="btn btn-ghost" disabled={saving} onClick={draft.discard}>Отменить</button>
                </div>
                <small className="muted">Cmd/Ctrl + S — сохранить</small>
              </>
            ) : (
              <div className="cs-savecard-state ok"><IconCheck size={18} /><div><b>Всё сохранено</b>
                <span className="muted">{savedAt ? `в ${formatClock(savedAt)}` : 'Можно закрыть вкладку и вернуться позже'}</span></div></div>
            )}
          </div>

          <div className="cab-card cs-ready">
            <div className="cs-ready-head">
              <Ring value={ready} size={58} stroke={6} tone={ready === 100 ? 'var(--success)' : 'var(--accent)'} label={`Готовность курса ${ready}%`} />
              <div><b>Готовность курса</b><span className="muted">{ready === 100 ? 'Всё готово' : `${checks.filter((c) => !c.ok).length} ${ruPlural(checks.filter((c) => !c.ok).length, 'шаг', 'шага', 'шагов')} до запуска`}</span></div>
            </div>
            <ul className="cs-checks">
              {checks.map((c) => <li key={c.label} className={c.ok ? 'ok' : ''}><span>{c.ok ? <IconCheck size={12} /> : ''}</span>{c.label}</li>)}
            </ul>
            {error && <p className="error-box" role="alert">{error}</p>}
            <div className="cs-ready-actions">
              {course.status === 'published'
                ? <button type="button" className="btn" onClick={() => setStatus('draft')}>Снять с публикации</button>
                : <button type="button" className="btn btn-primary" disabled={topics.length === 0 || course.status === 'archived'} onClick={() => setStatus('published')}>Опубликовать</button>}
              <Link className="btn" href={link(courseEditorHref(course.id))}><IconText size={16} />Редактор уроков</Link>
              <a className="btn btn-ghost" href={learnCourseHref(course.id, true)} target="_blank" rel="noopener noreferrer"><IconEye size={16} />Глазами ученика</a>
            </div>
            {students > 0 && <p className="muted cs-audience">Увидят {students} {ruPlural(students, 'ученик', 'ученика', 'учеников')}</p>}
          </div>
        </aside>
      </div>
      {draft.dirty && (
        <div className="cs-savebar" role="status">
          <span className="cs-pulse" />
          <span>Несохранённые правки{draft.draftAt ? ` · черновик ${formatClock(draft.draftAt)}` : ''}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={draft.discard}>Отменить</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
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
      title: `Удалить тему «${t.title}»?`,
      text: t.blocks ? `Вместе с темой удалятся ${t.blocks} ${ruPlural(t.blocks, 'блок', 'блока', 'блоков')}, ответы учеников и оценки по ней. Вернуть их будет нельзя.` : 'Тема пустая — удалится только название.',
      confirmLabel: 'Удалить тему', danger: true,
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
          <input className="input" value={value} autoFocus maxLength={LIMITS.title} aria-label="Новое название темы"
            onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setValue(t.title); setEditing(false); } }} />
          <button type="submit" className="btn btn-sm btn-primary">Сохранить</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setValue(t.title); setEditing(false); }}>Отмена</button>
        </form>
      ) : (
        <div>
          <Link href={withOrgParam(courseEditorHref(course.id, t.id), org)}>{t.title}</Link>
          <small className="muted">{t.blocks ? `${t.blocks} ${ruPlural(t.blocks, 'блок', 'блока', 'блоков')} · ${t.tasks} ${ruPlural(t.tasks, 'задание', 'задания', 'заданий')}` : 'пустая тема'}</small>
        </div>
      )}
      {!editing && (
        <span className="cs-topic-tools">
          <button type="button" className={t.format === 'exam' ? 'chip-sm cs-format exam' : 'chip-sm cs-format'} title="Переключить: урок или контрольная"
            onClick={() => act('PATCH', t.format === 'exam' ? { format: 'lesson', timeLimitMin: null } : { format: 'exam', timeLimitMin: 40 })}>
            {t.format === 'exam' ? 'контрольная' : t.format === 'slides' ? 'слайды' : 'урок'}
          </button>
          {t.blocks === 0
            ? <LessonBuilderButton courseId={course.id} subject={course.subject} topicId={t.id} topicTitle={t.title} variant="small" label="Собрать урок" onDone={onChanged} />
            : <span className="cs-topic-ok" title="Урок наполнен"><IconCheck size={14} /></span>}
          <span className="cs-topic-icons">
            <button type="button" className="cab-icon-btn" aria-label={`Переименовать «${t.title}»`} title="Переименовать" onClick={() => setEditing(true)}><IconEdit size={15} /></button>
            <button type="button" className="cab-icon-btn" aria-label="Выше" title="Выше" disabled={i === 0} onClick={() => act('PATCH', { move: 'up' })}><IconArrowUp size={15} /></button>
            <button type="button" className="cab-icon-btn" aria-label="Ниже" title="Ниже" disabled={i === total - 1} onClick={() => act('PATCH', { move: 'down' })}><IconArrowDown size={15} /></button>
            <button type="button" className="cab-icon-btn cs-del" aria-label={`Удалить «${t.title}»`} title="Удалить" onClick={remove}><IconTrash size={15} /></button>
          </span>
        </span>
      )}
    </li>
  );
}

function AddTopic({ courseId, onAdded }: { courseId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}><IconPlus size={15} />Тема</button>;
  return (
    <form className="cs-add" onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return;
      setBusy(true);
      const res = await callApi(`/api/teach/courses/${courseId}/topics`, 'POST', { title });
      setBusy(false);
      if (res.ok) { setTitle(''); setOpen(false); onAdded(); }
    }}>
      <input className="input" autoFocus value={title} maxLength={LIMITS.title} placeholder="Название темы" onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
      <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>Добавить</button>
    </form>
  );
}

/** Помощник плана: предлагает темы, учитель отмечает нужные — они создаются и, по желанию, наполняются уроками. */
function PlanAssistant({ courseId, auto, hasTopics, onClose, onAdded }: {
  courseId: string; auto: boolean; hasTopics: boolean; onClose: () => void; onAdded: () => void;
}) {
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
    if (!chosen.length) return setError('Отметьте хотя бы одну тему.');
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
        <div className="cfp-build-head"><div><b>{pct === 100 ? 'Уроки готовы' : 'Помощник пишет уроки'}</b><span className="muted"> · {done} из {progress.length}</span></div><b className="cfp-percent">{pct}%</b></div>
        <div className="cfp-bar"><i style={{ width: `${pct}%` }} /></div>
        <ol className="cfp-build">
          {progress.map((p) => (
            <li key={p.title} className={`s-${p.state}`}>
              <span className="cfp-state" aria-hidden="true">{p.state === 'done' ? <IconCheck size={14} /> : p.state === 'error' ? '!' : ''}</span>
              <span className="cfp-build-title">{p.title}</span>
              <span className="muted">{p.state === 'wait' ? 'в очереди' : p.state === 'work' ? 'пишется…' : p.state === 'done' ? 'готово' : 'не получилось'}</span>
              <span />
            </li>
          ))}
        </ol>
        {pct === 100 && <button type="button" className="btn btn-sm" onClick={() => { setProgress(null); setItems(null); onClose(); }}>Готово</button>}
      </div>
    );
  }

  return (
    <div className="cs-plan">
      <div className="cs-plan-form">
        <div className="nx-field"><span>Сколько уроков</span>
          <span className="lb-stepper">
            <button type="button" aria-label="Меньше" disabled={lessons <= 2} onClick={() => setLessons((n) => n - 1)}>−</button>
            <span>{lessons}</span>
            <button type="button" aria-label="Больше" disabled={lessons >= 40} onClick={() => setLessons((n) => n + 1)}>+</button>
          </span>
        </div>
        <label className="nx-field cs-grow"><span>Пожелания</span>
          <input className="input" value={wishes} maxLength={800} placeholder={hasTopics ? 'Продолжить после имеющихся тем, добавить контрольную' : 'Первая четверть, больше лабораторных'}
            onChange={(e) => setWishes(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary ai-btn" disabled={busy} onClick={suggest}><IconSpark size={15} />{busy ? 'Составляю…' : items ? 'Ещё вариант' : 'Предложить'}</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Скрыть</button>
      </div>
      {busy && <div className="cs-plan-skeleton">{[0, 1, 2, 3].map((i) => <i key={i} className="skeleton" />)}</div>}
      {error && <p className="error-box" role="alert">{error}</p>}
      {items && !busy && (
        <>
          <ol className="cs-suggest">
            {items.map((t, i) => (
              <li key={t.key} className={`${t.on ? '' : 'off'}${t.format === 'exam' ? ' exam' : ''}`}>
                <input type="checkbox" checked={t.on} aria-label={`Взять тему «${t.title}»`}
                  onChange={(e) => setItems((xs) => xs && xs.map((x) => (x.key === t.key ? { ...x, on: e.target.checked } : x)))} />
                <div>
                  <input className="cs-suggest-title" value={t.title} maxLength={200}
                    onChange={(e) => setItems((xs) => xs && xs.map((x) => (x.key === t.key ? { ...x, title: e.target.value } : x)))} />
                  <small className="muted">{t.goals}</small>
                </div>
                <button type="button" className={t.format === 'exam' ? 'chip-sm cs-format exam' : 'chip-sm cs-format'}
                  onClick={() => setItems((xs) => xs && xs.map((x) => (x.key === t.key ? { ...x, format: x.format === 'exam' ? 'lesson' : 'exam' } : x)))}>
                  {t.format === 'exam' ? 'контрольная' : 'урок'}
                </button>
                <span className="cfp-icon-row">
                  <button type="button" className="cab-icon-btn" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={14} /></button>
                  <button type="button" className="cab-icon-btn" aria-label="Ниже" disabled={i === items.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={14} /></button>
                  <button type="button" className="cab-icon-btn" aria-label="Убрать" onClick={() => setItems((xs) => xs && xs.filter((x) => x.key !== t.key))}><IconTrash size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
          <div className="cs-plan-foot">
            <label className="cs-fill"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
              <span><IconBook size={15} />Сразу написать уроки для выбранных тем</span></label>
            <button type="button" className="btn btn-primary" onClick={add}>
              <IconPlus size={16} />Добавить {items.filter((x) => x.on).length} {ruPlural(items.filter((x) => x.on).length, 'тему', 'темы', 'тем')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

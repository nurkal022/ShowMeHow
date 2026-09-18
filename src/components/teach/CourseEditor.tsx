'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Block } from '@/lib/lms/blocks';
import { simulationIdsOf, type AssignmentType, type BlockKind } from '@/lib/lms/block-schema';
import {
  COURSE_STATUS_LABELS, LIMITS, TOPIC_FORMATS, TOPIC_FORMAT_HINTS, TOPIC_FORMAT_LABELS, type Course, type Topic, type TopicFormat,
} from '@/lib/lms/types';
import { answersHref, courseEditorHref, learnCourseHref, learnTopicHref } from '@/lib/lms/links';
import { ruPlural } from '@/lib/lms/format';
import { callApi } from '@/components/cabinet/api';
import StatusPill from '@/components/cabinet/StatusPill';
import {
  IconAlert, IconArrowDown, IconArrowUp, IconBack, IconCheck, IconChevron, IconCopy, IconCourses, IconEdit, IconEye,
  IconGrip, IconLock, IconPlus, IconSearch, IconTrash,
} from '@/components/icons';
import RowMenu from '@/components/lms/ui/RowMenu';
import { useConfirm, type ConfirmOptions } from '@/components/lms/ui/useConfirm';
import BlockEditor from './BlockEditor';
import BlockSummary from './BlockSummary';
import {
  ASSIGNMENT_META, ASSIGNMENT_TYPES, BLOCK_GROUPS, BLOCK_META, BlockKindIcon, blockHeadline, blockProblem,
} from './block-meta';

export interface GroupOption { id: string; title: string }

export interface CourseEditorProps {
  course: Course;
  topics: Topic[];
  activeTopicId: string | null;
  blocks: Block[];
  simulationTitles: Record<string, string>;
  missingSimulations: string[];
  /** Группы, которые этот человек может открыть курсу. */
  groups: GroupOption[];
  /** Открыты курсу, но выбирать их может только админ организации. */
  lockedGroups: GroupOption[];
  selectedGroupIds: string[];
  /** Сколько сданных ответов проверено по прежнему ключу, по id блока. */
  stale: Record<string, number>;
  /** Сколько блоков в каждой теме, по id темы. Без него счётчик виден только у открытой темы. */
  blockCounts?: Record<string, number>;
}

type SaveState = 'idle' | 'saving' | 'saved';
type Act = <T>(path: string, method: string, body?: unknown) => Promise<T | null>;
type Ask = (o: ConfirmOptions) => Promise<boolean>;

/** Что выбрано в меню вставки: тип блока и, для задания, тип ответа. */
export interface InsertPick { kind: BlockKind; assignmentType?: AssignmentType }

const blocksLabel = (n: number) => `${n} ${ruPlural(n, 'блок', 'блока', 'блоков')}`;

/** Каждое действие — отдельный запрос; после ответа страница перечитывает данные. */
export default function CourseEditor(props: CourseEditorProps) {
  const { course, topics, activeTopicId } = props;
  const router = useRouter();
  // Локальный порядок: перетаскивание видно сразу, сервер догоняет.
  const [blocks, setBlocks] = useState(props.blocks);
  useEffect(() => { setBlocks(props.blocks); }, [props.blocks]);
  const [pendingTypes, setPendingTypes] = useState<Record<string, AssignmentType>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const [savedId, setSavedId] = useState<string | null>(null);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [ask, confirmDialog] = useConfirm();
  const scrollTo = useRef<string | null>(null);
  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? null;
  const hasDirty = dirtyIds.size > 0;

  // Закрытие вкладки с несохранённым блоком — с предупреждением браузера.
  useEffect(() => {
    if (!hasDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDirty]);

  // Новый блок появляется после перечитывания страницы — тогда к нему и прокручиваем.
  useEffect(() => {
    const id = scrollTo.current;
    if (!id) return;
    const el = document.getElementById(`block-${id}`);
    if (!el) return;
    scrollTo.current = null;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [blocks]);

  const toggle = (set: ReadonlySet<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
  };

  const act: Act = async <T,>(path: string, method: string, body?: unknown) => {
    setSave('saving');
    setError('');
    const res = await callApi<T>(path, method, body);
    if (!res.ok) {
      setError(res.error);
      setSave('idle');
      return null;
    }
    setSave('saved');
    router.refresh();
    return res.data;
  };

  const patchCourse = (patch: Record<string, unknown>) => act(`/api/teach/courses/${course.id}`, 'PATCH', patch);

  async function leaveDirty(): Promise<boolean> {
    if (!hasDirty) return true;
    return ask({
      title: 'Есть несохранённые правки',
      text: 'В открытых блоках остались изменения. Если перейти сейчас, они пропадут.',
      confirmLabel: 'Перейти без сохранения', danger: true,
    });
  }

  /** after — id блока, под который вставить; null — в начало; undefined — в конец. */
  async function addBlock(pick: InsertPick, after?: string | null) {
    if (!activeTopicId) return;
    const data = await act<{ block: Block }>(`/api/teach/topics/${activeTopicId}/blocks`, 'POST', { kind: pick.kind, after });
    if (!data) return;
    scrollTo.current = data.block.id;
    setFreshId(data.block.id);
    if (pick.assignmentType) setPendingTypes((m) => ({ ...m, [data.block.id]: pick.assignmentType as AssignmentType }));
    if (pick.kind !== 'divider') setOpenIds((s) => toggle(s, data.block.id, true));
  }

  async function saveBlock(block: Block, payload: unknown, keepOpen = false): Promise<boolean> {
    setSave('saving');
    setBlockErrors((m) => ({ ...m, [block.id]: '' }));
    const res = await callApi(`/api/teach/blocks/${block.id}`, 'PATCH', { payload });
    if (!res.ok) {
      setSave('idle');
      setBlockErrors((m) => ({ ...m, [block.id]: res.error }));
      return false;
    }
    setSave('saved');
    if (keepOpen) return true;
    setSavedId(block.id);
    setOpenIds((s) => toggle(s, block.id, false));
    setDirtyIds((s) => toggle(s, block.id, false));
    router.refresh();
    return true;
  }

  /** Перетаскивание: блок встаёт перед блоком с индексом target (или в конец). */
  async function dropBlock(target: number) {
    const from = blocks.findIndex((b) => b.id === dragId);
    setDragId(null);
    setDropAt(null);
    if (from < 0) return;
    const to = target > from ? target - 1 : target;
    if (to === from) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setBlocks(next);
    await act(`/api/teach/blocks/${moved.id}`, 'PATCH', { position: to });
  }

  async function closeBlock(block: Block) {
    if (dirtyIds.has(block.id) && !(await ask({
      title: 'Отменить правки?', text: 'Изменения в этом блоке не сохранены и пропадут.',
      confirmLabel: 'Отменить правки', danger: true,
    }))) return;
    setOpenIds((s) => toggle(s, block.id, false));
    setDirtyIds((s) => toggle(s, block.id, false));
    setBlockErrors((m) => ({ ...m, [block.id]: '' }));
    // Автосохранённое содержимое страница ещё не перечитывала.
    router.refresh();
  }

  async function deleteBlock(block: Block) {
    const withAnswers = block.body.kind === 'assignment';
    if (!(await ask({
      title: `Удалить блок «${BLOCK_META[block.body.kind].label}»?`,
      text: withAnswers ? 'Вместе с заданием удалятся ответы учеников и их оценки. Вернуть их будет нельзя.'
        : 'Блок исчезнет из темы. Вернуть его будет нельзя.',
      confirmLabel: 'Удалить блок', danger: true,
    }))) return;
    if (await act(`/api/teach/blocks/${block.id}`, 'DELETE')) {
      setOpenIds((s) => toggle(s, block.id, false));
      setDirtyIds((s) => toggle(s, block.id, false));
    }
  }

  async function duplicateBlock(block: Block) {
    if (!activeTopicId) return;
    const data = await act<{ block: Block }>(`/api/teach/topics/${activeTopicId}/blocks`, 'POST',
      { kind: block.body.kind, after: block.id, payload: block.body.payload });
    if (!data) return;
    scrollTo.current = data.block.id;
    setFreshId(data.block.id);
    setSavedId(data.block.id);
  }

  const noAudience = props.selectedGroupIds.length === 0 && props.lockedGroups.length === 0;

  async function publish() {
    if (topics.length === 0 && !(await ask({
      title: 'В курсе нет тем', text: 'Ученики увидят пустой курс. Опубликовать всё равно?', confirmLabel: 'Опубликовать',
    }))) return;
    if (topics.length > 0 && noAudience && !(await ask({
      title: 'Курс никому не открыт',
      text: 'Вы не выбрали ни одной группы, поэтому ученики курс не увидят. Группы можно выбрать и после публикации.',
      confirmLabel: 'Опубликовать',
    }))) return;
    await patchCourse({ status: 'published' });
  }

  async function unpublish() {
    if (await ask({
      title: 'Снять курс с публикации?',
      text: 'Ученики перестанут видеть курс. Их ответы и оценки сохранятся, курс можно опубликовать снова.',
      confirmLabel: 'Снять с публикации',
    })) await patchCourse({ status: 'draft' });
  }

  return (
    <div className="cf-course">
      <header className="cf-card cf-course-head">
        <Link href="/teach" className="cf-back"><IconBack size={15} />Все курсы</Link>
        <div className="cf-course-top">
          <CourseTitle course={course} onSave={(title) => patchCourse({ title })} />
          <div className="cf-course-actions">
            <span className="cf-save-state" role="status" aria-live="polite">
              {save === 'saving' && 'Сохраняю…'}
              {save === 'saved' && <><IconCheck size={14} />Изменения сохранены</>}
            </span>
            <a className="btn" href={learnCourseHref(course.id, true)} target="_blank" rel="noopener noreferrer">
              <IconEye size={16} />Посмотреть глазами ученика
            </a>
            {course.status === 'published'
              ? <button type="button" className="btn" onClick={unpublish}>Снять с публикации</button>
              : <button type="button" className="btn btn-primary" onClick={publish}>Опубликовать</button>}
          </div>
        </div>
        <div className="cf-course-meta">
          <StatusPill tone={course.status === 'published' ? 'ok' : 'neutral'}>{COURSE_STATUS_LABELS[course.status]}</StatusPill>
          {course.subject && <span className="muted">{course.subject}</span>}
          <span className="muted">{`${topics.length} ${ruPlural(topics.length, 'тема', 'темы', 'тем')}`}</span>
        </div>
        <GroupChips {...props} onChange={(groupIds) => patchCourse({ groupIds })} />
        {course.status === 'published' && noAudience && (
          <p className="warn-banner cf-banner"><IconAlert size={16} />Курс опубликован, но не открыт ни одной группе — ученики его не видят.</p>
        )}
        <CourseDetails course={course} onSave={patchCourse} />
      </header>

      {error && <p className="error-box" role="alert">{error}</p>}

      <div className="cf-builder">
        <TopicPane course={course} topics={topics} activeTopicId={activeTopicId} act={act} ask={ask}
          counts={{ ...props.blockCounts, ...(activeTopicId ? { [activeTopicId]: blocks.length } : {}) }}
          beforeLeave={leaveDirty}
          onAdded={(id) => router.push(courseEditorHref(course.id, id))}
          onDeleted={(id) => { if (id === activeTopicId) router.push(courseEditorHref(course.id)); }} />

        <section className="cf-blocks" aria-label={activeTopic ? `Блоки темы «${activeTopic.title}»` : 'Блоки темы'}>
          {!activeTopic && (
            <FirstTopic onAdd={async (title) => {
              const data = await act<{ topic: Topic }>(`/api/teach/courses/${course.id}/topics`, 'POST', { title });
              if (data) router.push(courseEditorHref(course.id, data.topic.id));
              return data !== null;
            }} />
          )}

          {activeTopic && (
            <div className="cf-topic-head">
              <div>
                <span className="label">{`Тема ${topics.indexOf(activeTopic) + 1} из ${topics.length}`}</span>
                <h2>{activeTopic.title}</h2>
              </div>
              <span className="muted">{blocksLabel(blocks.length)}</span>
              <a className="btn btn-sm btn-ghost" href={learnTopicHref(activeTopic.id, true)} target="_blank" rel="noopener noreferrer">
                <IconEye size={15} />Тема глазами ученика
              </a>
            </div>
          )}

          {activeTopic && (
            <TopicFormatBar key={activeTopic.id} topic={activeTopic}
              onChange={(format, timeLimitMin) => act(`/api/teach/topics/${activeTopic.id}`, 'PATCH', { format, timeLimitMin })} />
          )}

          {blocks.map((block, i) => {
            const simId = simulationIdsOf(block.body)[0] ?? null;
            const simTitle = simId ? props.simulationTitles[simId] ?? null : null;
            const missing = simId !== null && props.missingSimulations.includes(simId);
            const open = openIds.has(block.id);
            const dirty = dirtyIds.has(block.id);
            const problem = blockProblem(block, missing);
            const stale = props.stale[block.id] ?? 0;
            const kind = block.body.kind;
            const aType = block.body.kind === 'assignment' ? block.body.payload.spec.type : undefined;
            const label = aType ? ASSIGNMENT_META[aType].label : BLOCK_META[kind].label;
            const busy = save === 'saving';
            return (
              <div key={block.id} className="cf-block-slot">
                <InsertLine busy={busy} active={dropAt === i} onPick={(pick) => addBlock(pick, i === 0 ? null : blocks[i - 1].id)}
                  onDragOver={dragId ? (e) => { e.preventDefault(); setDropAt(i); } : undefined}
                  onDrop={dragId ? (e) => { e.preventDefault(); void dropBlock(i); } : undefined} />
                <article id={`block-${block.id}`}
                  className={['cf-block', open ? 'open' : '', dirty ? 'dirty' : '', dragId === block.id ? 'dragging' : '',
                    freshId === block.id ? 'fresh' : '', kind === 'divider' ? 'slim' : ''].filter(Boolean).join(' ')}
                  onDragOver={dragId && dragId !== block.id ? (e) => {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
                  } : undefined}
                  onDrop={dragId ? (e) => { e.preventDefault(); if (dropAt !== null) void dropBlock(dropAt); } : undefined}>
                  <header className="cf-block-head">
                    <span className="cf-grip" draggable={!open && !busy} title="Перетащите, чтобы переставить" aria-hidden="true"
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', block.id);
                        const card = e.currentTarget.closest('.cf-block');
                        if (card) e.dataTransfer.setDragImage(card, 24, 24);
                        setDragId(block.id);
                      }}
                      onDragEnd={() => { setDragId(null); setDropAt(null); }}><IconGrip size={16} /></span>
                    <button type="button" className="cf-block-toggle" aria-expanded={open}
                      aria-controls={`block-body-${block.id}`} disabled={kind === 'divider'}
                      onClick={() => (open ? void closeBlock(block) : setOpenIds((s) => toggle(s, block.id, true)))}>
                      <BlockKindIcon kind={kind} assignmentType={aType} />
                      <span className="cf-block-titles">
                        <span className="cf-block-kind">{label}</span>
                        <span className="cf-block-headline">{blockHeadline(block, simTitle)}</span>
                      </span>
                      <span className="visually-hidden">{open ? 'Свернуть блок' : 'Изменить блок'}</span>
                    </button>
                    <span className="cf-block-state">
                      {dirty && <StatusPill tone="warn">правки…</StatusPill>}
                      {!dirty && !open && problem && <StatusPill tone="warn">{problem.toLowerCase()}</StatusPill>}
                      {!dirty && !open && !problem && savedId === block.id && <StatusPill tone="ok">сохранено</StatusPill>}
                    </span>
                    <span className="cf-block-tools">
                      {kind !== 'divider' && (
                        <button type="button" className="btn btn-sm cf-block-edit"
                          onClick={() => (open ? void closeBlock(block) : setOpenIds((s) => toggle(s, block.id, true)))}>
                          {open ? 'Свернуть' : <><IconEdit size={14} />Изменить</>}
                        </button>
                      )}
                      <RowMenu label={`Действия с блоком ${i + 1}`} busy={busy} items={[
                        { key: 'up', label: 'Поднять', icon: <IconArrowUp size={16} />, disabled: i === 0,
                          onSelect: () => void act(`/api/teach/blocks/${block.id}`, 'PATCH', { move: 'up' }) },
                        { key: 'down', label: 'Опустить', icon: <IconArrowDown size={16} />, disabled: i === blocks.length - 1,
                          onSelect: () => void act(`/api/teach/blocks/${block.id}`, 'PATCH', { move: 'down' }) },
                        { key: 'copy', label: 'Дублировать', icon: <IconCopy size={16} />, disabled: dirty,
                          hint: dirty ? 'Сначала сохраните блок' : undefined, onSelect: () => void duplicateBlock(block) },
                        { key: 'delete', label: 'Удалить', icon: <IconTrash size={16} />, danger: true, onSelect: () => void deleteBlock(block) },
                      ]} />
                    </span>
                  </header>
                  {kind !== 'divider' && (
                    <div className="cf-block-body" id={`block-body-${block.id}`}>
                      {open
                        ? <BlockEditor block={block} simulationTitle={simTitle} error={blockErrors[block.id] || undefined}
                            initialType={pendingTypes[block.id]}
                            onCancel={() => void closeBlock(block)}
                            onDirtyChange={(d) => setDirtyIds((s) => (s.has(block.id) === d ? s : toggle(s, block.id, d)))}
                            onSave={(payload, opts) => saveBlock(block, payload, opts?.keepOpen)} />
                        : <BlockSummary block={block} simulationTitle={simTitle} missing={missing} />}
                    </div>
                  )}
                  {kind === 'assignment' && !open && (
                    <footer className="cf-block-foot">
                      <Link className="btn btn-sm btn-ghost" href={answersHref(course.id, block.id)}>Ответы учеников</Link>
                      <Link className="btn btn-sm btn-ghost" href={answersHref(course.id, block.id, { pending: true })}>Ждут проверки</Link>
                      {stale > 0 && (
                        <button type="button" className="btn btn-sm" onClick={() => act(`/api/teach/blocks/${block.id}/recalculate`, 'POST')}>
                          {`Пересчитать ${stale} сданных ответов`}
                        </button>
                      )}
                    </footer>
                  )}
                </article>
              </div>
            );
          })}

          {activeTopic && blocks.length > 0 && dragId && (
            <div className={dropAt === blocks.length ? 'cf-drop-end active' : 'cf-drop-end'}
              onDragOver={(e) => { e.preventDefault(); setDropAt(blocks.length); }}
              onDrop={(e) => { e.preventDefault(); void dropBlock(blocks.length); }} />
          )}

          {activeTopic && <AddBlockMenu empty={blocks.length === 0} busy={save === 'saving'} onAdd={(pick) => addBlock(pick)} />}
        </section>
      </div>
      {confirmDialog}
    </div>
  );
}

/* ------------------------------ формат темы ----------------------------- */

function TopicFormatBar({ topic, onChange }: { topic: Topic; onChange: (format: TopicFormat, limit: number | null) => Promise<unknown> }) {
  const [limit, setLimit] = useState(topic.timeLimitMin ? String(topic.timeLimitMin) : '');
  const parsed = limit.trim() === '' ? null : Number(limit);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 1 && parsed <= 300);
  return (
    <div className="cf-format">
      <div className="cf-format-row">
        <span className="label">Формат темы</span>
        <div className="segmented" role="radiogroup" aria-label="Формат темы">
          {TOPIC_FORMATS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={topic.format === f} title={TOPIC_FORMAT_HINTS[f]}
              className={topic.format === f ? 'segmented-item active' : 'segmented-item'}
              onClick={() => { if (topic.format !== f) void onChange(f, f === 'exam' && valid ? parsed : null); }}>{TOPIC_FORMAT_LABELS[f]}</button>
          ))}
        </div>
        {topic.format === 'exam' && (
          <label className="cf-format-time">Время, мин
            <input className="input" value={limit} inputMode="numeric" placeholder="без лимита" aria-invalid={valid ? undefined : true}
              onChange={(e) => setLimit(e.target.value)}
              onBlur={() => { if (valid && parsed !== topic.timeLimitMin) void onChange('exam', parsed); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          </label>
        )}
      </div>
      <p className="muted">{TOPIC_FORMAT_HINTS[topic.format]}</p>
    </div>
  );
}

/* ------------------------------ шапка курса ----------------------------- */

function CourseTitle({ course, onSave }: { course: Course; onSave: (title: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(course.title);
  if (!editing) {
    return (
      <h1 className="cf-course-title">
        {course.title}
        <button type="button" className="icon-btn cf-icon-btn" aria-label="Переименовать курс" title="Переименовать курс"
          onClick={() => { setValue(course.title); setEditing(true); }}><IconEdit size={16} /></button>
      </h1>
    );
  }
  return (
    <form className="cf-title-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!value.trim()) return;
      if (value.trim() === course.title || (await onSave(value)) !== null) setEditing(false);
    }}>
      <input className="input cf-title-input" value={value} maxLength={LIMITS.title} autoFocus required aria-label="Название курса"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
      <button type="submit" className="btn btn-sm btn-primary">Сохранить</button>
      <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>Отмена</button>
    </form>
  );
}

function CourseDetails({ course, onSave }: { course: Course; onSave: (patch: Record<string, unknown>) => Promise<unknown> }) {
  const [subject, setSubject] = useState(course.subject);
  const [description, setDescription] = useState(course.description);
  const changed = subject !== course.subject || description !== course.description;
  return (
    <details className="cf-details">
      <summary><IconChevron size={16} />Предмет и описание курса</summary>
      <form className="cf-details-form" onSubmit={(e) => { e.preventDefault(); void onSave({ subject, description }); }}>
        <label className="field"><span>Предмет</span>
          <input value={subject} maxLength={LIMITS.subject} placeholder="Физика" onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="field"><span>Описание — его видят ученики на странице курса</span>
          <textarea className="input cf-textarea" rows={3} value={description} maxLength={LIMITS.description}
            onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-sm" disabled={!changed}>Сохранить описание</button>
      </form>
    </details>
  );
}

function GroupChips({ groups, lockedGroups, selectedGroupIds, onChange }: CourseEditorProps & {
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedGroupIds);
  return (
    <div className="cf-audience" role="group" aria-label="Кому открыт курс">
      <span className="label">Кому открыт</span>
      {groups.length === 0 && lockedGroups.length === 0 && (
        <span className="muted">У вас пока нет групп. Их назначает администратор организации.</span>
      )}
      {groups.map((g) => {
        const on = selected.has(g.id);
        return (
          <button key={g.id} type="button" aria-pressed={on} className={on ? 'cf-chip on' : 'cf-chip'}
            title={on ? 'Закрыть курс для группы' : 'Открыть курс группе'}
            onClick={() => onChange(groups.map((x) => x.id).filter((id) => (id === g.id ? !on : selected.has(id))))}>
            {on ? <IconCheck size={14} /> : <IconPlus size={14} />}{g.title}
          </button>
        );
      })}
      {lockedGroups.map((g) => (
        <span key={g.id} className="cf-chip on locked" title="Эту группу открыл администратор организации.">
          <IconLock size={13} />{g.title}<span className="visually-hidden"> — открыт администратором</span>
        </span>
      ))}
    </div>
  );
}

/* --------------------------------- темы --------------------------------- */

function TopicPane({ course, topics, activeTopicId, counts, act, ask, beforeLeave, onAdded, onDeleted }: {
  course: Course; topics: Topic[]; activeTopicId: string | null; counts: Record<string, number>;
  act: Act; ask: Ask; beforeLeave: () => Promise<boolean>;
  onAdded: (id: string) => void; onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  async function rename(t: Topic) {
    const next = value.trim();
    if (!next || next === t.title) return setRenaming(null);
    if (await act(`/api/teach/topics/${t.id}`, 'PATCH', { title: next })) setRenaming(null);
  }

  async function remove(t: Topic) {
    if (!(await ask({
      title: `Удалить тему «${t.title}»?`,
      text: 'Вместе с темой удалятся все её блоки, ответы учеников и оценки. Вернуть их будет нельзя.',
      confirmLabel: 'Удалить тему', danger: true,
    }))) return;
    if (await act(`/api/teach/topics/${t.id}`, 'DELETE')) onDeleted(t.id);
  }

  return (
    <aside className="cf-card cf-topics" aria-label="Темы курса">
      <div className="cf-topics-head">
        <h2>Темы</h2>
        <span className="cf-count">{topics.length}</span>
      </div>
      {topics.length === 0 && <p className="muted">Тем пока нет. Курс состоит из тем, тема — из блоков.</p>}
      <ol className="cf-topic-list">
        {topics.map((t, i) => {
          const active = t.id === activeTopicId;
          const count = counts[t.id];
          return (
            <li key={t.id} className={active ? 'cf-topic active' : 'cf-topic'}>
              {renaming === t.id ? (
                <form className="cf-topic-rename" onSubmit={(e) => { e.preventDefault(); void rename(t); }}>
                  <input className="input" value={value} maxLength={LIMITS.title} autoFocus aria-label="Новое название темы"
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
                  <button type="submit" className="icon-btn cf-icon-btn" aria-label="Сохранить название" title="Сохранить"><IconCheck size={16} /></button>
                </form>
              ) : (
                <>
                  <Link href={courseEditorHref(course.id, t.id)} className="cf-topic-link" aria-current={active ? 'true' : undefined}
                    onClick={async (e) => {
                      if (active) return;
                      // Несохранённые блоки: сначала спросить, потом переходить.
                      e.preventDefault();
                      if (await beforeLeave()) router.push(courseEditorHref(course.id, t.id));
                    }}>
                    <span className="cf-topic-num">{i + 1}</span>
                    <span className="cf-topic-title">{t.title}</span>
                    {count !== undefined && <span className="cf-topic-count" title={blocksLabel(count)}>{count}</span>}
                  </Link>
                  <span className="cf-topic-tools">
                    <button type="button" className="icon-btn cf-icon-btn" aria-label={`Поднять тему «${t.title}»`} title="Поднять"
                      disabled={i === 0} onClick={() => act(`/api/teach/topics/${t.id}`, 'PATCH', { move: 'up' })}><IconArrowUp size={15} /></button>
                    <button type="button" className="icon-btn cf-icon-btn" aria-label={`Опустить тему «${t.title}»`} title="Опустить"
                      disabled={i === topics.length - 1} onClick={() => act(`/api/teach/topics/${t.id}`, 'PATCH', { move: 'down' })}><IconArrowDown size={15} /></button>
                    <RowMenu label={`Действия с темой «${t.title}»`} items={[
                      { key: 'rename', label: 'Переименовать', icon: <IconEdit size={16} />, onSelect: () => { setRenaming(t.id); setValue(t.title); } },
                      { key: 'delete', label: 'Удалить тему', icon: <IconTrash size={16} />, danger: true, onSelect: () => void remove(t) },
                    ]} />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {topics.length > 0 && (adding ? (
        <form className="cf-topic-add" onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || !(await beforeLeave())) return;
          const data = await act<{ topic: Topic }>(`/api/teach/courses/${course.id}/topics`, 'POST', { title });
          if (data) { setTitle(''); setAdding(false); onAdded(data.topic.id); }
        }}>
          <input className="input" value={title} maxLength={LIMITS.title} autoFocus required aria-label="Название новой темы"
            placeholder="Название темы" onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setTitle(''); } }} />
          <div className="cf-inline">
            <button type="submit" className="btn btn-sm btn-primary">Добавить</button>
            <button type="button" className="btn btn-sm" onClick={() => { setAdding(false); setTitle(''); }}>Отмена</button>
          </div>
        </form>
      ) : (
        <button type="button" className="cf-add-line" onClick={() => setAdding(true)}><IconPlus size={16} />Добавить тему</button>
      ))}
    </aside>
  );
}

function FirstTopic({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="cf-card cf-hero">
      <span className="cf-hero-icon" aria-hidden="true"><IconCourses size={28} /></span>
      <h2>Начните с первой темы</h2>
      <p className="muted">
        Тема — это один урок: объяснение, тренажёр или лаборатория и задания к ним.
        Назовите первую тему, блоки добавите на следующем шаге.
      </p>
      <form className="cf-hero-form" onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        await onAdd(title);
        setBusy(false);
      }}>
        <input className="input" value={title} maxLength={LIMITS.title} required autoFocus aria-label="Название первой темы"
          placeholder="Например, «Колебания маятника»" onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />{busy ? 'Создаю…' : 'Создать тему'}</button>
      </form>
    </div>
  );
}

/* ----------------------------- добавить блок ---------------------------- */

/** Список вставки с поиском: «/» или «+» — и сразу печатать название. Стрелки и Enter работают. */
function InsertPalette({ busy, onPick, onClose, autoFocus = true }: {
  busy: boolean; onPick: (pick: InsertPick) => void; onClose?: () => void; autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const needle = q.trim().toLowerCase();
  const hit = (label: string, hint: string) => !needle || `${label} ${hint}`.toLowerCase().includes(needle);
  const groups = [
    ...BLOCK_GROUPS.map((g) => ({
      title: g.title,
      items: g.kinds.filter((k) => hit(BLOCK_META[k].label, BLOCK_META[k].hint))
        .map((k) => ({ key: k as string, pick: { kind: k } as InsertPick, meta: BLOCK_META[k], badge: '' })),
    })),
    {
      title: 'Задание',
      items: ASSIGNMENT_TYPES.filter((t) => hit(`${ASSIGNMENT_META[t].label} задание`, ASSIGNMENT_META[t].hint))
        .map((t) => ({
          key: `a-${t}`, pick: { kind: 'assignment', assignmentType: t } as InsertPick, meta: ASSIGNMENT_META[t],
          badge: ASSIGNMENT_META[t].auto ? 'авто' : 'вручную',
        })),
    },
  ].filter((g) => g.items.length > 0);
  const flatItems = groups.flatMap((g) => g.items);
  const at = Math.min(cursor, Math.max(0, flatItems.length - 1));

  return (
    <div className="cf-palette" role="dialog" aria-label="Добавить блок"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((at + 1) % Math.max(1, flatItems.length)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((at - 1 + flatItems.length) % Math.max(1, flatItems.length)); }
        if (e.key === 'Enter' && flatItems[at] && !busy) { e.preventDefault(); onPick(flatItems[at].pick); }
      }}>
      <label className="cf-palette-search">
        <IconSearch size={16} />
        <input value={q} autoFocus={autoFocus} placeholder="Что добавить? Например: формула, видео, пропуски" aria-label="Поиск типа блока"
          onChange={(e) => { setQ(e.target.value); setCursor(0); }} />
      </label>
      <div className="cf-palette-list">
        {groups.length === 0 && <p className="muted cf-palette-empty">Такого блока нет. Попробуйте «текст», «картинка», «задание».</p>}
        {groups.map((g) => (
          <div key={g.title} className="cf-palette-group">
            <span className="cf-palette-title">{g.title}</span>
            <div className="cf-palette-grid">
              {g.items.map((it) => (
                <button key={it.key} type="button" disabled={busy}
                  className={flatItems[at]?.key === it.key ? 'cf-palette-item active' : 'cf-palette-item'}
                  onMouseEnter={() => setCursor(flatItems.findIndex((x) => x.key === it.key))}
                  onClick={() => onPick(it.pick)}>
                  <span className={`cf-kind cf-kind-${it.pick.kind}`} aria-hidden="true">{it.meta.icon(18)}</span>
                  <span className="cf-palette-text"><strong>{it.meta.label}</strong><span className="muted">{it.meta.hint}</span></span>
                  {it.badge && <span className={it.badge === 'авто' ? 'cf-type-badge auto' : 'cf-type-badge'}>{it.badge}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Тонкая линия между блоками: при наведении — «+», по клику — меню вставки прямо здесь. */
function InsertLine({ busy, active, onPick, onDragOver, onDrop }: {
  busy: boolean; active: boolean; onPick: (pick: InsertPick) => Promise<void>;
  onDragOver?: (e: React.DragEvent) => void; onDrop?: (e: React.DragEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={wrap} className={['cf-insert', open ? 'open' : '', active ? 'drop' : ''].filter(Boolean).join(' ')}
      onDragOver={onDragOver} onDrop={onDrop}>
      <button type="button" className="cf-insert-btn" aria-expanded={open} aria-label="Вставить блок сюда" title="Вставить блок сюда"
        onClick={() => setOpen((v) => !v)}><IconPlus size={14} /></button>
      {open && <InsertPalette busy={busy} onClose={() => setOpen(false)} onPick={async (pick) => { setOpen(false); await onPick(pick); }} />}
    </div>
  );
}

function AddBlockMenu({ empty, busy, onAdd }: { empty: boolean; busy: boolean; onAdd: (pick: InsertPick) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const shown = empty || open;

  // «/» вне полей ввода открывает меню — как в современных редакторах.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || el?.closest('input, textarea, select, [contenteditable], dialog')) return;
      e.preventDefault();
      setOpen(true);
      document.querySelector('.cf-add')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={empty ? 'cf-add cf-add-empty' : 'cf-add'}>
      {empty && (
        <div className="cf-add-lead">
          <h3>В теме пока нет блоков</h3>
          <p className="muted">Выберите, с чего начать. Блоки идут сверху вниз — так их увидит ученик.</p>
        </div>
      )}
      {!empty && (
        <button type="button" className="cf-add-line" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <IconPlus size={16} />Добавить блок<kbd>/</kbd>
        </button>
      )}
      {shown && <InsertPalette busy={busy} autoFocus={!empty} onClose={() => setOpen(false)}
        onPick={async (pick) => { await onAdd(pick); setOpen(false); }} />}
    </div>
  );
}

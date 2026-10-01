'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Block } from '@/lib/lms/blocks';
import { simulationIdsOf, type AssignmentType, type BlockKind } from '@/lib/lms/block-schema';
import {
  courseStatusLabels, LIMITS, TOPIC_FORMATS, topicFormatHints, topicFormatLabels, type Course, type Topic, type TopicFormat,
} from '@/lib/lms/types';
import { answersHref, courseEditorHref, learnCourseHref, learnTopicHref } from '@/lib/lms/links';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { teachEditor } from '@/i18n/messages/teach-editor';
import { callApi } from '@/components/cabinet/api';
import StatusPill from '@/components/cabinet/StatusPill';
import {
  IconAlert, IconArrowDown, IconArrowUp, IconBack, IconCheck, IconChevron, IconCopy, IconCourses, IconEdit, IconEye,
  IconGrip, IconLock, IconPlus, IconSearch, IconSpark, IconTrash,
} from '@/components/icons';
import RowMenu from '@/components/lms/ui/RowMenu';
import { useConfirm, type ConfirmOptions } from '@/components/lms/ui/useConfirm';
import BlockEditor from './BlockEditor';
import { AiBusy, aiBlockAction } from './AiAssist';
import { LessonBuilderButton } from './LessonBuilder';
import BlockSummary from './BlockSummary';
import {
  ASSIGNMENT_META, ASSIGNMENT_TYPES, BLOCK_GROUPS, BLOCK_META, BlockKindIcon, assignmentHint, assignmentLabel, blockHeadline, blockHint, blockLabel,
  blockProblem,
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

/** Каждое действие — отдельный запрос; после ответа страница перечитывает данные. */
export default function CourseEditor(props: CourseEditorProps) {
  const { course, topics, activeTopicId } = props;
  const router = useRouter();
  const t = useT(teachEditor);
  const fmt = useFormat();
  const locale = useLocale();
  // Локальный порядок: перетаскивание видно сразу, сервер догоняет.
  const [blocks, setBlocks] = useState(props.blocks);
  useEffect(() => { setBlocks(props.blocks); }, [props.blocks]);
  const [pendingTypes, setPendingTypes] = useState<Record<string, AssignmentType>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState('');
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
      title: t('unsavedTitle'),
      text: t('unsavedText'),
      confirmLabel: t('leaveUnsaved'), danger: true,
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
      title: t('discardTitle'), text: t('discardText'),
      confirmLabel: t('discard'), danger: true,
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
      title: t('deleteBlockQ', { label: blockLabel(block.body.kind, locale) }),
      text: withAnswers ? t('deleteBlockAnswers')
        : t('deleteBlockText'),
      confirmLabel: t('deleteBlock'), danger: true,
    }))) return;
    if (await act(`/api/teach/blocks/${block.id}`, 'DELETE')) {
      setOpenIds((s) => toggle(s, block.id, false));
      setDirtyIds((s) => toggle(s, block.id, false));
    }
  }

  async function runAi(action: 'tasks' | 'variants', block: Block) {
    setAiBusy(action === 'tasks' ? t('aiTasks') : t('aiVariants'));
    setError('');
    const res = await aiBlockAction(action, block.id, 3);
    setAiBusy('');
    if (!res.ok) return setError(res.error);
    if (res.data.firstId) { scrollTo.current = res.data.firstId; setFreshId(res.data.firstId); }
    router.refresh();
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
      title: t('noTopicsTitle'), text: t('noTopicsText'), confirmLabel: t('publish'),
    }))) return;
    if (topics.length > 0 && noAudience && !(await ask({
      title: t('noAudienceTitle'),
      text: t('noAudienceText'),
      confirmLabel: t('publish'),
    }))) return;
    await patchCourse({ status: 'published' });
  }

  async function unpublish() {
    if (await ask({
      title: t('unpublishQ'),
      text: t('unpublishText'),
      confirmLabel: t('unpublish'),
    })) await patchCourse({ status: 'draft' });
  }

  return (
    <div className="cf-course">
      <header className="cf-card cf-course-head">
        <Link href="/teach/courses" className="cf-back"><IconBack size={15} />{t('allCourses')}</Link>
        <div className="cf-course-top">
          <CourseTitle course={course} onSave={(title) => patchCourse({ title })} />
          <div className="cf-course-actions">
            <span className="cf-save-state" role="status" aria-live="polite">
              {save === 'saving' && t('saving')}
              {save === 'saved' && <><IconCheck size={14} />{t('changesSaved')}</>}
            </span>
            <a className="btn" href={learnCourseHref(course.id, true)} target="_blank" rel="noopener noreferrer">
              <IconEye size={16} />{t('viewAsStudent')}
            </a>
            {course.status === 'published'
              ? <button type="button" className="btn" onClick={unpublish}>{t('unpublish')}</button>
              : <button type="button" className="btn btn-primary" onClick={publish}>{t('publish')}</button>}
          </div>
        </div>
        <div className="cf-course-meta">
          <StatusPill tone={course.status === 'published' ? 'ok' : 'neutral'}>{courseStatusLabels(locale)[course.status]}</StatusPill>
          {course.subject && <span className="muted">{course.subject}</span>}
          <span className="muted">{t('topics', { n: topics.length })}</span>
        </div>
        <GroupChips {...props} onChange={(groupIds) => patchCourse({ groupIds })} />
        {course.status === 'published' && noAudience && (
          <p className="warn-banner cf-banner"><IconAlert size={16} />{t('publishedNoAudience')}</p>
        )}
        <Link className="cf-details-link" href={`/teach/courses/${course.id}/settings`}>
          <IconChevron size={16} />{t('detailsLink')}
        </Link>
      </header>

      {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}

      <div className="cf-builder">
        <TopicPane course={course} topics={topics} activeTopicId={activeTopicId} act={act} ask={ask}
          counts={{ ...props.blockCounts, ...(activeTopicId ? { [activeTopicId]: blocks.length } : {}) }}
          beforeLeave={leaveDirty}
          onAdded={(id) => router.push(courseEditorHref(course.id, id))}
          onDeleted={(id) => { if (id === activeTopicId) router.push(courseEditorHref(course.id)); }} />

        <section className="cf-blocks" aria-label={activeTopic ? t('topicBlocks', { title: activeTopic.title }) : t('topicBlocksNone')}>
          {!activeTopic && (
            <FirstTopic courseId={course.id} subject={course.subject} onBuilt={(id) => router.push(courseEditorHref(course.id, id))} onAdd={async (title) => {
              const data = await act<{ topic: Topic }>(`/api/teach/courses/${course.id}/topics`, 'POST', { title });
              if (data) router.push(courseEditorHref(course.id, data.topic.id));
              return data !== null;
            }} />
          )}

          {activeTopic && (
            <div className="cf-topic-head">
              <div>
                <span className="label">{t('topicOf', { n: topics.indexOf(activeTopic) + 1, total: topics.length })}</span>
                <h2>{activeTopic.title}</h2>
              </div>
              <span className="muted">{t('blocks', { n: blocks.length })}</span>
              {blocks.length > 0 && (
                <LessonBuilderButton courseId={course.id} subject={course.subject} topicId={activeTopic.id} topicTitle={activeTopic.title} variant="small"
                  onDone={(_t, firstId) => { if (firstId) { scrollTo.current = firstId; setFreshId(firstId); } router.refresh(); }} />
              )}
              <a className="btn btn-sm btn-ghost" href={learnTopicHref(activeTopic.id, true)} target="_blank" rel="noopener noreferrer">
                <IconEye size={15} />{t('topicAsStudent')}
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
            const problem = blockProblem(block, missing, locale);
            const stale = props.stale[block.id] ?? 0;
            const kind = block.body.kind;
            const aType = block.body.kind === 'assignment' ? block.body.payload.spec.type : undefined;
            const label = aType ? assignmentLabel(aType, locale) : blockLabel(kind, locale);
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
                    <span className="cf-grip" draggable={!open && !busy} title={t('dragHint')} aria-hidden="true"
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
                        <span className="cf-block-headline">{blockHeadline(block, simTitle, locale)}</span>
                      </span>
                      <span className="visually-hidden">{open ? t('collapseBlock') : t('editBlock')}</span>
                    </button>
                    <span className="cf-block-state">
                      {dirty && <StatusPill tone="warn">{t('editing')}</StatusPill>}
                      {!dirty && !open && problem && <StatusPill tone="warn">{problem.toLowerCase()}</StatusPill>}
                      {!dirty && !open && !problem && savedId === block.id && <StatusPill tone="ok">{t('saved')}</StatusPill>}
                    </span>
                    <span className="cf-block-tools">
                      {kind !== 'divider' && (
                        <button type="button" className="btn btn-sm cf-block-edit"
                          onClick={() => (open ? void closeBlock(block) : setOpenIds((s) => toggle(s, block.id, true)))}>
                          {open ? t('collapse') : <><IconEdit size={14} />{t('edit')}</>}
                        </button>
                      )}
                      <RowMenu label={t('blockActions', { n: i + 1 })} busy={busy} items={[
                        { key: 'up', label: t('moveUp'), icon: <IconArrowUp size={16} />, disabled: i === 0,
                          onSelect: () => void act(`/api/teach/blocks/${block.id}`, 'PATCH', { move: 'up' }) },
                        { key: 'down', label: t('moveDown'), icon: <IconArrowDown size={16} />, disabled: i === blocks.length - 1,
                          onSelect: () => void act(`/api/teach/blocks/${block.id}`, 'PATCH', { move: 'down' }) },
                        ...(kind === 'text' || kind === 'callout' || kind === 'spoiler' ? [{
                          key: 'ai-tasks', label: t('aiTasksMenu'), icon: <IconSpark size={16} />, disabled: dirty || !!aiBusy,
                          onSelect: () => void runAi('tasks', block) }] : []),
                        ...(kind === 'assignment' ? [{
                          key: 'ai-variants', label: t('aiVariantsMenu'), icon: <IconSpark size={16} />, disabled: dirty || !!aiBusy,
                          hint: t('aiVariantsHint'), onSelect: () => void runAi('variants', block) }] : []),
                        { key: 'copy', label: t('duplicate'), icon: <IconCopy size={16} />, disabled: dirty,
                          hint: dirty ? t('saveFirst') : undefined, onSelect: () => void duplicateBlock(block) },
                        { key: 'delete', label: t('delete'), icon: <IconTrash size={16} />, danger: true, onSelect: () => void deleteBlock(block) },
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
                      <Link className="btn btn-sm btn-ghost" href={answersHref(course.id, block.id)}>{t('studentAnswers')}</Link>
                      <Link className="btn btn-sm btn-ghost" href={answersHref(course.id, block.id, { pending: true })}>{t('pending')}</Link>
                      {stale > 0 && (
                        <button type="button" className="btn btn-sm" onClick={() => act(`/api/teach/blocks/${block.id}/recalculate`, 'POST')}>
                          {t('recalc', { n: stale })}
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

          {aiBusy && <AiBusy text={aiBusy} />}
          {activeTopic && blocks.length === 0 && (
            <div className="ai-empty">
              <LessonBuilderButton courseId={course.id} subject={course.subject} topicId={activeTopic.id} topicTitle={activeTopic.title}
                label={t('buildWithAi')}
                onDone={(_t, firstId) => { if (firstId) { scrollTo.current = firstId; setFreshId(firstId); } router.refresh(); }} />
              <span className="muted">{t('orBuildSelf')}</span>
            </div>
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
  const t = useT(teachEditor);
  const locale = useLocale();
  const TOPIC_FORMAT_LABELS = topicFormatLabels(locale);
  const TOPIC_FORMAT_HINTS = topicFormatHints(locale);
  const [limit, setLimit] = useState(topic.timeLimitMin ? String(topic.timeLimitMin) : '');
  const parsed = limit.trim() === '' ? null : Number(limit);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 1 && parsed <= 300);
  return (
    <div className="cf-format">
      <div className="cf-format-row">
        <span className="label">{t('topicFormat')}</span>
        <div className="segmented" role="radiogroup" aria-label={t('topicFormat')}>
          {TOPIC_FORMATS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={topic.format === f} title={TOPIC_FORMAT_HINTS[f]}
              className={topic.format === f ? 'segmented-item active' : 'segmented-item'}
              onClick={() => { if (topic.format !== f) void onChange(f, f === 'exam' && valid ? parsed : null); }}>{TOPIC_FORMAT_LABELS[f]}</button>
          ))}
        </div>
        {topic.format === 'exam' && (
          <label className="cf-format-time">{t('timeMin')}
            <input className="input" value={limit} inputMode="numeric" placeholder={t('noLimit')} aria-invalid={valid ? undefined : true}
              onChange={(e) => setLimit(e.target.value)}
              onBlur={() => { if (valid && parsed !== topic.timeLimitMin) void onChange('exam', parsed); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          </label>
        )}
      </div>
      <p className="muted">{TOPIC_FORMAT_HINTS[topic.format]}</p>
      <DueField topic={topic} />
    </div>
  );
}

/** Срок сдачи темы: ученик видит его в курсе и в уроке, опоздания помечаются в ответах. */
function DueField({ topic }: { topic: Topic }) {
  const router = useRouter();
  const t = useT(teachEditor);
  const local = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const [value, setValue] = useState(local(topic.dueAt));
  const [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>('');
  async function save(next: string) {
    setValue(next);
    setState('saving');
    const res = await callApi(`/api/teach/topics/${topic.id}`, 'PATCH', { dueAt: next ? new Date(next).toISOString() : null });
    setState(res.ok ? 'saved' : 'error');
    if (res.ok) router.refresh();
  }
  const quick = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    return local(d.toISOString());
  };
  return (
    <div className="cf-due">
      <span className="label">{t('due')}</span>
      <input type="datetime-local" className="input" value={value} aria-label={t('dueAria')} onChange={(e) => void save(e.target.value)} />
      <span className="cf-due-quick">
        <button type="button" className="cf-chip" onClick={() => void save(quick(1))}>{t('tomorrow')}</button>
        <button type="button" className="cf-chip" onClick={() => void save(quick(7))}>{t('inWeek')}</button>
        {value && <button type="button" className="cf-chip" onClick={() => void save('')}>{t('noDue')}</button>}
      </span>
      <span className="muted">{state === 'saving' ? t('saving') : state === 'saved' ? t('savedCap') : state === 'error' ? t('saveFailed') : value ? t('dueVisible') : t('noDueCap')}</span>
    </div>
  );
}

/* ------------------------------ шапка курса ----------------------------- */

function CourseTitle({ course, onSave }: { course: Course; onSave: (title: string) => Promise<unknown> }) {
  const t = useT(teachEditor);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(course.title);
  if (!editing) {
    return (
      <h1 className="cf-course-title">
        {course.title}
        <button type="button" className="icon-btn cf-icon-btn" aria-label={t('renameCourse')} title={t('renameCourse')}
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
      <input className="input cf-title-input" value={value} maxLength={LIMITS.title} autoFocus required aria-label={t('courseName')}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
      <button type="submit" className="btn btn-sm btn-primary">{t('save')}</button>
      <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>{t('cancel')}</button>
    </form>
  );
}

function GroupChips({ groups, lockedGroups, selectedGroupIds, onChange }: CourseEditorProps & {
  onChange: (ids: string[]) => void;
}) {
  const t = useT(teachEditor);
  const selected = new Set(selectedGroupIds);
  return (
    <div className="cf-audience" role="group" aria-label={t('audienceGroup')}>
      <span className="label">{t('audience')}</span>
      {groups.length === 0 && lockedGroups.length === 0 && (
        <span className="muted">{t('noGroups')}</span>
      )}
      {groups.map((g) => {
        const on = selected.has(g.id);
        return (
          <button key={g.id} type="button" aria-pressed={on} className={on ? 'cf-chip on' : 'cf-chip'}
            title={on ? t('closeForGroup') : t('openForGroup')}
            onClick={() => onChange(groups.map((x) => x.id).filter((id) => (id === g.id ? !on : selected.has(id))))}>
            {on ? <IconCheck size={14} /> : <IconPlus size={14} />}{g.title}
          </button>
        );
      })}
      {lockedGroups.map((g) => (
        <span key={g.id} className="cf-chip on locked" title={t('lockedGroup')}>
          <IconLock size={13} />{g.title}<span className="visually-hidden">{t('openedByAdmin')}</span>
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
  const tr = useT(teachEditor);
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
      title: tr('deleteTopicQ', { title: t.title }),
      text: tr('deleteTopicText'),
      confirmLabel: tr('deleteTopic'), danger: true,
    }))) return;
    if (await act(`/api/teach/topics/${t.id}`, 'DELETE')) onDeleted(t.id);
  }

  return (
    <aside className="cf-card cf-topics" aria-label={tr('courseTopics')}>
      <div className="cf-topics-head">
        <h2>{tr('topicsTitle')}</h2>
        <span className="cf-count">{topics.length}</span>
      </div>
      {topics.length === 0 && <p className="muted">{tr('noTopics')}</p>}
      <ol className="cf-topic-list">
        {topics.map((t, i) => {
          const active = t.id === activeTopicId;
          const count = counts[t.id];
          return (
            <li key={t.id} className={active ? 'cf-topic active' : 'cf-topic'}>
              {renaming === t.id ? (
                <form className="cf-topic-rename" onSubmit={(e) => { e.preventDefault(); void rename(t); }}>
                  <input className="input" value={value} maxLength={LIMITS.title} autoFocus aria-label={tr('newTopicName')}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
                  <button type="submit" className="icon-btn cf-icon-btn" aria-label={tr('saveName')} title={tr('save')}><IconCheck size={16} /></button>
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
                    {count !== undefined && <span className="cf-topic-count" title={tr('blocks', { n: count })}>{count}</span>}
                  </Link>
                  <span className="cf-topic-tools">
                    <button type="button" className="icon-btn cf-icon-btn" aria-label={tr('topicUp', { title: t.title })} title={tr('moveUp')}
                      disabled={i === 0} onClick={() => act(`/api/teach/topics/${t.id}`, 'PATCH', { move: 'up' })}><IconArrowUp size={15} /></button>
                    <button type="button" className="icon-btn cf-icon-btn" aria-label={tr('topicDown', { title: t.title })} title={tr('moveDown')}
                      disabled={i === topics.length - 1} onClick={() => act(`/api/teach/topics/${t.id}`, 'PATCH', { move: 'down' })}><IconArrowDown size={15} /></button>
                    <RowMenu label={tr('topicActions', { title: t.title })} items={[
                      { key: 'rename', label: tr('rename'), icon: <IconEdit size={16} />, onSelect: () => { setRenaming(t.id); setValue(t.title); } },
                      { key: 'delete', label: tr('deleteTopic'), icon: <IconTrash size={16} />, danger: true, onSelect: () => void remove(t) },
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
          <input className="input" value={title} maxLength={LIMITS.title} autoFocus required aria-label={tr('newTopicAria')}
            placeholder={tr('topicName')} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setTitle(''); } }} />
          <div className="cf-inline">
            <button type="submit" className="btn btn-sm btn-primary">{tr('add')}</button>
            <button type="button" className="btn btn-sm" onClick={() => { setAdding(false); setTitle(''); }}>{tr('cancel')}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="cf-add-line" onClick={() => setAdding(true)}><IconPlus size={16} />{tr('addTopic')}</button>
      ))}
      {topics.length > 0 && !adding && (
        <LessonBuilderButton courseId={course.id} subject={course.subject} variant="line" label={tr('lessonWithAi')}
          onDone={(id) => onAdded(id)} />
      )}
    </aside>
  );
}

function FirstTopic({ courseId, subject, onAdd, onBuilt }: {
  courseId: string; subject: string; onAdd: (title: string) => Promise<boolean>; onBuilt: (topicId: string) => void;
}) {
  const t = useT(teachEditor);
  const [title, setTitle] = useState('');
  // ?build=1 — курс создан с выбором «Первый урок с помощником»: студия открывается сама.
  const [autoBuild, setAutoBuild] = useState(false);
  useEffect(() => { setAutoBuild(new URLSearchParams(window.location.search).get('build') === '1'); }, []);
  const [busy, setBusy] = useState(false);
  return (
    <div className="cf-card cf-hero">
      <span className="cf-hero-icon" aria-hidden="true"><IconCourses size={28} /></span>
      <h2>{t('firstTopic')}</h2>
      <p className="muted">
        {t('firstTopicText')}
      </p>
      <form className="cf-hero-form" onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        await onAdd(title);
        setBusy(false);
      }}>
        <input className="input" value={title} maxLength={LIMITS.title} required autoFocus aria-label={t('firstTopicAria')}
          placeholder={t('firstTopicPh')} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />{busy ? t('creating') : t('createTopic')}</button>
      </form>
      <div className="cf-hero-or"><span>{t('or')}</span></div>
      <LessonBuilderButton courseId={courseId} subject={subject} label={t('firstLessonAi')} autoOpen={autoBuild}
        onDone={(id) => onBuilt(id)} />
    </div>
  );
}

/* ----------------------------- добавить блок ---------------------------- */

/** Список вставки с поиском: «/» или «+» — и сразу печатать название. Стрелки и Enter работают. */
function InsertPalette({ busy, onPick, onClose, autoFocus = true }: {
  busy: boolean; onPick: (pick: InsertPick) => void; onClose?: () => void; autoFocus?: boolean;
}) {
  const tr = useT(teachEditor);
  const locale = useLocale();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const needle = q.trim().toLowerCase();
  const hit = (label: string, hint: string) => !needle || `${label} ${hint}`.toLowerCase().includes(needle);
  const groups = [
    ...BLOCK_GROUPS.map((g) => ({
      title: tr(g.title),
      items: g.kinds.filter((k) => hit(blockLabel(k, locale), blockHint(k, locale)))
        .map((k) => ({ key: k as string, pick: { kind: k } as InsertPick, icon: BLOCK_META[k].icon, label: blockLabel(k, locale), hint: blockHint(k, locale), badge: '' })),
    })),
    {
      title: tr('groupAssignment'),
      items: ASSIGNMENT_TYPES.filter((t) => hit(`${assignmentLabel(t, locale)} ${tr('assignmentWord')}`, assignmentHint(t, locale)))
        .map((t) => ({
          key: `a-${t}`, pick: { kind: 'assignment', assignmentType: t } as InsertPick, icon: ASSIGNMENT_META[t].icon,
          label: assignmentLabel(t, locale), hint: assignmentHint(t, locale),
          badge: ASSIGNMENT_META[t].auto ? tr('auto') : tr('manual'),
        })),
    },
  ].filter((g) => g.items.length > 0);
  const flatItems = groups.flatMap((g) => g.items);
  const at = Math.min(cursor, Math.max(0, flatItems.length - 1));

  return (
    <div className="cf-palette" role="dialog" aria-label={tr('addBlock')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((at + 1) % Math.max(1, flatItems.length)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((at - 1 + flatItems.length) % Math.max(1, flatItems.length)); }
        if (e.key === 'Enter' && flatItems[at] && !busy) { e.preventDefault(); onPick(flatItems[at].pick); }
      }}>
      <label className="cf-palette-search">
        <IconSearch size={16} />
        <input value={q} autoFocus={autoFocus} placeholder={tr('searchPh')} aria-label={tr('searchAria')}
          onChange={(e) => { setQ(e.target.value); setCursor(0); }} />
      </label>
      <div className="cf-palette-list">
        {groups.length === 0 && <p className="muted cf-palette-empty">{tr('noSuchBlock')}</p>}
        {groups.map((g) => (
          <div key={g.title} className="cf-palette-group">
            <span className="cf-palette-title">{g.title}</span>
            <div className="cf-palette-grid">
              {g.items.map((it) => (
                <button key={it.key} type="button" disabled={busy}
                  className={flatItems[at]?.key === it.key ? 'cf-palette-item active' : 'cf-palette-item'}
                  onMouseEnter={() => setCursor(flatItems.findIndex((x) => x.key === it.key))}
                  onClick={() => onPick(it.pick)}>
                  <span className={`cf-kind cf-kind-${it.pick.kind}`} aria-hidden="true">{it.icon(18)}</span>
                  <span className="cf-palette-text"><strong>{it.label}</strong><span className="muted">{it.hint}</span></span>
                  {it.badge && <span className={it.badge === tr('auto') ? 'cf-type-badge auto' : 'cf-type-badge'}>{it.badge}</span>}
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
  const t = useT(teachEditor);
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
      <button type="button" className="cf-insert-btn" aria-expanded={open} aria-label={t('insertHere')} title={t('insertHere')}
        onClick={() => setOpen((v) => !v)}><IconPlus size={14} /></button>
      {open && <InsertPalette busy={busy} onClose={() => setOpen(false)} onPick={async (pick) => { setOpen(false); await onPick(pick); }} />}
    </div>
  );
}

function AddBlockMenu({ empty, busy, onAdd }: { empty: boolean; busy: boolean; onAdd: (pick: InsertPick) => Promise<void> }) {
  const t = useT(teachEditor);
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
          <h3>{t('emptyTopic')}</h3>
          <p className="muted">{t('emptyTopicText')}</p>
        </div>
      )}
      {!empty && (
        <button type="button" className="cf-add-line" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <IconPlus size={16} />{t('addBlock')}<kbd>/</kbd>
        </button>
      )}
      {shown && <InsertPalette busy={busy} autoFocus={!empty} onClose={() => setOpen(false)}
        onPick={async (pick) => { await onAdd(pick); setOpen(false); }} />}
    </div>
  );
}

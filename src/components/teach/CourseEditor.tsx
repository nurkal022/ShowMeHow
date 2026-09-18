'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Block } from '@/lib/lms/blocks';
import { BLOCK_KINDS, BLOCK_KIND_LABELS, simulationIdsOf, type BlockKind } from '@/lib/lms/block-schema';
import { COURSE_STATUS_LABELS, LIMITS, type Course, type Topic } from '@/lib/lms/types';
import { answersHref, courseEditorHref, learnCourseHref } from '@/lib/lms/links';
import { callApi } from '@/components/cabinet/api';
import StatusPill from '@/components/cabinet/StatusPill';
import { IconArrowDown, IconArrowUp, IconEdit, IconPlus, IconTrash } from '@/components/icons';
import BlockEditor from './BlockEditor';
import BlockSummary from './BlockSummary';

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
}

type SaveState = 'idle' | 'saving' | 'saved';

/** Каждое действие — отдельный запрос; после ответа страница перечитывает данные. */
export default function CourseEditor(props: CourseEditorProps) {
  const { course, topics, activeTopicId, blocks } = props;
  const router = useRouter();
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function act<T>(path: string, method: string, body?: unknown): Promise<T | null> {
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
  }

  const patchCourse = (patch: Record<string, unknown>) => act(`/api/teach/courses/${course.id}`, 'PATCH', patch);

  return (
    <>
      <div className="cabinet-head">
        <div className="page-head">
          <Link href="/teach" className="muted">← Все курсы</Link>
          <h1>{course.title}</h1>
          <span className="row" style={{ gap: 8 }}>
            {course.subject && <span className="muted">{course.subject}</span>}
            <StatusPill tone={course.status === 'published' ? 'ok' : 'neutral'}>{COURSE_STATUS_LABELS[course.status]}</StatusPill>
          </span>
        </div>
        {save === 'saving' && <span className="muted" role="status">Сохраняю…</span>}
        {save === 'saved' && <span className="saved-note" role="status">Сохранено</span>}
        {course.status === 'published'
          ? <button type="button" className="btn" onClick={() => patchCourse({ status: 'draft' })}>Снять с публикации</button>
          : <button type="button" className="btn btn-primary" onClick={() => patchCourse({ status: 'published' })}>Опубликовать</button>}
        <a className="btn" href={learnCourseHref(course.id, true)} target="_blank" rel="noopener noreferrer">Как видит ученик</a>
        <Link className="btn btn-ghost" href={`/teach/courses/${course.id}/journal`}>Журнал</Link>
        <Link className="btn btn-ghost" href={`/teach/courses/${course.id}/progress`}>Прогресс</Link>
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      {course.status === 'published' && props.selectedGroupIds.length === 0 && props.lockedGroups.length === 0 && (
        <p className="warn-banner">Курс опубликован, но не открыт ни одной группе — ученики его не видят.</p>
      )}

      <CourseDetails course={course} onSave={patchCourse} />
      <GroupPicker {...props} onChange={(groupIds) => patchCourse({ groupIds })} />

      <div className="editor">
        <aside className="panel">
          <h2>Темы</h2>
          <TopicList course={course} topics={topics} activeTopicId={activeTopicId} act={act}
            onDeleted={(id) => { if (id === activeTopicId) router.push(courseEditorHref(course.id)); }} />
          <AddTopicForm onAdd={async (title) => {
            const data = await act<{ topic: Topic }>(`/api/teach/courses/${course.id}/topics`, 'POST', { title });
            if (data) router.push(courseEditorHref(course.id, data.topic.id));
            return data !== null;
          }} />
        </aside>

        <section className="editor-blocks">
          {!activeTopicId && <p className="empty-state">Сначала добавьте тему — слева. Например, «Колебания маятника».</p>}
          {activeTopicId && blocks.length === 0 && (
            <p className="empty-state">В теме пока нет блоков. Добавьте текст, тренажёр, лабораторию или задание.</p>
          )}
          {blocks.map((block, i) => {
            const simId = simulationIdsOf(block.body)[0] ?? null;
            const stale = props.stale[block.id] ?? 0;
            return (
              <article key={block.id} className="block-card" id={`block-${block.id}`}>
                <div className="block-card-head">
                  <span className="label">{BLOCK_KIND_LABELS[block.body.kind]}</span>
                  <button type="button" className="icon-btn" aria-label="Поднять блок" disabled={i === 0}
                    onClick={() => act(`/api/teach/blocks/${block.id}`, 'PATCH', { move: 'up' })}><IconArrowUp size={16} /></button>
                  <button type="button" className="icon-btn" aria-label="Опустить блок" disabled={i === blocks.length - 1}
                    onClick={() => act(`/api/teach/blocks/${block.id}`, 'PATCH', { move: 'down' })}><IconArrowDown size={16} /></button>
                  {editingId !== block.id && (
                    <button type="button" className="btn btn-sm" onClick={() => setEditingId(block.id)}>Изменить</button>
                  )}
                  <button type="button" className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirm('Удалить блок? Ответы учеников на него тоже удалятся.')) {
                        void act(`/api/teach/blocks/${block.id}`, 'DELETE');
                      }
                    }}>Удалить</button>
                </div>
                {editingId === block.id
                  ? <BlockEditor block={block} simulationTitle={simId ? props.simulationTitles[simId] ?? null : null}
                      onCancel={() => setEditingId(null)}
                      onSave={async (payload) => {
                        const ok = (await act(`/api/teach/blocks/${block.id}`, 'PATCH', { payload })) !== null;
                        if (ok) setEditingId(null);
                        return ok;
                      }} />
                  : <BlockSummary block={block} simulationTitle={simId ? props.simulationTitles[simId] ?? null : null}
                      missing={simId !== null && props.missingSimulations.includes(simId)} />}
                {block.body.kind === 'assignment' && (
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <Link className="btn btn-sm btn-ghost" href={answersHref(course.id, block.id)}>Ответы</Link>
                    {stale > 0 && (
                      <button type="button" className="btn btn-sm" onClick={() => act(`/api/teach/blocks/${block.id}/recalculate`, 'POST')}>
                        {`Пересчитать ${stale} сданных ответов`}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {activeTopicId && (
            <div className="add-block">
              <span className="label">Добавить блок:</span>
              {BLOCK_KINDS.map((kind: BlockKind) => (
                <button key={kind} type="button" className="btn btn-sm" aria-label={`Добавить блок «${BLOCK_KIND_LABELS[kind]}»`}
                  onClick={async () => {
                    const data = await act<{ block: Block }>(`/api/teach/topics/${activeTopicId}/blocks`, 'POST', { kind });
                    if (data) setEditingId(data.block.id);
                  }}>
                  <IconPlus size={15} />{BLOCK_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function CourseDetails({ course, onSave }: { course: Course; onSave: (patch: Record<string, unknown>) => Promise<unknown> }) {
  const [title, setTitle] = useState(course.title);
  const [subject, setSubject] = useState(course.subject);
  const [description, setDescription] = useState(course.description);
  return (
    <details className="panel">
      <summary>Название, предмет и описание</summary>
      <form className="settings-list" onSubmit={(e) => { e.preventDefault(); void onSave({ title, subject, description }); }}>
        <div className="form-grid">
          <label className="field"><span>Название</span>
            <input value={title} required maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field"><span>Предмет</span>
            <input value={subject} maxLength={LIMITS.subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Описание</span>
          <textarea className="input" rows={3} value={description} maxLength={LIMITS.description}
            onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>Сохранить описание</button>
      </form>
    </details>
  );
}

function GroupPicker({ groups, lockedGroups, selectedGroupIds, onChange }: CourseEditorProps & {
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedGroupIds);
  return (
    <section className="panel">
      <h2>Кому открыт</h2>
      {groups.length === 0 && lockedGroups.length === 0 && (
        <p className="muted">У вас пока нет групп. Их назначает администратор организации.</p>
      )}
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        {groups.map((g) => (
          <label key={g.id} className="chip">
            <input type="checkbox" checked={selected.has(g.id)} onChange={(e) => {
              const next = groups.map((x) => x.id).filter((id) => (id === g.id ? e.target.checked : selected.has(id)));
              onChange(next);
            }} />
            {g.title}
          </label>
        ))}
        {lockedGroups.map((g) => (
          <span key={g.id} className="chip" title="Эту группу открыл администратор организации.">{`${g.title} · открыт администратором`}</span>
        ))}
      </div>
    </section>
  );
}

type Act = <T>(path: string, method: string, body?: unknown) => Promise<T | null>;

function TopicList({ course, topics, activeTopicId, act, onDeleted }: {
  course: Course; topics: Topic[]; activeTopicId: string | null; act: Act; onDeleted: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [value, setValue] = useState('');
  if (topics.length === 0) return <p className="muted">Тем пока нет.</p>;
  return (
    <ul className="topic-list">
      {topics.map((t, i) => (
        <li key={t.id} className={t.id === activeTopicId ? 'topic-item active' : 'topic-item'}>
          {renaming === t.id ? (
            <form className="row" style={{ gap: 4, flex: 1 }} onSubmit={async (e) => {
              e.preventDefault();
              if (await act(`/api/teach/topics/${t.id}`, 'PATCH', { title: value })) setRenaming(null);
            }}>
              <input className="input" value={value} maxLength={LIMITS.title} autoFocus aria-label="Новое название темы"
                onChange={(e) => setValue(e.target.value)} />
              <button type="submit" className="btn btn-sm btn-primary">ОК</button>
            </form>
          ) : (
            <Link href={courseEditorHref(course.id, t.id)}>{`${i + 1}. ${t.title}`}</Link>
          )}
          <button type="button" className="icon-btn" aria-label={`Поднять тему «${t.title}»`} disabled={i === 0}
            onClick={() => act(`/api/teach/topics/${t.id}`, 'PATCH', { move: 'up' })}><IconArrowUp size={15} /></button>
          <button type="button" className="icon-btn" aria-label={`Опустить тему «${t.title}»`} disabled={i === topics.length - 1}
            onClick={() => act(`/api/teach/topics/${t.id}`, 'PATCH', { move: 'down' })}><IconArrowDown size={15} /></button>
          <button type="button" className="icon-btn" aria-label={`Переименовать тему «${t.title}»`}
            onClick={() => { setRenaming(t.id); setValue(t.title); }}><IconEdit size={15} /></button>
          <button type="button" className="icon-btn" aria-label={`Удалить тему «${t.title}»`}
            onClick={async () => {
              if (!confirm(`Удалить тему «${t.title}» вместе с блоками и ответами учеников?`)) return;
              if (await act(`/api/teach/topics/${t.id}`, 'DELETE')) onDeleted(t.id);
            }}><IconTrash size={15} /></button>
        </li>
      ))}
    </ul>
  );
}

function AddTopicForm({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  return (
    <form className="settings-list" onSubmit={async (e) => {
      e.preventDefault();
      if (await onAdd(title)) setTitle('');
    }}>
      <label className="field"><span>Новая тема</span>
        <input value={title} required maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-sm"><IconPlus size={15} />Добавить тему</button>
    </form>
  );
}

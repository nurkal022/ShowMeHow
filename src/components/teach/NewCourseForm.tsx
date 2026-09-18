'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITS, type Course, type Topic } from '@/lib/lms/types';
import { courseEditorHref } from '@/lib/lms/links';
import { callApi } from '@/components/cabinet/api';
import { IconCheck, IconPlus } from '@/components/icons';

/**
 * Новый курс: название, предмет, описание, группы и первая тема. После создания
 * учитель сразу попадает в редактор — в первую тему или к предложению её создать.
 */
export default function NewCourseForm({ org, groups = [] }: {
  org: string;
  /** Группы, которым учитель может открыть курс. Без них шаг с группами не показывается. */
  groups?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [firstTopic, setFirstTopic] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Назовите курс — так его увидят ученики.');
    setBusy(true);
    setError('');
    const res = await callApi<{ course: Course }>('/api/teach/courses', 'POST', { org, title, subject, description });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    const courseId = res.data.course.id;
    // Курс уже создан: неудача с группами или темой не должна оставить учителя на этой форме.
    if (groupIds.length > 0) await callApi(`/api/teach/courses/${courseId}`, 'PATCH', { groupIds });
    let topicId: string | null = null;
    if (firstTopic.trim()) {
      const topic = await callApi<{ topic: Topic }>(`/api/teach/courses/${courseId}/topics`, 'POST', { title: firstTopic });
      if (topic.ok) topicId = topic.data.topic.id;
    }
    router.push(courseEditorHref(courseId, topicId));
  }

  return (
    <form className="cf-new-course" onSubmit={submit} noValidate>
      <div className="form-grid cf-grid-top">
        <label className="field cf-span-2"><span>Название курса</span>
          <input value={title} required maxLength={LIMITS.title} placeholder="Физика 7: механика"
            aria-invalid={error && !title.trim() ? true : undefined}
            onChange={(e) => { setTitle(e.target.value); setError(''); }} />
        </label>
        <label className="field"><span>Предмет</span>
          <input value={subject} maxLength={LIMITS.subject} placeholder="Физика" onChange={(e) => setSubject(e.target.value)} />
        </label>
      </div>
      <label className="field"><span>Описание (необязательно) — его увидят ученики</span>
        <textarea className="input cf-textarea" rows={2} value={description} maxLength={LIMITS.description}
          placeholder="О чём курс и что ученик будет уметь в конце."
          onChange={(e) => setDescription(e.target.value)} />
      </label>
      {groups.length > 0 && (
        <div className="cf-audience" role="group" aria-label="Кому открыть курс">
          <span className="label">Кому открыть</span>
          {groups.map((g) => {
            const on = groupIds.includes(g.id);
            return (
              <button key={g.id} type="button" aria-pressed={on} className={on ? 'cf-chip on' : 'cf-chip'}
                onClick={() => setGroupIds((ids) => (on ? ids.filter((id) => id !== g.id) : [...ids, g.id]))}>
                {on ? <IconCheck size={14} /> : <IconPlus size={14} />}{g.title}
              </button>
            );
          })}
          <span className="muted">Ученики увидят курс только после публикации.</span>
        </div>
      )}
      <label className="field"><span>Первая тема (необязательно)</span>
        <input value={firstTopic} maxLength={LIMITS.title} placeholder="Например, «Колебания маятника»"
          onChange={(e) => setFirstTopic(e.target.value)} />
      </label>
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="cf-inline">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <IconPlus size={16} />{busy ? 'Создаю курс…' : 'Создать курс и открыть редактор'}
        </button>
        <span className="muted">Курс создаётся черновиком: ученики его не видят, пока вы не опубликуете.</span>
      </div>
    </form>
  );
}

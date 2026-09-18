'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITS, type Course } from '@/lib/lms/types';
import { callApi } from '@/components/cabinet/api';
import { IconPlus } from '@/components/icons';

export default function NewCourseForm({ org }: { org: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await callApi<{ course: Course }>('/api/teach/courses', 'POST', { org, title, subject, description });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    router.push(`/teach/courses/${res.data.course.id}`);
  }

  return (
    <form className="settings-list" onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Название курса</span>
          <input value={title} required maxLength={LIMITS.title} placeholder="Физика 7: механика"
            onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field"><span>Предмет</span>
          <input value={subject} maxLength={LIMITS.subject} placeholder="Физика" onChange={(e) => setSubject(e.target.value)} />
        </label>
      </div>
      <label className="field"><span>Описание (необязательно)</span>
        <textarea className="input" rows={2} value={description} maxLength={LIMITS.description}
          onChange={(e) => setDescription(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy}>
        <IconPlus size={16} />{busy ? 'Создаю…' : 'Создать курс'}
      </button>
      {error && <p className="error-box">{error}</p>}
    </form>
  );
}

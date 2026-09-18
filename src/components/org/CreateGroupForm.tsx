'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { withOrgParam } from '@/lib/lms/links';
import { IconPlus } from '@/components/icons';

export default function CreateGroupForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Введите название группы, например «7А».');
    setBusy(true);
    setError('');
    const res = await callApi<{ group: { id: string; title: string } }>(`/api/org/${slug}/groups`, 'POST', { title });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setTitle('');
    setCreated(res.data.group);
    router.refresh();
  }

  return (
    <form className="cf-inline-form" onSubmit={submit} noValidate>
      <label className="field"><span>Название группы</span>
        <input value={title} required maxLength={60} placeholder="7А" aria-invalid={error ? true : undefined}
          onChange={(e) => { setTitle(e.target.value); setError(''); }} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />{busy ? 'Создаю…' : 'Создать группу'}</button>
      {error && <p className="error-box cf-full" role="alert">{error}</p>}
      {created && (
        <p className="ok-box cf-full" role="status">
          {`Группа «${created.title}» создана. `}
          <a href={withOrgParam(`/org/groups/${created.id}`, slug)}>Добавить в неё учеников</a>
        </p>
      )}
    </form>
  );
}

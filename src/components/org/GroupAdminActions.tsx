'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { withOrgParam } from '@/lib/lms/links';

export default function GroupAdminActions({ slug, groupId, title }: { slug: string; groupId: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState('');

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const res = await callApi(`/api/org/${slug}/groups/${groupId}`, 'PATCH', { title: value });
    if (!res.ok) return setError(res.error);
    setEditing(false);
    setError('');
    router.refresh();
  }

  async function archive() {
    if (!confirm(`Отправить группу «${title}» в архив? Ученики останутся в организации, курсы группе станут недоступны.`)) return;
    const res = await callApi(`/api/org/${slug}/groups/${groupId}`, 'DELETE');
    if (!res.ok) return setError(res.error);
    router.push(withOrgParam('/org/groups', slug));
  }

  return (
    <>
      {editing ? (
        <form className="row" onSubmit={rename}>
          <input className="input" value={value} maxLength={60} aria-label="Новое название группы"
            onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="btn btn-primary">Сохранить</button>
          <button type="button" className="btn" onClick={() => { setEditing(false); setValue(title); }}>Отмена</button>
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => setEditing(true)}>Переименовать</button>
      )}
      <button type="button" className="btn btn-danger" onClick={archive}>В архив</button>
      {error && <p className="error-box" style={{ flexBasis: '100%' }}>{error}</p>}
    </>
  );
}

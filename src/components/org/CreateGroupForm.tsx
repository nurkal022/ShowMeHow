'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { IconPlus } from '@/components/icons';

export default function CreateGroupForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await callApi(`/api/org/${slug}/groups`, 'POST', { title });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setTitle('');
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field"><span>Название группы</span>
        <input value={title} required maxLength={60} placeholder="7А" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />Создать группу</button>
      {error && <p className="error-box" style={{ gridColumn: '1 / -1' }}>{error}</p>}
    </form>
  );
}

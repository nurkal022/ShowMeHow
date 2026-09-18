'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';

export default function OrgArchiveButton({ orgId, archived }: { orgId: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    if (!archived && !confirm('Отправить организацию в архив? Её участники потеряют разделы и права, данные сохранятся.')) return;
    setBusy(true);
    const res = await callApi(`/api/admin/orgs/${orgId}`, 'PATCH', { archived: !archived });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }
  return (
    <>
      <button type="button" className={archived ? 'btn' : 'btn btn-danger'} disabled={busy} onClick={toggle}>
        {archived ? 'Вернуть' : 'В архив'}
      </button>
      {error && <p className="error-box">{error}</p>}
    </>
  );
}

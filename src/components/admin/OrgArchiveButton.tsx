'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { useConfirm } from '@/components/lms/ui/useConfirm';

export default function OrgArchiveButton({ orgId, archived }: { orgId: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, confirmDialog] = useConfirm();
  async function toggle() {
    if (!archived && !(await ask({
      title: 'Отправить организацию в архив?',
      text: 'Её участники потеряют разделы и права, данные сохранятся. Организацию можно будет вернуть.',
      confirmLabel: 'В архив', danger: true,
    }))) return;
    setBusy(true);
    setError('');
    const res = await callApi(`/api/admin/orgs/${orgId}`, 'PATCH', { archived: !archived });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }
  return (
    <>
      <button type="button" className={archived ? 'btn' : 'btn btn-danger'} disabled={busy} onClick={toggle}>
        {archived ? 'Вернуть из архива' : 'В архив'}
      </button>
      {error && <p className="error-box cf-full" role="alert">{error}</p>}
      {confirmDialog}
    </>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { useConfirm } from '@/components/lms/ui/useConfirm';
import { useT } from '@/i18n/client';
import { admin } from '@/i18n/messages/admin';

export default function OrgArchiveButton({ orgId, archived }: { orgId: string; archived: boolean }) {
  const router = useRouter();
  const t = useT(admin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, confirmDialog] = useConfirm();
  async function toggle() {
    if (!archived && !(await ask({
      title: t('archiveQ'),
      text: t('archiveText'),
      confirmLabel: t('toArchive'), danger: true,
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
        {archived ? t('restore') : t('toArchive')}
      </button>
      {error && <p className="error-box cf-full" role="alert">{error}</p>}
      {confirmDialog}
    </>
  );
}

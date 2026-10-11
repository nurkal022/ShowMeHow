'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { useT } from '@/i18n/client';
import { community } from '@/i18n/messages/community';

export default function RevokeButton({ userId }: { userId: string }) {
  const t = useT(community);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => {
      if (!window.confirm(t('revokeConfirm'))) return;
      setBusy(true);
      const res = await callApi('/api/admin/community', 'POST', { action: 'revoke', userId });
      setBusy(false);
      if (res.ok) router.refresh();
    }}>{t('revoke')}</button>
  );
}

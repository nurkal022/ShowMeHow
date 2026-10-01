'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { useT } from '@/i18n/client';
import { admin } from '@/i18n/messages/admin';

export default function RegistrationToggle({ open }: { open: boolean }) {
  const router = useRouter();
  const t = useT(admin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="cf-setting">
      <div>
        <strong>{t('regTitle')}</strong>
        <p className="muted">{open ? t('regOpen') : t('regClosed')}</p>
        {error && <p className="error-box">{error}</p>}
      </div>
      <button type="button" role="switch" aria-checked={open} disabled={busy} className={open ? 'cf-switch on' : 'cf-switch'}
        aria-label={t('regTitle')}
        onClick={async () => {
          setBusy(true);
          setError('');
          const res = await callApi('/api/admin/settings', 'PATCH', { registrationOpen: !open });
          setBusy(false);
          if (!res.ok) return setError(res.error);
          router.refresh();
        }}><i /></button>
    </div>
  );
}

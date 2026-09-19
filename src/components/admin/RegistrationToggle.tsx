'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';

export default function RegistrationToggle({ open }: { open: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="cf-setting">
      <div>
        <strong>Самостоятельная регистрация</strong>
        <p className="muted">{open
          ? 'Открыта: любой, кто зайдёт на сайт, может завести аккаунт и тратить пробные генерации.'
          : 'Закрыта: аккаунты выдают только школы и вы. Кнопка «Регистрация» на сайте скрыта.'}</p>
        {error && <p className="error-box">{error}</p>}
      </div>
      <button type="button" role="switch" aria-checked={open} disabled={busy} className={open ? 'cf-switch on' : 'cf-switch'}
        aria-label="Самостоятельная регистрация"
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

'use client';
import { useState } from 'react';
import { useT } from '@/i18n/client';
import { app } from '@/i18n/messages/app';

/** Полоса поверх любой страницы, пока админ платформы смотрит глазами другого человека. */
export default function ImpersonationBar({ viewer }: { viewer: string }) {
  const t = useT(app);
  const [busy, setBusy] = useState(false);
  async function back() {
    setBusy(true);
    const res = await fetch('/api/auth/impersonate', { method: 'DELETE' }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    window.location.assign(data?.next ?? '/admin');
  }
  return (
    <div className="impersonation-bar no-print" role="status">
      <span>{t('impersonating')} <strong>{viewer}</strong></span>
      <button type="button" className="btn" disabled={busy} onClick={back}>{t('backToAdmin')}</button>
    </div>
  );
}

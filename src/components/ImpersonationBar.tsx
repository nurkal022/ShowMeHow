'use client';
import { useState } from 'react';

/** Полоса поверх любой страницы, пока админ платформы смотрит глазами другого человека. */
export default function ImpersonationBar({ viewer }: { viewer: string }) {
  const [busy, setBusy] = useState(false);
  async function back() {
    setBusy(true);
    const res = await fetch('/api/auth/impersonate', { method: 'DELETE' }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    window.location.assign(data?.next ?? '/admin');
  }
  return (
    <div className="impersonation-bar no-print" role="status">
      <span>Режим «Войти как»: вы в аккаунте <strong>{viewer}</strong></span>
      <button type="button" className="btn" disabled={busy} onClick={back}>Вернуться в админку</button>
    </div>
  );
}

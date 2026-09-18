'use client';
import { useState } from 'react';
import { callApi } from '@/components/cabinet/api';

/** Вход от имени человека: после ответа — полная перезагрузка, чтобы вся страница увидела новую сессию. */
export function useImpersonate(): [(userId: string, org?: string) => Promise<void>, boolean, string] {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go(userId: string, org?: string) {
    setBusy(true);
    setError('');
    const res = await callApi<{ next: string }>('/api/admin/impersonate', 'POST', { userId, org });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    window.location.assign(res.data.next);
  }
  return [go, busy, error];
}

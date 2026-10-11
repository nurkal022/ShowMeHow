'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { useT } from '@/i18n/client';
import { community } from '@/i18n/messages/community';

/** Карточка в профиле: подключить Telegram (ссылка в бота) или отвязать. */
export default function TelegramCard({ linkedAs }: { linkedAs: string | null }) {
  const t = useT(community);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState(false);

  async function connect() {
    setBusy(true); setError('');
    // Окно открываем до запроса: после await браузер считает window.open всплывающим окном и блокирует.
    const win = window.open('about:blank', '_blank');
    const res = await callApi<{ url: string }>('/api/me/telegram', 'POST');
    setBusy(false);
    if (!res.ok) { win?.close(); return setError(res.error); }
    if (win) win.location.href = res.data.url; else window.location.href = res.data.url;
    setHint(true);
  }

  async function unlink() {
    if (!window.confirm(t('unlinkConfirm'))) return;
    setBusy(true);
    const res = await callApi('/api/me/telegram', 'DELETE');
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <section className="panel telegram-card">
      <div>
        <h2>{t('cardTitle')}</h2>
        <p className="muted">{linkedAs ? t('cardLinked', { name: linkedAs }) : t('cardNone')}</p>
        {hint && <p className="muted">{t('connectHint')}</p>}
        {error && <p className="error-box">{error}</p>}
      </div>
      {linkedAs
        ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={unlink}>{t('unlink')}</button>
        : <button type="button" className="btn btn-primary" disabled={busy} onClick={connect}>{t('connect')}</button>}
    </section>
  );
}

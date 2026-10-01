'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Notification } from '@/lib/notifications';
import { IconBell, IconCheck } from '@/components/icons';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { formatDate, translator } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import { app } from '@/i18n/messages/app';

const POLL_MS = 45_000;

function ago(iso: string, locale: Locale): string {
  const t = translator(app, locale);
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return t('justNow');
  if (min < 60) return t('minAgo', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('hAgo', { n: h });
  return formatDate(iso, locale, { day: 'numeric', month: 'short' });
}

const DOT: Record<Notification['kind'], string> = { graded: 'ok', returned: 'warn', submitted: 'accent', published: 'accent' };

/**
 * Колокольчик в шапке сайта и кабинетов. Спрашивает сервер раз в 45 секунд, пока вкладка видна;
 * новое непрочитанное заставляет колокольчик качнуться. Открытие списка ничего не помечает —
 * прочитанным становится то, по чему перешли, или всё по кнопке.
 */
export default function NotificationsBell() {
  const t = useT(app);
  const f = useFormat();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [ring, setRing] = useState(false);
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/notifications');
      if (!res.ok) return;
      const data = await res.json() as { items: Notification[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
      if (data.unread > last.current) { setRing(true); setTimeout(() => setRing(false), 1200); }
      last.current = data.unread;
    } catch { /* сеть пропала — попробуем в следующий раз */ }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  async function read(ids?: string[]) {
    await fetch('/api/me/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {});
    setItems((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    last.current = ids ? Math.max(0, last.current - ids.length) : 0;
  }

  return (
    <div className="bell" ref={box}>
      <button type="button" className={ring ? 'bell-btn ring' : 'bell-btn'} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? t('notificationsUnread', { n: unread }) : t('notifications')} onClick={() => { setOpen((v) => !v); if (!open) void load(); }}>
        <IconBell size={19} />
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label={t('notifications')}>
          <header>
            <strong>{t('notifications')}</strong>
            {unread > 0 && <button type="button" className="link-btn" onClick={() => void read()}><IconCheck size={13} /> {t('readAll')}</button>}
          </header>
          {items.length === 0 ? (
            <div className="bell-empty"><IconBell size={22} /><p>{t('notifEmpty')}</p></div>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={n.read ? 'read' : undefined}>
                  <Link href={n.href} onClick={() => { setOpen(false); if (!n.read) void read([n.id]); }}>
                    <span className={`bell-dot ${DOT[n.kind]}`} aria-hidden="true" />
                    <span className="bell-text">
                      <strong>{f.message(n.title)}{n.count > 1 && <em>{` · ${n.count}`}</em>}</strong>
                      {n.body && <span>{f.message(n.body)}</span>}
                      <small>{ago(n.at, locale)}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useT } from '@/i18n/client';
import { demo } from '@/i18n/messages/demo';

export type DemoView = 'org' | 'teacher' | 'student' | 'research' | 'create';

const VIEWS: DemoView[] = ['org', 'teacher', 'student', 'research', 'create'];

/**
 * Полоса демо-режима. С песочницей — переключатель ролей: руководство и исследования — свой
 * аккаунт, преподаватель и студент — «глазами» участников песочницы. Без песочницы — приглашение её создать.
 */
export default function DemoBar({ slug, as, viewer }: { slug: string | null; as: 'teacher' | 'student' | null; viewer?: string }) {
  const t = useT(demo);
  const path = usePathname();
  // В своём аккаунте роль видна по разделу: кабинеты — руководство, остальное — по адресу.
  const current: DemoView | null = as ?? (path.startsWith('/org') || path.startsWith('/teach') ? 'org'
    : path.startsWith('/research') ? 'research' : path === '/' ? 'create' : null);
  const [busy, setBusy] = useState<DemoView | 'invite' | null>(null);
  const [error, setError] = useState(false);

  async function call(view: string): Promise<string | null> {
    const res = await fetch('/api/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view }),
    }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    return data?.next ?? null;
  }

  async function go(view: DemoView) {
    if (busy) return;
    setBusy(view); setError(false);
    const impersonating = current === 'teacher' || current === 'student';
    let next: string | null;
    if (view === 'teacher' || view === 'student') next = await call(view);
    else {
      // Свой аккаунт: из чужого сначала вернуться, дальше — в нужный раздел.
      next = impersonating ? await call('org') : 'ok';
      if (next) next = view === 'org' ? `/org?org=${slug}` : view === 'research' ? '/research' : '/';
    }
    if (next) window.location.assign(next);
    else { setBusy(null); setError(true); }
  }

  async function create() {
    setBusy('invite'); setError(false);
    const next = await call('create');
    if (next) window.location.assign(next);
    else { setBusy(null); setError(true); }
  }

  if (!slug) {
    return (
      <div className="demo-bar no-print" role="region" aria-label={t('aria')}>
        <span>{t('invite')}</span>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={create}>
          {busy ? t('preparing') : t('inviteBtn')}
        </button>
        {error && <span className="demo-bar-error">{t('failed')}</span>}
      </div>
    );
  }
  return (
    <div className="demo-bar no-print" role="region" aria-label={t('aria')}>
      <strong className="demo-bar-label">{t('label')}</strong>
      <span className="demo-bar-look">{t('lookAs')}</span>
      <div className="demo-bar-views" role="group">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-pressed={current === v} className={current === v ? 'on' : ''}
            disabled={!!busy} onClick={() => go(v)}>
            {busy === v ? '…' : t(v)}
          </button>
        ))}
      </div>
      {viewer && (current === 'teacher' || current === 'student') && <span className="demo-bar-who">{viewer}</span>}
      {error ? <span className="demo-bar-error">{t('failed')}</span> : <span className="demo-bar-hint">{t('hint')}</span>}
    </div>
  );
}

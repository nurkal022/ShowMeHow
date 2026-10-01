'use client';
import { useState } from 'react';
import Link from 'next/link';
import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';
import { IconCheck, IconEdit, IconSliders } from '@/components/icons';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { learnMe } from '@/i18n/messages/learn-me';

/** Шапка профиля: имя правится на месте, остальное — справочно. */
export default function StudentProfile({ name, contact, places }: {
  name: string; contact: string; places: { org: string; groups: string[] }[];
}) {
  const t = useT(learnMe);
  const tc = useT(common);
  const [value, setValue] = useState(name);
  const [edit, setEdit] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch('/api/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: value.trim() || null }),
    });
    setBusy(false);
    if (isUnauthorized(res)) { loginWithReturnTo('/learn/me'); return; }
    if (res.ok) { setEdit(false); setSaved(true); setTimeout(() => setSaved(false), 2200); }
  }

  const shown = value.trim() || contact;
  return (
    <header className="sp-head">
      <span className="sp-avatar" aria-hidden="true">{shown.slice(0, 1).toUpperCase()}</span>
      <div className="sp-head-text">
        {edit
          ? (
            <div className="sp-name-edit">
              <input className="input" value={value} maxLength={60} placeholder={t('namePlaceholder')} autoFocus
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setValue(name); setEdit(false); } }} />
              <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void save()}>
                {busy ? tc('saving') : tc('save')}
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setValue(name); setEdit(false); }}>{tc('cancel')}</button>
            </div>
          )
          : (
            <h1>
              {shown}
              <button type="button" className="sp-edit" onClick={() => setEdit(true)} aria-label={t('editName')}><IconEdit size={15} /></button>
              {saved && <span className="sp-saved"><IconCheck size={13} />{t('savedLower')}</span>}
            </h1>
          )}
        <p className="muted">
          {contact}
          {places.map((p) => ` · ${p.org}${p.groups.length ? `, ${p.groups.join(', ')}` : ''}`).join('')}
        </p>
      </div>
      <Link className="btn" href="/profile"><IconSliders size={16} />{t('settings')}</Link>
    </header>
  );
}

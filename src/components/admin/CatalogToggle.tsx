'use client';
import { useState } from 'react';
import { callApi } from '@/components/cabinet/api';
import { useT } from '@/i18n/client';
import { admin } from '@/i18n/messages/admin';

export default function CatalogToggle({ id, title, initial }: { id: string; title: string; initial: boolean }) {
  const t = useT(admin);
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle(next: boolean) {
    setBusy(true);
    setError('');
    const res = await callApi(`/api/admin/catalog/${id}`, 'PATCH', { catalog: next });
    setBusy(false);
    if (res.ok) setOn(next);
    else setError(res.error);
  }
  return (
    <label className="cf-switch" title={error || undefined}>
      <input type="checkbox" role="switch" checked={on} disabled={busy} aria-label={t('inCatalogOf', { title })}
        onChange={(e) => toggle(e.target.checked)} />
      <span className="cf-switch-track" aria-hidden="true" />
      <span className="cf-switch-text">{on ? t('inCatalog') : t('hidden')}</span>
      {error && <span className="cf-field-error" role="alert">{error}</span>}
    </label>
  );
}

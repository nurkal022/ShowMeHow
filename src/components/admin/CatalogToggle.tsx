'use client';
import { useState } from 'react';
import { callApi } from '@/components/cabinet/api';

export default function CatalogToggle({ id, title, initial }: { id: string; title: string; initial: boolean }) {
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
      <input type="checkbox" role="switch" checked={on} disabled={busy} aria-label={`«${title}» в общем каталоге`}
        onChange={(e) => toggle(e.target.checked)} />
      <span className="cf-switch-track" aria-hidden="true" />
      <span className="cf-switch-text">{on ? 'в каталоге' : 'скрыта'}</span>
      {error && <span className="cf-field-error" role="alert">{error}</span>}
    </label>
  );
}

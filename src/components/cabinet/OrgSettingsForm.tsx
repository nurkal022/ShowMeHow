'use client';
import { useState } from 'react';
import type { OrgSettings } from '@/lib/org/settings';
import { callApi } from './api';
import { useT } from '@/i18n/client';
import { cabinet } from '@/i18n/messages/cabinet';

/** Три переключателя цикла 0 — в карточке организации админки и в /org/settings. */
export default function OrgSettingsForm({ endpoint, settings }: { endpoint: string; settings: OrgSettings }) {
  const t = useT(cabinet);
  const [value, setValue] = useState(settings);
  const [limit, setLimit] = useState(String(settings.teacherGenerationLimit));
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  async function save(patch: Partial<OrgSettings>) {
    setState('saving');
    setError('');
    const res = await callApi<{ settings: OrgSettings }>(endpoint, 'PATCH', { settings: patch });
    if (!res.ok) {
      setError(res.error);
      setState('idle');
      return;
    }
    setValue(res.data.settings);
    setLimit(String(res.data.settings.teacherGenerationLimit));
    setState('saved');
  }

  function saveLimit() {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      setError(t('set_limitError'));
      return;
    }
    if (n !== value.teacherGenerationLimit) void save({ teacherGenerationLimit: n });
  }

  return (
    <div className="settings-list">
      <label className="row">
        <span className="row-label">
          <strong>{t('set_generate')}</strong>
          <span>{t('set_generateHint')}</span>
        </span>
        <span className="spacer" />
        <input type="checkbox" checked={value.studentsCanGenerate} disabled={state === 'saving'}
          onChange={(e) => save({ studentsCanGenerate: e.target.checked })} />
      </label>
      <label className="row">
        <span className="row-label">
          <strong>{t('set_long')}</strong>
          <span>{t('set_longHint')}</span>
        </span>
        <span className="spacer" />
        <input type="checkbox" checked={value.studentLongSessions} disabled={state === 'saving'}
          onChange={(e) => save({ studentLongSessions: e.target.checked })} />
      </label>
      <div className="row">
        <span className="row-label">
          <strong>{t('set_limit')}</strong>
          <span>{t('set_limitHint')}</span>
        </span>
        <span className="spacer" />
        <input className="input" style={{ width: 120 }} type="number" min={0} max={100000}
          aria-label={t('set_limit')} value={limit}
          onChange={(e) => setLimit(e.target.value)} onBlur={saveLimit} />
      </div>
      {state === 'saved' && <span className="saved-note">{t('saved')}</span>}
      {error && <p className="error-box">{error}</p>}
    </div>
  );
}

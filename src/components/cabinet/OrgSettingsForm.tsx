'use client';
import { useState } from 'react';
import type { OrgSettings } from '@/lib/org/settings';
import { callApi } from './api';

/** Три переключателя цикла 0 — в карточке организации админки и в /org/settings. */
export default function OrgSettingsForm({ endpoint, settings }: { endpoint: string; settings: OrgSettings }) {
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
      setError('Лимит — целое число от 0 до 100 000.');
      return;
    }
    if (n !== value.teacherGenerationLimit) void save({ teacherGenerationLimit: n });
  }

  return (
    <div className="settings-list">
      <label className="row">
        <span className="row-label">
          <strong>Ученики могут генерировать</strong>
          <span>Без этого раздел «Создать» ученикам не показывается.</span>
        </span>
        <span className="spacer" />
        <input type="checkbox" checked={value.studentsCanGenerate} disabled={state === 'saving'}
          onChange={(e) => save({ studentsCanGenerate: e.target.checked })} />
      </label>
      <label className="row">
        <span className="row-label">
          <strong>Длинные сессии учеников</strong>
          <span>Ученики остаются в системе 30 дней вместо одного учебного дня.</span>
        </span>
        <span className="spacer" />
        <input type="checkbox" checked={value.studentLongSessions} disabled={state === 'saving'}
          onChange={(e) => save({ studentLongSessions: e.target.checked })} />
      </label>
      <div className="row">
        <span className="row-label">
          <strong>Лимит генераций учителя</strong>
          <span>Сколько симуляций может создать каждый учитель за всё время.</span>
        </span>
        <span className="spacer" />
        <input className="input" style={{ width: 120 }} type="number" min={0} max={100000}
          aria-label="Лимит генераций учителя" value={limit}
          onChange={(e) => setLimit(e.target.value)} onBlur={saveLimit} />
      </div>
      {state === 'saved' && <span className="saved-note">Сохранено</span>}
      {error && <p className="error-box">{error}</p>}
    </div>
  );
}

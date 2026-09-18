'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupTeacher } from '@/lib/org/groups';
import { callApi } from '@/components/cabinet/api';
import { IconClose, IconPlus } from '@/components/icons';

export default function GroupTeachers({ slug, groupId, assigned, candidates }: {
  slug: string; groupId: string; assigned: GroupTeacher[]; candidates: GroupTeacher[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const free = candidates.filter((c) => !assigned.some((a) => a.userId === c.userId));

  async function set(userId: string, value: boolean) {
    setBusy(true);
    setError('');
    const res = await callApi(`/api/org/${slug}/groups/${groupId}/teachers`, 'PUT', { userId, assigned: value });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPick('');
    router.refresh();
  }

  return (
    <div className="settings-list">
      {assigned.length === 0
        ? <p className="muted">Учителя не назначены. Назначенный учитель видит группу, может открыть ей курс и распечатать лист паролей.</p>
        : (
          <ul className="cf-people-chips">
            {assigned.map((t) => (
              <li key={t.userId} className="cf-person-chip">
                <span className="cf-avatar" aria-hidden="true">{t.label.trim().charAt(0).toUpperCase()}</span>
                <span>{t.label}</span>
                <button type="button" className="icon-btn cf-icon-btn" disabled={busy} title="Снять с группы"
                  aria-label={`Снять учителя ${t.label} с группы`} onClick={() => set(t.userId, false)}><IconClose size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      {free.length > 0 ? (
        <div className="cf-inline-form">
          <label className="field"><span>Назначить учителя</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Выберите учителя</option>
              {free.map((c) => <option key={c.userId} value={c.userId}>{c.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={busy || !pick} onClick={() => set(pick, true)}><IconPlus size={16} />Назначить</button>
        </div>
      ) : candidates.length === 0 && (
        <p className="muted">В организации пока нет учителей. Добавьте их в разделе «Учителя».</p>
      )}
      {error && <p className="error-box" role="alert">{error}</p>}
    </div>
  );
}

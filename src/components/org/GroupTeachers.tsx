'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupTeacher } from '@/lib/org/groups';
import { callApi } from '@/components/cabinet/api';

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
        : assigned.map((t) => (
          <div key={t.userId} className="row">
            <span>{t.label}</span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => set(t.userId, false)}>Снять</button>
          </div>
        ))}
      {free.length > 0 && (
        <div className="form-grid">
          <label className="field"><span>Учитель</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Выберите учителя</option>
              {free.map((c) => <option key={c.userId} value={c.userId}>{c.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={busy || !pick} onClick={() => set(pick, true)}>Назначить</button>
        </div>
      )}
      {error && <p className="error-box">{error}</p>}
    </div>
  );
}

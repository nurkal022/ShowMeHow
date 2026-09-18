'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CreatedStudent, RosterPreview } from '@/lib/org/bulk';
import { createStudentsLabel } from '@/lib/org/roster';
import { callApi } from '@/components/cabinet/api';
import RosterPreviewTable from './RosterPreviewTable';

/** Ученики группы: вставка списка или CSV, предпросмотр, создание; ниже — один ученик. */
export default function BulkStudents({ slug, groupId }: { slug: string; groupId: string }) {
  const router = useRouter();
  const endpoint = `/api/org/${slug}/groups/${groupId}/students`;
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  function edit(next: string) {
    setText(next);
    setPreview(null);
    setDone('');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    edit(await file.text());
  }

  async function check() {
    setBusy(true);
    setError('');
    const res = await callApi<RosterPreview>(endpoint, 'POST', { text, dryRun: true });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPreview(res.data);
  }

  async function create(body: string, reset: () => void) {
    setBusy(true);
    setError('');
    const res = await callApi<{ created: CreatedStudent[] }>(endpoint, 'POST', { text: body, dryRun: false });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    reset();
    const n = res.data.created.length;
    setDone(n === 0 ? 'Новых учеников нет: все уже в группе.' : `Готово, учеников создано: ${n}.`);
    router.refresh();
  }

  return (
    <div className="settings-list">
      <label className="field"><span>Вставьте список: по одному человеку на строку, Фамилия Имя</span>
        <textarea className="input" rows={8} value={text} placeholder={'Иванов Иван\nПетрова Анна'}
          onChange={(e) => edit(e.target.value)} />
      </label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <label className="btn btn-secondary">
          Загрузить CSV
          <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={onFile} />
        </label>
        <span className="muted">CSV: «Фамилия;Имя» или «Фамилия,Имя», кодировка UTF-8, до 300 строк.</span>
        <span className="spacer" />
        <button type="button" className="btn" disabled={busy || !text.trim()} onClick={check}>Проверить список</button>
      </div>
      {preview && <RosterPreviewTable rows={preview.rows} />}
      {preview && (
        <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
          disabled={busy || preview.creatable === 0}
          onClick={() => create(text, () => { setText(''); setPreview(null); })}>
          {createStudentsLabel(preview.creatable)}
        </button>
      )}
      <div className="divider" />
      <form className="form-grid" onSubmit={(e) => {
        e.preventDefault();
        void create(`${lastName};${firstName}`, () => { setLastName(''); setFirstName(''); });
      }}>
        <label className="field"><span>Фамилия</span>
          <input value={lastName} required maxLength={60} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="field"><span>Имя</span>
          <input value={firstName} required maxLength={60} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy}>Добавить ученика</button>
      </form>
      {done && (
        <p className="ok-box">
          {done} <Link href={`/org/groups/${groupId}/credentials`}>Открыть лист паролей</Link>
        </p>
      )}
      {error && <p className="error-box">{error}</p>}
    </div>
  );
}

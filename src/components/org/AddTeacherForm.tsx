'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import PersonFields, { EMPTY_PERSON, personPayload, type PersonValue } from '@/components/cabinet/PersonFields';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { IconPlus } from '@/components/icons';

interface Added { label: string; tempPassword: string | null; created: boolean }

export default function AddTeacherForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [person, setPerson] = useState<PersonValue>(EMPTY_PERSON);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState<Added | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const res = await callApi<Added>(`/api/org/${slug}/teachers`, 'POST', personPayload(person));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPerson(EMPTY_PERSON);
    if (res.data.tempPassword) setSecret(res.data);
    else setNotice(`${res.data.label} уже был в системе и теперь учитель вашей организации.`);
    router.refresh();
  }

  return (
    <form className="cf-person-form" onSubmit={submit}>
      <PersonFields who="учителя" value={person} onChange={setPerson} />
      <p className="muted">
        Новому учителю создастся временный пароль — он будет показан один раз. Если аккаунт с такой почтой уже есть,
        он станет учителем без нового пароля.
      </p>
      {notice && <p className="ok-box" role="status">{notice}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="cf-inline">
        <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />{busy ? 'Добавляю…' : 'Добавить учителя'}</button>
      </div>
      {secret?.tempPassword && (
        <SecretDialog title="Учитель добавлен" secret={secret.tempPassword} onClose={() => setSecret(null)}
          lines={[`${secret.label} входит с этим временным паролем и при первом входе задаёт свой.`]} />
      )}
    </form>
  );
}

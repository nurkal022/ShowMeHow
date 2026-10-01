'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import PersonFields, { EMPTY_PERSON, personPayload, type PersonValue } from '@/components/cabinet/PersonFields';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { IconPlus } from '@/components/icons';
import { useT } from '@/i18n/client';
import { orgPeople } from '@/i18n/messages/org-people';

interface Added { label: string; tempPassword: string | null; created: boolean }

export default function AddTeacherForm({ slug }: { slug: string }) {
  const router = useRouter();
  const t = useT(orgPeople);
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
    else setNotice(t('teacherExisted', { name: res.data.label }));
    router.refresh();
  }

  return (
    <form className="cf-person-form" onSubmit={submit}>
      <PersonFields who="teacher" value={person} onChange={setPerson} />
      <p className="muted">{t('teacherFormNote')}</p>
      {notice && <p className="ok-box" role="status">{notice}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="cf-inline">
        <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />{busy ? t('adding') : t('addTeacher')}</button>
      </div>
      {secret?.tempPassword && (
        <SecretDialog title={t('teacherAdded')} secret={secret.tempPassword} onClose={() => setSecret(null)}
          lines={[t('teacherAddedLine', { name: secret.label })]} />
      )}
    </form>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { slugify } from '@/lib/org/roster';
import { ORG_KINDS, ORG_KIND_LABELS, type OrgKind } from '@/lib/org/types';
import { callApi } from '@/components/cabinet/api';
import PersonFields, { EMPTY_PERSON, personPayload, type PersonValue } from '@/components/cabinet/PersonFields';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { IconPlus } from '@/components/icons';

interface Created {
  org: { id: string; slug: string; name: string };
  admin: { label: string; tempPassword: string | null; created: boolean };
}

export default function CreateOrgButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<OrgKind>('school');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [person, setPerson] = useState<PersonValue>(EMPTY_PERSON);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState<{ label: string; password: string } | null>(null);
  const [notice, setNotice] = useState('');

  function close() {
    setOpen(false);
    setName(''); setKind('school'); setSlug(''); setSlugTouched(false); setPerson(EMPTY_PERSON); setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await callApi<Created>('/api/admin/orgs', 'POST', { name, kind, slug, admin: personPayload(person) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    close();
    const { org, admin } = res.data;
    if (admin.tempPassword) setSecret({ label: admin.label, password: admin.tempPassword });
    setNotice(`Организация «${org.name}» создана. ${admin.label} — её администратор.`);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconPlus size={17} />Создать организацию
      </button>
      {notice && <p className="ok-box" style={{ flexBasis: '100%' }}>{notice}</p>}
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="new-org-title"
            onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="modal-head"><h2 id="new-org-title">Новая организация</h2></div>
            <label className="field"><span>Название</span>
              <input value={name} required maxLength={200} autoFocus
                onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
            </label>
            <label className="field"><span>Тип</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as OrgKind)}>
                {ORG_KINDS.map((k) => <option key={k} value={k}>{ORG_KIND_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="field"><span>Слаг (часть логинов учеников)</span>
              <input value={slug} required pattern="[a-z0-9\-]{2,32}"
                title="Строчные латинские буквы, цифры и дефис, от 2 до 32 символов"
                onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); }} />
            </label>
            <div className="field"><span>Первый администратор</span></div>
            <PersonFields who="администратора" value={person} onChange={setPerson} />
            {error && <p className="error-box">{error}</p>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={close}>Отмена</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Создаю…' : 'Создать'}</button>
            </div>
          </form>
        </div>
      )}
      {secret && (
        <SecretDialog title="Администратор создан" secret={secret.password} onClose={() => setSecret(null)}
          lines={[`${secret.label} входит с этим временным паролем и при первом входе задаёт свой.`]} />
      )}
    </>
  );
}

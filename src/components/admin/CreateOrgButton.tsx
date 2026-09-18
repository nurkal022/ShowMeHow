'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { candidateLogin, slugify } from '@/lib/org/roster';
import { ORG_KINDS, ORG_KIND_LABELS, type OrgKind } from '@/lib/org/types';
import { callApi } from '@/components/cabinet/api';
import PersonFields, { EMPTY_PERSON, personPayload, type PersonValue } from '@/components/cabinet/PersonFields';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { IconOrg, IconPlus } from '@/components/icons';
import Dialog from '@/components/lms/ui/Dialog';

interface Created {
  org: { id: string; slug: string; name: string };
  admin: { label: string; tempPassword: string | null; created: boolean };
}

const SLUG_RE = /^[a-z0-9-]{2,32}$/;

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
  const [slugError, setSlugError] = useState('');
  const [secret, setSecret] = useState<{ label: string; password: string } | null>(null);
  const [done, setDone] = useState<Created | null>(null);

  function close() {
    setOpen(false);
    setName(''); setKind('school'); setSlug(''); setSlugTouched(false); setPerson(EMPTY_PERSON); setError(''); setSlugError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!SLUG_RE.test(slug)) {
      return setSlugError('Слаг — строчные латинские буквы, цифры и дефис, от 2 до 32 символов.');
    }
    setBusy(true);
    setError('');
    const res = await callApi<Created>('/api/admin/orgs', 'POST', { name, kind, slug, admin: personPayload(person) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    close();
    const { admin } = res.data;
    if (admin.tempPassword) setSecret({ label: admin.label, password: admin.tempPassword });
    setDone(res.data);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconPlus size={17} />Создать организацию
      </button>
      {done && (
        <p className="ok-box cf-full" role="status">
          {`Организация «${done.org.name}» создана. ${done.admin.label} — её администратор`}
          {done.admin.created ? '' : ' (аккаунт уже был, пароль прежний)'}
          {'. '}
          <Link href={`/admin/orgs/${done.org.id}`}>Открыть организацию</Link>
        </p>
      )}
      {open && (
        <Dialog title="Новая организация" subtitle="Школа, колледж или центр — со своими группами, учителями и курсами."
          icon={<IconOrg size={20} />} onClose={close}>
          <form className="cf-dialog-form" onSubmit={submit}>
            <fieldset className="cf-fieldset">
              <legend>Организация</legend>
              <label className="field"><span>Название</span>
                <input value={name} required maxLength={200} data-autofocus placeholder="Школа №12"
                  onChange={(e) => { setName(e.target.value); if (!slugTouched) { setSlug(slugify(e.target.value)); setSlugError(''); } }} />
              </label>
              <div className="form-grid cf-grid-top">
                <label className="field"><span>Тип</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value as OrgKind)}>
                    {ORG_KINDS.map((k) => <option key={k} value={k}>{ORG_KIND_LABELS[k]}</option>)}
                  </select>
                </label>
                <label className="field"><span>Слаг — короткое имя латиницей</span>
                  <input value={slug} required aria-invalid={slugError ? true : undefined} aria-describedby="org-slug-note"
                    placeholder="shkola-12"
                    onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); setSlugError(''); }} />
                </label>
              </div>
              {slugError
                ? <span id="org-slug-note" className="cf-field-error" role="alert">{slugError}</span>
                : (
                  <p id="org-slug-note" className="muted">
                    {slugTouched ? 'Слаг задан вручную. ' : 'Подбирается из названия; можно поправить. '}
                    {slug && SLUG_RE.test(slug)
                      ? <>Логины учеников будут такими: <span className="num">{candidateLogin('Иванов', 'Иван', slug, 1)}</span></>
                      : 'Он станет частью логинов учеников, изменить его потом нельзя.'}
                  </p>
                )}
            </fieldset>
            <fieldset className="cf-fieldset">
              <legend>Первый администратор</legend>
              <PersonFields who="администратора" value={person} onChange={setPerson} />
              <p className="muted">Ему создастся временный пароль — вы увидите его один раз сразу после создания.</p>
            </fieldset>
            {error && <p className="error-box" role="alert">{error}</p>}
            <div className="cf-dialog-actions">
              <button type="button" className="btn" onClick={close}>Отмена</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Создаю…' : 'Создать организацию'}</button>
            </div>
          </form>
        </Dialog>
      )}
      {secret && (
        <SecretDialog title="Администратор создан" secret={secret.password} onClose={() => setSecret(null)}
          lines={[`${secret.label} входит с этим временным паролем и при первом входе задаёт свой.`]} />
      )}
    </>
  );
}

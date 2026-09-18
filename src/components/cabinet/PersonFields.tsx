'use client';

/** Поля «почта или логин и имя» — в админке (первый админ) и в кабинете (учитель). */

export interface PersonValue { by: 'email' | 'login'; email: string; login: string; displayName: string }

export const EMPTY_PERSON: PersonValue = { by: 'email', email: '', login: '', displayName: '' };

export function personPayload(v: PersonValue): Record<string, string> {
  return v.by === 'email'
    ? { email: v.email, displayName: v.displayName }
    : { login: v.login, displayName: v.displayName };
}

export default function PersonFields({ who, value, onChange }: {
  /** «администратора», «учителя» — для подписей полей. */
  who: string;
  value: PersonValue;
  onChange: (next: PersonValue) => void;
}) {
  const set = (patch: Partial<PersonValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="segmented" role="group" aria-label="Как входит человек">
        <button type="button" aria-pressed={value.by === 'email'}
          className={value.by === 'email' ? 'segmented-item active' : 'segmented-item'}
          onClick={() => set({ by: 'email' })}>По почте</button>
        <button type="button" aria-pressed={value.by === 'login'}
          className={value.by === 'login' ? 'segmented-item active' : 'segmented-item'}
          onClick={() => set({ by: 'login' })}>По логину</button>
      </div>
      {value.by === 'email' ? (
        <label className="field"><span>Почта {who}</span>
          <input type="email" value={value.email} required maxLength={254}
            onChange={(e) => set({ email: e.target.value })} />
        </label>
      ) : (
        <label className="field"><span>Логин {who}</span>
          <input value={value.login} required maxLength={40} pattern="[a-z0-9][a-z0-9._\-]{2,39}"
            title="Строчные латинские буквы, цифры, точка, дефис и подчёркивание"
            onChange={(e) => set({ login: e.target.value.toLowerCase() })} />
        </label>
      )}
      <label className="field"><span>Имя {who}</span>
        <input value={value.displayName} required={value.by === 'login'} maxLength={120}
          onChange={(e) => set({ displayName: e.target.value })} />
      </label>
    </>
  );
}

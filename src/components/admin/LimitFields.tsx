'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { useT } from '@/i18n/client';
import { admin } from '@/i18n/messages/admin';

export interface LimitField {
  key: string;
  label: string;
  hint: string;
  value: number | null;
  /** Пустое поле — «по общему правилу» (null), только для персональных лимитов. */
  optional?: boolean;
}

/** Числовые лимиты: сохраняются по уходу из поля, как лимит преподавателей в настройках организации. */
export default function LimitFields({ endpoint, method, extra = {}, fields }: {
  endpoint: string; method: 'PATCH' | 'POST'; extra?: Record<string, unknown>; fields: LimitField[];
}) {
  const t = useT(admin);
  const router = useRouter();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.value === null ? '' : String(f.value)])));
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  async function save(f: LimitField) {
    const raw = values[f.key].trim();
    const n = raw === '' && f.optional ? null : Number(raw);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100000)) return setError(t('limError'));
    if (n === f.value) return;
    setState('saving');
    setError('');
    const res = await callApi(endpoint, method, { ...extra, [f.key]: n });
    if (!res.ok) {
      setState('idle');
      return setError(res.error);
    }
    setState('saved');
    router.refresh();
  }

  return (
    <div className="settings-list">
      {fields.map((f) => (
        <div className="row" key={f.key}>
          <span className="row-label">
            <strong>{f.label}</strong>
            <span>{f.hint}</span>
          </span>
          <span className="spacer" />
          <input className="input" style={{ width: 120 }} type="number" min={0} max={100000} aria-label={f.label}
            placeholder={f.optional ? t('limDefault') : undefined} value={values[f.key]} disabled={state === 'saving'}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} onBlur={() => save(f)} />
        </div>
      ))}
      {state === 'saved' && <span className="saved-note">{t('limSaved')}</span>}
      {error && <p className="error-box">{error}</p>}
    </div>
  );
}

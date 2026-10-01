'use client';
import { useState } from 'react';
import { useFormat, useT } from '@/i18n/client';
import { auth } from '@/i18n/messages/auth';
import LanguageSwitcher from './LanguageSwitcher';

/**
 * Серверный порог — MIN_PASSWORD_LENGTH в src/lib/auth/cookie.ts. Импортировать его
 * сюда нельзя: cookie.ts тянет session.ts с node:crypto и pg в клиентский бандл.
 * Совпадение порогов проверяет юнит-тест.
 */
export const MIN_NEW_PASSWORD_LENGTH = 8;

export function newPasswordError(next: string, repeat: string): string | null {
  if (next.length < MIN_NEW_PASSWORD_LENGTH) {
    return `Пароль должен быть не короче ${MIN_NEW_PASSWORD_LENGTH} символов.`;
  }
  if (next !== repeat) return 'Пароли не совпадают.';
  return null;
}

/**
 * Показывается вместо любой страницы, пока у человека временный пароль.
 * Текущий пароль не спрашивается: человек только что вошёл с временным.
 */
export default function ForcePasswordChange({ label }: { label: string }) {
  const t = useT(auth);
  const f = useFormat();
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = newPasswordError(next, repeat);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: next }),
      });
      if (res.ok) {
        // Полная перезагрузка: layout должен заново прочитать пользователя без флага.
        window.location.assign('/');
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? t('saveFailed'));
    } catch {
      setError(t('network'));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.assign('/login');
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>{t('choosePassword')}</h1>
        <p className="muted">
          {label ? t('tempPasswordNamed', { name: label }) : t('tempPassword')}{' '}
          {t('setOwn')}
        </p>
        <label>{t('newPassword')}
          <input className="input" type="password" value={next} required minLength={MIN_NEW_PASSWORD_LENGTH}
            autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
        </label>
        <label>{t('repeatPassword')}
          <input className="input" type="password" value={repeat} required minLength={MIN_NEW_PASSWORD_LENGTH}
            autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="error-box">{f.message(error)}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t('wait') : t('savePassword')}
        </button>
        <button className="btn force-password-logout" type="button" onClick={logout}>{t('logout')}</button>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <LanguageSwitcher compact label={t('languageAria')} />
        </div>
      </form>
    </div>
  );
}

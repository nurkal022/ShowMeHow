'use client';
import { useState } from 'react';
import { useFormat, useT } from '@/i18n/client';
import { auth } from '@/i18n/messages/auth';
import { tgClaim } from '@/i18n/messages/tg-claim';

export default function ClaimForm({ token, tgName, who }: { token: string; tgName: string; who: string | null }) {
  const t = useT(tgClaim);
  const ta = useT(auth);
  const f = useFormat();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/tg/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(who ? { token } : { token, email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setNext(body.next ?? '/create');
      else setError(body.error ?? ta('loginFailed'));
    } catch {
      setError(ta('network'));
    } finally {
      setBusy(false);
    }
  }

  if (next) {
    return (
      <div className="auth-card">
        <h1>{t('title')}</h1>
        <p className="muted">{t('done')}</p>
        {/* Полная перезагрузка: только что появилась кука сессии. */}
        <a className="btn btn-primary" href={next}>{t('open')}</a>
      </div>
    );
  }

  const loginHref = `/login?next=${encodeURIComponent(`/tg/claim?t=${encodeURIComponent(token)}`)}`;
  return (
    <form className="auth-card" onSubmit={submit}>
      <h1>{t('title')}</h1>
      <p className="muted">{who ? t('leadLinked', { who, name: tgName }) : t('leadNew', { name: tgName })}</p>
      {!who && (
        <>
          <label>{ta('email')}
            <input className="input" type="email" value={email} autoComplete="email" required
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>{ta('password')}
            <input className="input" type="password" value={password} required minLength={8}
              autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          </label>
        </>
      )}
      {error && <p className="error-box">{f.message(error)}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? ta('wait') : who ? t('link') : t('create')}
      </button>
      {!who && (
        <p className="muted" style={{ textAlign: 'center' }}>
          {t('haveAccount')} <a href={loginHref}>{t('login')}</a>
        </p>
      )}
      {who && (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={async () => {
          // Выходим и остаёмся на этой же ссылке: она ещё не погашена.
          setBusy(true);
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
          window.location.reload();
        }}>{t('notMe')}</button>
      )}
    </form>
  );
}

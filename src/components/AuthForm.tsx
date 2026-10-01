'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFormat, useT } from '@/i18n/client';
import { auth } from '@/i18n/messages/auth';

/**
 * `next` приходит из query-строки — с точки зрения приложения это чужой ввод.
 * Принимаем только путь внутри приложения: ровно один ведущий слеш и не два
 * подряд (`//host` — protocol-relative URL, тоже уводит на чужой домен).
 * Всё остальное («https://evil.example», «javascript:...») отбрасываем на «/».
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/** Вход принимает почту или логин; регистрация — только почту, как раньше. */
export function authRequestBody(mode: 'login' | 'register', identifier: string, password: string):
  { identifier: string; password: string } | { email: string; password: string } {
  return mode === 'login' ? { identifier, password } : { email: identifier, password };
}

export default function AuthForm({ mode, registrationOpen = true }: { mode: 'login' | 'register'; registrationOpen?: boolean }) {
  const search = useSearchParams();
  const t = useT(auth);
  const f = useFormat();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/auth/${isLogin ? 'login' : 'register'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authRequestBody(mode, identifier, password)),
      });
      if (res.ok) {
        // Полная перезагрузка, а не router.push: клиентский роутер Next кэширует
        // ответы, полученные ДО появления куки сессии, и увёл бы обратно на вход.
        window.location.assign(safeNextPath(search.get('next')));
        return;
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t('loginFailed'));
      }
    } catch {
      setError(t('network'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <h1>{isLogin ? t('welcomeBack') : t('createAccount')}</h1>
      <p className="muted">
        {isLogin ? t('loginLead') : t('registerLead')}
      </p>
      {isLogin ? (
        <label>{t('emailOrLogin')}
          <input className="input" type="text" value={identifier} autoComplete="username" required
            autoCapitalize="none" spellCheck={false}
            onChange={(e) => setIdentifier(e.target.value)} />
        </label>
      ) : (
        <label>{t('email')}
          <input className="input" type="email" value={identifier} autoComplete="email" required
            onChange={(e) => setIdentifier(e.target.value)} />
        </label>
      )}
      <label>{t('password')}
        <input className="input" type="password" value={password} required minLength={8}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error-box">{f.message(error)}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? t('wait') : isLogin ? t('login') : t('register')}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        {isLogin && !registrationOpen ? t('schoolIssues') : (
          <>
            {isLogin ? t('noAccount') : t('haveAccount')}{' '}
            <a href={isLogin ? '/register' : '/login'}>{isLogin ? t('toRegister') : t('toLogin')}</a>
          </>
        )}
      </p>
    </form>
  );
}

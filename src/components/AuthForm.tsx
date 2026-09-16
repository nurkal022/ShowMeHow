'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

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

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const search = useSearchParams();
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
        setError(body.error ?? 'Не удалось войти. Попробуйте ещё раз.');
      }
    } catch {
      setError('Сеть недоступна. Проверьте соединение и попробуйте снова.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <h1>{isLogin ? 'С возвращением' : 'Создать аккаунт'}</h1>
      <p className="muted">
        {isLogin ? 'Войдите, чтобы открыть свою библиотеку.' : 'Десять генераций в пробной версии.'}
      </p>
      {isLogin ? (
        <label>Почта или логин
          <input className="input" type="text" value={identifier} autoComplete="username" required
            autoCapitalize="none" spellCheck={false}
            onChange={(e) => setIdentifier(e.target.value)} />
        </label>
      ) : (
        <label>Почта
          <input className="input" type="email" value={identifier} autoComplete="email" required
            onChange={(e) => setIdentifier(e.target.value)} />
        </label>
      )}
      <label>Пароль
        <input className="input" type="password" value={password} required minLength={8}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error-box">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Минуту…' : isLogin ? 'Войти' : 'Зарегистрироваться'}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        {isLogin ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
        <a href={isLogin ? '/register' : '/login'}>{isLogin ? 'Регистрация' : 'Вход'}</a>
      </p>
    </form>
  );
}

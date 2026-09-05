'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('');
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
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(safeNextPath(search.get('next')));
        router.refresh();
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
      <h1>{isLogin ? 'Вход' : 'Регистрация'}</h1>
      <label>Почта
        <input type="email" value={email} autoComplete="email" required
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>Пароль
        <input type="password" value={password} required minLength={8}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error-box">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Минуту…' : isLogin ? 'Войти' : 'Зарегистрироваться'}
      </button>
      <p className="muted">
        {isLogin ? 'Ещё нет аккаунта? ' : 'Уже есть аккаунт? '}
        <a href={isLogin ? '/register' : '/login'}>{isLogin ? 'Зарегистрироваться' : 'Войти'}</a>
      </p>
    </form>
  );
}

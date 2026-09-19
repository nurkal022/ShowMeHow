import { Suspense } from 'react';
import Link from 'next/link';
import AuthForm from '@/components/AuthForm';
import { getPlatformSettings, REGISTRATION_CLOSED_MESSAGE } from '@/lib/platform-settings';

export default async function RegisterPage() {
  const { registrationOpen } = await getPlatformSettings();
  return (
    <div className="auth-page">
      {registrationOpen
        ? <Suspense><AuthForm mode="register" /></Suspense>
        : (
          <div className="auth-card">
            <h1>Регистрация закрыта</h1>
            <p className="muted">{REGISTRATION_CLOSED_MESSAGE}</p>
            <Link className="btn btn-primary" href="/login">Войти</Link>
          </div>
        )}
    </div>
  );
}

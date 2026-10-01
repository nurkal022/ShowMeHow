import { Suspense } from 'react';
import Link from 'next/link';
import AuthForm from '@/components/AuthForm';
import { getPlatformSettings, REGISTRATION_CLOSED_MESSAGE } from '@/lib/platform-settings';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { localizeMessage } from '@/i18n/catalog';
import { auth } from '@/i18n/messages/auth';

export default async function RegisterPage() {
  const { registrationOpen } = await getPlatformSettings();
  const locale = await getLocale();
  const t = translator(auth, locale);
  return (
    <div className="auth-page">
      {registrationOpen
        ? <Suspense><AuthForm mode="register" /></Suspense>
        : (
          <div className="auth-card">
            <h1>{t('registrationClosed')}</h1>
            <p className="muted">{localizeMessage(REGISTRATION_CLOSED_MESSAGE, locale)}</p>
            <Link className="btn btn-primary" href="/login">{t('login')}</Link>
          </div>
        )}
    </div>
  );
}

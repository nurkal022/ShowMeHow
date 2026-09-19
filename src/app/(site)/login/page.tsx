import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import { getPlatformSettings } from '@/lib/platform-settings';

export default async function LoginPage() {
  const { registrationOpen } = await getPlatformSettings();
  return (
    <div className="auth-page">
      <Suspense><AuthForm mode="login" registrationOpen={registrationOpen} /></Suspense>
    </div>
  );
}

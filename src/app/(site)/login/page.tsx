import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import AuthShell from '@/components/AuthShell';
import { getPlatformSettings } from '@/lib/platform-settings';

export default async function LoginPage() {
  const { registrationOpen } = await getPlatformSettings();
  return (
    <AuthShell mode="login">
      <Suspense><AuthForm mode="login" registrationOpen={registrationOpen} /></Suspense>
    </AuthShell>
  );
}

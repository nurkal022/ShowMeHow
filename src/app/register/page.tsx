import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export default function RegisterPage() {
  return (
    <div className="auth-page">
      <Suspense><AuthForm mode="register" /></Suspense>
    </div>
  );
}

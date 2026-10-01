'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { useConfirm, type ConfirmOptions } from '@/components/lms/ui/useConfirm';
import { useImpersonate } from './useImpersonate';
import { useT } from '@/i18n/client';
import { admin } from '@/i18n/messages/admin';
import type { TFn } from '@/i18n/core';

type Action = 'reset-password' | 'disable' | 'enable' | 'make-admin' | 'revoke-admin';

function confirmFor(t: TFn<typeof admin.ru>, action: Action): ConfirmOptions | undefined {
  switch (action) {
    case 'reset-password': return { title: t('qReset'), confirmLabel: t('resetPassword'), text: t('qResetText') };
    case 'disable': return { title: t('qBlock'), confirmLabel: t('block'), danger: true, text: t('qBlockText') };
    case 'make-admin': return { title: t('qMake'), confirmLabel: t('qMakeOk'), text: t('qMakeText') };
    case 'revoke-admin': return { title: t('qRevoke'), confirmLabel: t('qRevokeOk'), danger: true, text: t('qRevokeText') };
    default: return undefined;
  }
}

export default function UserActions({ userId, label, disabled, isAdmin, isSelf }: {
  userId: string; label: string; disabled: boolean; isAdmin: boolean; isSelf: boolean;
}) {
  const router = useRouter();
  const t = useT(admin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState<string | null>(null);
  const [ask, confirmDialog] = useConfirm();
  const [impersonate, switching, switchError] = useImpersonate();

  async function run(action: Action) {
    const question = confirmFor(t, action);
    if (question && !(await ask(question))) return;
    setBusy(true);
    setError('');
    const res = await callApi<{ password?: string }>(`/api/admin/users/${userId}`, 'POST', { action });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.data.password) setPassword(res.data.password);
    router.refresh();
  }

  return (
    <div className="cf-inline">
      {!isAdmin && !disabled && (
        <button type="button" className="btn btn-primary" disabled={busy || switching}
          title={t('loginAsTip')}
          onClick={() => impersonate(userId)}>{t('loginAs', { name: label })}</button>
      )}
      <button type="button" className="btn" disabled={busy} onClick={() => run('reset-password')}>{t('resetPassword')}</button>
      {disabled
        ? <button type="button" className="btn" disabled={busy} onClick={() => run('enable')}>{t('unblock')}</button>
        : <button type="button" className="btn btn-danger" disabled={busy || isSelf} onClick={() => run('disable')}>{t('block')}</button>}
      {isAdmin
        ? <button type="button" className="btn" disabled={busy || isSelf}
            title={isSelf ? t('revokeSelf') : undefined}
            onClick={() => run('revoke-admin')}>{t('revokeAdmin')}</button>
        : <button type="button" className="btn" disabled={busy} onClick={() => run('make-admin')}>{t('makeAdmin')}</button>}
      {switchError && <p className="error-box cf-full" role="alert">{switchError}</p>}
      {error && <p className="error-box cf-full" role="alert">{error}</p>}
      {confirmDialog}
      {password && (
        <SecretDialog title={t('passwordReset')} secret={password} onClose={() => setPassword(null)}
          lines={[t('passwordResetLine', { name: label })]} />
      )}
    </div>
  );
}

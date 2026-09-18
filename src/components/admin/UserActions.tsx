'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { useConfirm, type ConfirmOptions } from '@/components/lms/ui/useConfirm';

type Action = 'reset-password' | 'disable' | 'enable' | 'make-admin' | 'revoke-admin';

const CONFIRM: Partial<Record<Action, ConfirmOptions>> = {
  'reset-password': {
    title: 'Сбросить пароль?', confirmLabel: 'Сбросить пароль',
    text: 'Все сессии человека закроются, при входе он задаст новый пароль. Временный пароль будет показан один раз.',
  },
  disable: {
    title: 'Заблокировать вход?', confirmLabel: 'Заблокировать', danger: true,
    text: 'Человек не сможет войти, его данные сохранятся. Блокировку можно снять.',
  },
  'make-admin': {
    title: 'Сделать админом платформы?', confirmLabel: 'Сделать админом',
    text: 'Он получит доступ ко всем организациям, пользователям и каталогу.',
  },
  'revoke-admin': {
    title: 'Снять права админа платформы?', confirmLabel: 'Снять права', danger: true,
    text: 'Человек останется обычным пользователем со своими организациями.',
  },
};

export default function UserActions({ userId, label, disabled, isAdmin, isSelf }: {
  userId: string; label: string; disabled: boolean; isAdmin: boolean; isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState<string | null>(null);
  const [ask, confirmDialog] = useConfirm();

  async function run(action: Action) {
    const question = CONFIRM[action];
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
      <button type="button" className="btn" disabled={busy} onClick={() => run('reset-password')}>Сбросить пароль</button>
      {disabled
        ? <button type="button" className="btn" disabled={busy} onClick={() => run('enable')}>Разблокировать</button>
        : <button type="button" className="btn btn-danger" disabled={busy || isSelf} onClick={() => run('disable')}>Заблокировать</button>}
      {isAdmin
        ? <button type="button" className="btn" disabled={busy || isSelf}
            title={isSelf ? 'Снять права с самого себя нельзя.' : undefined}
            onClick={() => run('revoke-admin')}>Снять права админа</button>
        : <button type="button" className="btn" disabled={busy} onClick={() => run('make-admin')}>Сделать админом платформы</button>}
      {error && <p className="error-box cf-full" role="alert">{error}</p>}
      {confirmDialog}
      {password && (
        <SecretDialog title="Пароль сброшен" secret={password} onClose={() => setPassword(null)}
          lines={[`Новый временный пароль для ${label}. При входе его попросят сменить.`]} />
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import SecretDialog from '@/components/cabinet/SecretDialog';

type Action = 'reset-password' | 'disable' | 'enable' | 'make-admin' | 'revoke-admin';

const CONFIRM: Partial<Record<Action, string>> = {
  'reset-password': 'Сбросить пароль? Все сессии человека закроются, при входе он задаст новый пароль.',
  disable: 'Заблокировать? Человек не сможет войти, данные сохранятся.',
  'make-admin': 'Сделать админом платформы? Он получит доступ ко всем организациям.',
  'revoke-admin': 'Снять права админа платформы?',
};

export default function UserActions({ userId, label, disabled, isAdmin, isSelf }: {
  userId: string; label: string; disabled: boolean; isAdmin: boolean; isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState<string | null>(null);

  async function run(action: Action) {
    const question = CONFIRM[action];
    if (question && !confirm(question)) return;
    setBusy(true);
    setError('');
    const res = await callApi<{ password?: string }>(`/api/admin/users/${userId}`, 'POST', { action });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.data.password) setPassword(res.data.password);
    router.refresh();
  }

  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="btn" disabled={busy} onClick={() => run('reset-password')}>Сбросить пароль</button>
      {disabled
        ? <button type="button" className="btn" disabled={busy} onClick={() => run('enable')}>Разблокировать</button>
        : <button type="button" className="btn btn-danger" disabled={busy || isSelf} onClick={() => run('disable')}>Заблокировать</button>}
      {isAdmin
        ? <button type="button" className="btn" disabled={busy || isSelf}
            title={isSelf ? 'Снять права с самого себя нельзя.' : undefined}
            onClick={() => run('revoke-admin')}>Снять права админа</button>
        : <button type="button" className="btn" disabled={busy} onClick={() => run('make-admin')}>Сделать админом платформы</button>}
      {error && <p className="error-box" style={{ flexBasis: '100%' }}>{error}</p>}
      {password && (
        <SecretDialog title="Пароль сброшен" secret={password} onClose={() => setPassword(null)}
          lines={[`Новый временный пароль для ${label}. При входе его попросят сменить.`]} />
      )}
    </div>
  );
}

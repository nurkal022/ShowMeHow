'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import SecretDialog from '@/components/cabinet/SecretDialog';

interface Props {
  slug: string;
  userId: string;
  label: string;
  disabled: boolean;
  /** Группа, из карточки которой вызвано действие: нужна учителю группы и для перевода. */
  groupId?: string;
  canBlock?: boolean;
  canRemove?: boolean;
  moveTargets?: { id: string; title: string }[];
}

export default function MemberActions({ slug, userId, label, disabled, groupId, canBlock, canRemove, moveTargets }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState<string | null>(null);
  const [target, setTarget] = useState('');

  async function run(action: string, question: string | null, extra: Record<string, string> = {}) {
    if (question && !confirm(question)) return;
    setBusy(true);
    setError('');
    const res = await callApi<{ password?: string; reassignedCourses?: number }>(
      `/api/org/${slug}/members/${userId}`, 'POST', { action, groupId, ...extra });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.data.password) setPassword(res.data.password);
    router.refresh();
  }

  return (
    <span className="inline-actions">
      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
        onClick={() => run('reset-password', `Сбросить пароль для ${label}? Все его сессии закроются.`)}>
        Сбросить пароль
      </button>
      {canBlock && (disabled
        ? <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run('enable', null)}>Разблокировать</button>
        : <button type="button" className="btn btn-sm btn-danger" disabled={busy}
            onClick={() => run('disable', `Заблокировать ${label}? Войти не получится, данные сохранятся.`)}>Заблокировать</button>)}
      {canRemove && (
        <button type="button" className="btn btn-sm btn-danger" disabled={busy}
          onClick={() => run('remove', `Убрать ${label} из организации? Его курсы останутся в организации, владельцем станете вы.`)}>
          Убрать
        </button>
      )}
      {moveTargets && moveTargets.length > 0 && (
        <>
          <select className="select" style={{ width: 'auto', minHeight: 32 }} value={target}
            aria-label={`Перевести ${label} в группу`} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Перевести в…</option>
            {moveTargets.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <button type="button" className="btn btn-sm" disabled={busy || !target}
            onClick={() => run('move', null, { toGroupId: target })}>Перевести</button>
        </>
      )}
      {error && <span className="warn" role="alert">{error}</span>}
      {password && (
        <SecretDialog title="Пароль сброшен" secret={password} onClose={() => setPassword(null)}
          lines={[`Новый временный пароль для ${label}. Для учеников он появится и в листе паролей группы.`]} />
      )}
    </span>
  );
}

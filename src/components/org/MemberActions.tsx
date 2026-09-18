'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { IconCheck, IconKey, IconLock, IconSwap, IconTrash } from '@/components/icons';
import Dialog from '@/components/lms/ui/Dialog';
import RowMenu, { type RowMenuItem } from '@/components/lms/ui/RowMenu';
import { useConfirm } from '@/components/lms/ui/useConfirm';

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

/** Действия с человеком — одним меню в строке: пароль, блокировка, перевод, удаление из организации. */
export default function MemberActions({ slug, userId, label, disabled, groupId, canBlock, canRemove, moveTargets }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState('');
  const [ask, confirmDialog] = useConfirm();

  async function run(action: string, extra: Record<string, string> = {}): Promise<boolean> {
    setBusy(true);
    setError('');
    const res = await callApi<{ password?: string; reassignedCourses?: number }>(
      `/api/org/${slug}/members/${userId}`, 'POST', { action, groupId, ...extra });
    setBusy(false);
    if (!res.ok) { setError(res.error); return false; }
    if (res.data.password) setPassword(res.data.password);
    router.refresh();
    return true;
  }

  const items: RowMenuItem[] = [{
    key: 'reset', label: 'Сбросить пароль', icon: <IconKey size={16} />,
    onSelect: async () => {
      if (await ask({
        title: 'Сбросить пароль?',
        text: `${label} получит новый временный пароль, все его сессии закроются. Пароль будет показан один раз.`,
        confirmLabel: 'Сбросить пароль',
      })) void run('reset-password');
    },
  }];
  if (canBlock) {
    items.push(disabled
      ? { key: 'enable', label: 'Разблокировать', icon: <IconCheck size={16} />, onSelect: () => void run('enable') }
      : {
        key: 'disable', label: 'Заблокировать', icon: <IconLock size={16} />,
        onSelect: async () => {
          if (await ask({
            title: 'Заблокировать вход?', text: `${label} не сможет войти. Работы, оценки и курсы сохранятся, блокировку можно снять.`,
            confirmLabel: 'Заблокировать', danger: true,
          })) void run('disable');
        },
      });
  }
  if (moveTargets && moveTargets.length > 0) {
    items.push({ key: 'move', label: 'Перевести в другую группу', icon: <IconSwap size={16} />, onSelect: () => { setTarget(''); setMoving(true); } });
  }
  if (canRemove) {
    items.push({
      key: 'remove', label: 'Убрать из организации', icon: <IconTrash size={16} />, danger: true,
      onSelect: async () => {
        if (await ask({
          title: 'Убрать из организации?',
          text: `${label} потеряет доступ к организации. Его курсы останутся в организации, владельцем станете вы.`,
          confirmLabel: 'Убрать', danger: true,
        })) void run('remove');
      },
    });
  }

  return (
    <span className="cf-row-actions">
      {error && <span className="cf-field-error" role="alert">{error}</span>}
      <RowMenu label={`Действия: ${label}`} items={items} busy={busy} />
      {moving && moveTargets && (
        <Dialog title="Перевести в другую группу" subtitle={label} onClose={() => setMoving(false)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setMoving(false)}>Отмена</button>
              <button type="button" className="btn btn-primary" disabled={busy || !target}
                onClick={async () => { if (await run('move', { toGroupId: target })) setMoving(false); }}>Перевести</button>
            </>
          )}>
          <label className="field"><span>Новая группа</span>
            <select value={target} data-autofocus onChange={(e) => setTarget(e.target.value)}>
              <option value="">Выберите группу</option>
              {moveTargets.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
          <p className="muted">Ученик увидит курсы новой группы; курсы прежней станут ему недоступны. Ответы и оценки сохранятся.</p>
          {error && <p className="error-box" role="alert">{error}</p>}
        </Dialog>
      )}
      {confirmDialog}
      {password && (
        <SecretDialog title="Пароль сброшен" secret={password} onClose={() => setPassword(null)}
          lines={[`Новый временный пароль для ${label}. Для учеников он появится и в листе паролей группы.`]} />
      )}
    </span>
  );
}

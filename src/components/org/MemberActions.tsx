'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import SecretDialog from '@/components/cabinet/SecretDialog';
import { IconCheck, IconKey, IconLock, IconSwap, IconTrash } from '@/components/icons';
import Dialog from '@/components/lms/ui/Dialog';
import RowMenu, { type RowMenuItem } from '@/components/lms/ui/RowMenu';
import { useConfirm } from '@/components/lms/ui/useConfirm';
import { useT } from '@/i18n/client';
import { orgPeople } from '@/i18n/messages/org-people';

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
  const t = useT(orgPeople);
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
    key: 'reset', label: t('resetPassword'), icon: <IconKey size={16} />,
    onSelect: async () => {
      if (await ask({
        title: t('qResetOne'),
        text: t('qResetOneText', { name: label }),
        confirmLabel: t('resetPassword'),
      })) void run('reset-password');
    },
  }];
  if (canBlock) {
    items.push(disabled
      ? { key: 'enable', label: t('unblock'), icon: <IconCheck size={16} />, onSelect: () => void run('enable') }
      : {
        key: 'disable', label: t('block'), icon: <IconLock size={16} />,
        onSelect: async () => {
          if (await ask({
            title: t('qBlockOne'), text: t('qBlockOneText', { name: label }),
            confirmLabel: t('block'), danger: true,
          })) void run('disable');
        },
      });
  }
  if (moveTargets && moveTargets.length > 0) {
    items.push({ key: 'move', label: t('moveToGroup'), icon: <IconSwap size={16} />, onSelect: () => { setTarget(''); setMoving(true); } });
  }
  if (canRemove) {
    items.push({
      key: 'remove', label: t('removeFromOrg'), icon: <IconTrash size={16} />, danger: true,
      onSelect: async () => {
        if (await ask({
          title: t('qRemove'),
          text: t('qRemoveText', { name: label }),
          confirmLabel: t('remove'), danger: true,
        })) void run('remove');
      },
    });
  }

  return (
    <span className="cf-row-actions">
      {error && <span className="cf-field-error" role="alert">{error}</span>}
      <RowMenu label={t('actionsOf', { name: label })} items={items} busy={busy} />
      {moving && moveTargets && (
        <Dialog title={t('moveToGroup')} subtitle={label} onClose={() => setMoving(false)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setMoving(false)}>{t('cancel')}</button>
              <button type="button" className="btn btn-primary" disabled={busy || !target}
                onClick={async () => { if (await run('move', { toGroupId: target })) setMoving(false); }}>{t('move')}</button>
            </>
          )}>
          <label className="field"><span>{t('newGroupField')}</span>
            <select value={target} data-autofocus onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t('pickGroup')}</option>
              {moveTargets.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
          <p className="muted">{t('moveNote')}</p>
          {error && <p className="error-box" role="alert">{error}</p>}
        </Dialog>
      )}
      {confirmDialog}
      {password && (
        <SecretDialog title={t('passwordReset')} secret={password} onClose={() => setPassword(null)}
          lines={[t('passwordResetLine', { name: label })]} />
      )}
    </span>
  );
}

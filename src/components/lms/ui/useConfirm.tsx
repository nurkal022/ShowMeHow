'use client';
import { useCallback, useState } from 'react';
import { IconAlert } from '@/components/icons';
import Dialog from './Dialog';

export interface ConfirmOptions {
  title: string;
  /** Что именно произойдёт — полным предложением. */
  text: string;
  confirmLabel: string;
  danger?: boolean;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void }

/**
 * Подтверждение вместо window.confirm: `const [ask, dialog] = useConfirm()`,
 * затем `if (await ask({...}))`. Узел `dialog` кладётся в разметку компонента.
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  const dialog = pending && (
    <Dialog title={pending.title} onClose={() => finish(false)} tone={pending.danger ? 'danger' : undefined}
      icon={pending.danger ? <IconAlert size={20} /> : undefined}
      footer={(
        <>
          {/* У необратимого действия фокус встаёт на «Отмена»: случайный Enter ничего не удалит. */}
          <button type="button" className="btn" data-autofocus={pending.danger ? true : undefined} onClick={() => finish(false)}>Отмена</button>
          <button type="button" data-autofocus={pending.danger ? undefined : true} className={pending.danger ? 'btn cf-btn-danger' : 'btn btn-primary'}
            onClick={() => finish(true)}>{pending.confirmLabel}</button>
        </>
      )}>
      <p className="cf-dialog-text">{pending.text}</p>
    </Dialog>
  );
  return [ask, dialog];
}

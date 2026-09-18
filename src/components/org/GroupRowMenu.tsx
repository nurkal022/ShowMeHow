'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi } from '@/components/cabinet/api';
import { IconEdit, IconTrash } from '@/components/icons';
import Dialog from '@/components/lms/ui/Dialog';
import RowMenu from '@/components/lms/ui/RowMenu';
import { useConfirm } from '@/components/lms/ui/useConfirm';

/** Быстрые действия строки группы: переименовать и отправить в архив, не заходя в карточку. */
export default function GroupRowMenu({ slug, groupId, title, onArchived }: {
  slug: string; groupId: string; title: string;
  /** Куда деваться после архива; по умолчанию список просто перечитывается. */
  onArchived?: () => void;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, confirmDialog] = useConfirm();

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return setError('Введите название группы.');
    setBusy(true);
    const res = await callApi(`/api/org/${slug}/groups/${groupId}`, 'PATCH', { title: value });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setRenaming(false);
    router.refresh();
  }

  async function archive() {
    if (!(await ask({
      title: `Отправить группу «${title}» в архив?`,
      text: 'Ученики останутся в организации, но курсы, открытые этой группе, станут им недоступны.',
      confirmLabel: 'В архив', danger: true,
    }))) return;
    const res = await callApi(`/api/org/${slug}/groups/${groupId}`, 'DELETE');
    if (!res.ok) return setError(res.error);
    if (onArchived) onArchived(); else router.refresh();
  }

  return (
    <>
      <RowMenu label={`Действия с группой ${title}`} items={[
        { key: 'rename', label: 'Переименовать', icon: <IconEdit size={16} />, onSelect: () => { setValue(title); setError(''); setRenaming(true); } },
        { key: 'archive', label: 'Отправить в архив', icon: <IconTrash size={16} />, danger: true, onSelect: () => void archive() },
      ]} />
      {error && !renaming && <span className="cf-field-error" role="alert">{error}</span>}
      {renaming && (
        <Dialog title="Переименовать группу" onClose={() => setRenaming(false)}>
          <form className="cf-dialog-form" onSubmit={rename}>
            <label className="field"><span>Название группы</span>
              <input value={value} maxLength={60} required data-autofocus onChange={(e) => { setValue(e.target.value); setError(''); }} />
            </label>
            {error && <p className="error-box" role="alert">{error}</p>}
            <div className="cf-dialog-actions">
              <button type="button" className="btn" onClick={() => setRenaming(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
            </div>
          </form>
        </Dialog>
      )}
      {confirmDialog}
    </>
  );
}

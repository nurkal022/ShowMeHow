'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GroupStudent } from '@/lib/org/groups';
import { callApi } from '@/components/cabinet/api';
import StatusPill, { personStatus, personStatusKey } from '@/components/cabinet/StatusPill';
import { useConfirm } from '@/components/lms/ui/useConfirm';
import { IconKey, IconLock, IconPrint, IconSearch, IconSwap } from '@/components/icons';
import { useFormat, useT } from '@/i18n/client';
import { orgPeople } from '@/i18n/messages/org-people';
import { cabinet } from '@/i18n/messages/cabinet';

type Bulk = 'reset-password' | 'disable' | 'enable' | 'move';

/**
 * Ученики группы: поиск, выбор галочками и действия сразу над всеми выбранными —
 * сбросить пароли перед первым уроком, перевести в другой класс, заблокировать.
 */
export default function StudentsBoard({ slug, groupId, students, canBlock, moveTargets, rowActions }: {
  slug: string; groupId: string; students: GroupStudent[]; canBlock: boolean;
  moveTargets?: { id: string; title: string }[];
  rowActions: Record<string, React.ReactNode>;
}) {
  const router = useRouter();
  const t = useT(orgPeople);
  const tk = useT(cabinet);
  const f = useFormat();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string; sheet?: boolean } | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [ask, confirmDialog] = useConfirm();

  const needle = q.trim().toLowerCase();
  const shown = needle ? students.filter((s) => `${s.displayName} ${s.login ?? ''}`.toLowerCase().includes(needle)) : students;
  const chosen = students.filter((s) => picked.has(s.userId));
  const allShown = shown.length > 0 && shown.every((s) => picked.has(s.userId));
  const waiting = students.filter((s) => s.mustChangePassword && !s.disabled);

  const flip = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function run(action: Bulk) {
    const n = chosen.length;
    const who = t('who', { n });
    const target = moveTargets?.find((g) => g.id === moveTo);
    const question = {
      'reset-password': { title: t('qReset', { who }), confirmLabel: t('resetPasswords'), text: t('qResetText') },
      disable: { title: t('qBlock', { who }), confirmLabel: t('block'), danger: true, text: t('qBlockText') },
      enable: { title: t('qUnblock', { who }), confirmLabel: t('unblock'), text: t('qUnblockText') },
      move: { title: t('qMove', { who, group: target?.title ?? '' }), confirmLabel: t('move'), text: t('qMoveText') },
    }[action];
    if (action === 'move' && !target) return;
    if (!(await ask(question))) return;
    setNote(null);
    let ok = 0;
    let firstError = '';
    for (const [i, s] of chosen.entries()) {
      setBusy(t('progress', { i: i + 1, n }));
      const res = await callApi(`/api/org/${slug}/members/${s.userId}`, 'POST', { action, groupId, toGroupId: moveTo });
      if (res.ok) ok += 1; else if (!firstError) firstError = `${s.displayName}: ${f.message(res.error)}`;
    }
    setBusy('');
    setPicked(new Set());
    setNote(firstError
      ? { tone: 'bad', text: t('partial', { ok, n, error: firstError }) }
      : { tone: 'ok', sheet: action === 'reset-password',
        text: t(({ 'reset-password': 'doneReset', disable: 'doneBlock', enable: 'doneUnblock', move: 'doneMove' } as const)[action], { n }) });
    router.refresh();
  }

  return (
    <div className="cf-board">
      <div className="cf-board-bar">
        <label className="cf-board-search"><IconSearch size={16} />
          <input value={q} placeholder={t('findStudent')} aria-label={t('findStudent')} onChange={(e) => setQ(e.target.value)} />
        </label>
        {waiting.length > 0 && chosen.length === 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set(waiting.map((s) => s.userId)))}>
            {t('pickWaiting', { n: waiting.length })}
          </button>
        )}
      </div>

      {chosen.length > 0 && (
        <div className="cf-bulk" role="toolbar" aria-label={t('bulkBar')}>
          <strong>{t('picked', { n: chosen.length })}</strong>
          <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => run('reset-password')}><IconKey size={15} />{t('resetPasswords')}</button>
          {canBlock && moveTargets && moveTargets.length > 0 && (
            <span className="cf-bulk-move">
              <select className="select" value={moveTo} aria-label={t('moveWhere')} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">{t('moveTo')}</option>
                {moveTargets.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <button type="button" className="btn btn-sm" disabled={!!busy || !moveTo} onClick={() => run('move')}><IconSwap size={15} />{t('move')}</button>
            </span>
          )}
          {canBlock && (chosen.every((s) => s.disabled)
            ? <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => run('enable')}>{t('unblock')}</button>
            : <button type="button" className="btn btn-sm btn-danger" disabled={!!busy} onClick={() => run('disable')}><IconLock size={15} />{t('block')}</button>)}
          <span className="spacer" />
          {busy ? <span className="muted">{t('running', { progress: busy })}</span>
            : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set())}>{t('clearPick')}</button>}
        </div>
      )}

      {note && (
        <p className={note.tone === 'ok' ? 'ok-box' : 'error-box'} role="status">
          {note.text}{' '}
          {note.sheet && <Link href={`/org/groups/${groupId}/credentials`}><IconPrint size={14} /> {t('openSheet')}</Link>}
        </p>
      )}

      <div className="table-wrap">
        <table className="data-table cf-table">
          <thead>
            <tr>
              <th className="cf-col-check">
                <input type="checkbox" checked={allShown} aria-label={t('pickAll')}
                  onChange={() => setPicked(allShown ? new Set() : new Set(shown.map((s) => s.userId)))} />
              </th>
              <th>{t('student')}</th><th>{t('login')}</th><th>{t('status')}</th><th><span className="visually-hidden">{t('actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const status = personStatus(s);
              const on = picked.has(s.userId);
              return (
                <tr key={s.userId} className={on ? 'selected' : undefined}>
                  <td className="cf-col-check"><input type="checkbox" checked={on} aria-label={t('pickOne', { name: s.displayName })} onChange={() => flip(s.userId)} /></td>
                  <td data-label={t('student')}><strong>{s.displayName}</strong></td>
                  <td data-label={t('login')}><span className="num">{s.login ?? '—'}</span></td>
                  <td data-label={t('status')}><StatusPill tone={status.tone}>{tk(personStatusKey(s))}</StatusPill></td>
                  <td className="actions">{rowActions[s.userId]}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={5}><p className="muted cf-board-none">{t('nobody')}</p></td></tr>}
          </tbody>
        </table>
      </div>
      {confirmDialog}
    </div>
  );
}

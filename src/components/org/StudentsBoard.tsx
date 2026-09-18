'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GroupStudent } from '@/lib/org/groups';
import { ruPlural } from '@/lib/lms/format';
import { callApi } from '@/components/cabinet/api';
import StatusPill, { personStatus } from '@/components/cabinet/StatusPill';
import { useConfirm } from '@/components/lms/ui/useConfirm';
import { IconKey, IconLock, IconPrint, IconSearch, IconSwap } from '@/components/icons';

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
    const who = `${n} ${ruPlural(n, 'ученика', 'учеников', 'учеников')}`;
    const target = moveTargets?.find((g) => g.id === moveTo);
    const question = {
      'reset-password': { title: `Сбросить пароли у ${who}?`, confirmLabel: 'Сбросить пароли', text: 'Старые пароли перестанут работать. Новые временные пароли появятся в листе паролей — его можно сразу распечатать.' },
      disable: { title: `Заблокировать ${who}?`, confirmLabel: 'Заблокировать', danger: true, text: 'Они не смогут войти. Ответы и оценки сохранятся, блокировку можно снять.' },
      enable: { title: `Разблокировать ${who}?`, confirmLabel: 'Разблокировать', text: 'Ученики снова смогут войти со своими паролями.' },
      move: { title: `Перевести ${who} в «${target?.title ?? ''}»?`, confirmLabel: 'Перевести', text: 'Ученики исчезнут из этой группы и увидят курсы новой. Сданные работы сохранятся.' },
    }[action];
    if (action === 'move' && !target) return;
    if (!(await ask(question))) return;
    setNote(null);
    let ok = 0;
    let firstError = '';
    for (const [i, s] of chosen.entries()) {
      setBusy(`${i + 1} из ${n}`);
      const res = await callApi(`/api/org/${slug}/members/${s.userId}`, 'POST', { action, groupId, toGroupId: moveTo });
      if (res.ok) ok += 1; else if (!firstError) firstError = `${s.displayName}: ${res.error}`;
    }
    setBusy('');
    setPicked(new Set());
    setNote(firstError
      ? { tone: 'bad', text: `Готово для ${ok} из ${n}. ${firstError}` }
      : { tone: 'ok', sheet: action === 'reset-password',
        text: { 'reset-password': `Пароли сброшены: ${n}.`, disable: `Заблокировано: ${n}.`, enable: `Разблокировано: ${n}.`, move: `Переведено: ${n}.` }[action] });
    router.refresh();
  }

  return (
    <div className="cf-board">
      <div className="cf-board-bar">
        <label className="cf-board-search"><IconSearch size={16} />
          <input value={q} placeholder="Найти ученика" aria-label="Найти ученика" onChange={(e) => setQ(e.target.value)} />
        </label>
        {waiting.length > 0 && chosen.length === 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set(waiting.map((s) => s.userId)))}>
            {`Выбрать тех, кто ещё не входил: ${waiting.length}`}
          </button>
        )}
      </div>

      {chosen.length > 0 && (
        <div className="cf-bulk" role="toolbar" aria-label="Действия с выбранными">
          <strong>{`Выбрано: ${chosen.length}`}</strong>
          <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => run('reset-password')}><IconKey size={15} />Сбросить пароли</button>
          {canBlock && moveTargets && moveTargets.length > 0 && (
            <span className="cf-bulk-move">
              <select className="select" value={moveTo} aria-label="Куда перевести" onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Перевести в…</option>
                {moveTargets.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <button type="button" className="btn btn-sm" disabled={!!busy || !moveTo} onClick={() => run('move')}><IconSwap size={15} />Перевести</button>
            </span>
          )}
          {canBlock && (chosen.every((s) => s.disabled)
            ? <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => run('enable')}>Разблокировать</button>
            : <button type="button" className="btn btn-sm btn-danger" disabled={!!busy} onClick={() => run('disable')}><IconLock size={15} />Заблокировать</button>)}
          <span className="spacer" />
          {busy ? <span className="muted">{`Выполняю… ${busy}`}</span>
            : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set())}>Снять выбор</button>}
        </div>
      )}

      {note && (
        <p className={note.tone === 'ok' ? 'ok-box' : 'error-box'} role="status">
          {note.text}{' '}
          {note.sheet && <Link href={`/org/groups/${groupId}/credentials`}><IconPrint size={14} /> Открыть лист паролей</Link>}
        </p>
      )}

      <div className="table-wrap">
        <table className="data-table cf-table">
          <thead>
            <tr>
              <th className="cf-col-check">
                <input type="checkbox" checked={allShown} aria-label="Выбрать всех"
                  onChange={() => setPicked(allShown ? new Set() : new Set(shown.map((s) => s.userId)))} />
              </th>
              <th>Ученик</th><th>Логин</th><th>Статус</th><th><span className="visually-hidden">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const status = personStatus(s);
              const on = picked.has(s.userId);
              return (
                <tr key={s.userId} className={on ? 'selected' : undefined}>
                  <td className="cf-col-check"><input type="checkbox" checked={on} aria-label={`Выбрать: ${s.displayName}`} onChange={() => flip(s.userId)} /></td>
                  <td data-label="Ученик"><strong>{s.displayName}</strong></td>
                  <td data-label="Логин"><span className="num">{s.login ?? '—'}</span></td>
                  <td data-label="Статус"><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                  <td className="actions">{rowActions[s.userId]}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={5}><p className="muted cf-board-none">Никого не нашлось.</p></td></tr>}
          </tbody>
        </table>
      </div>
      {confirmDialog}
    </div>
  );
}

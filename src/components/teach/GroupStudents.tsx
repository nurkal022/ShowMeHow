'use client';
import { useState } from 'react';
import type { GroupStudentRow } from '@/lib/lms/teach-home';
import { formatAgo } from '@/lib/lms/format';
import { Avatar } from '@/components/cabinet/viz';

type Filter = 'all' | 'behind' | 'never' | 'pending';
type Sort = 'name' | 'progress' | 'avg' | 'last';
const WEEK = 7 * 86_400_000;

const behind = (s: GroupStudentRow) => !s.disabled && (
  s.lastActive === null || new Date(s.lastActive).getTime() < Date.now() - WEEK || (s.avgPercent !== null && s.avgPercent < 55) || s.returned > 0);

const FILTERS: { key: Filter; label: string; match: (s: GroupStudentRow) => boolean }[] = [
  { key: 'all', label: 'Все', match: () => true },
  { key: 'behind', label: 'Отстают', match: behind },
  { key: 'never', label: 'Не вошли', match: (s) => s.mustChange && !s.disabled },
  { key: 'pending', label: 'Ждут проверки', match: (s) => s.pending > 0 },
];

const pct = (s: GroupStudentRow) => (s.topics ? Math.round((s.opened / s.topics) * 100) : 0);

/** Ученики группы: быстрые фильтры и сортировка по прогрессу, баллу и последнему заходу. */
export default function GroupStudents({ students }: { students: GroupStudentRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const shown = students.filter(f.match).sort((a, b) => {
    if (sort === 'progress') return pct(a) - pct(b);
    if (sort === 'avg') return (a.avgPercent ?? -1) - (b.avgPercent ?? -1);
    if (sort === 'last') return (a.lastActive ?? '').localeCompare(b.lastActive ?? '');
    return a.name.localeCompare(b.name, 'ru');
  });
  const th = (key: Sort, label: string, cls = '') => (
    <th className={cls} aria-sort={sort === key ? 'ascending' : undefined}>
      <button type="button" className={sort === key ? 'th-sort active' : 'th-sort'} onClick={() => setSort(key)}>{label}</button>
    </th>
  );

  if (students.length === 0) return <p className="empty-state">В группе пока нет учеников — их добавляет администратор организации.</p>;
  return (
    <>
      <div className="cf-filter group-filter" role="group" aria-label="Каких учеников показать">
        {FILTERS.map((x) => (
          <button key={x.key} type="button" aria-pressed={filter === x.key}
            className={filter === x.key ? 'cf-filter-item active' : 'cf-filter-item'} onClick={() => setFilter(x.key)}>
            {x.label}<span className="cf-count">{students.filter(x.match).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="empty-state">Под этот фильтр никто не подходит.</p> : (
        <div className="table-wrap">
          <table className="data-table student-rows">
            <thead><tr>{th('name', 'Ученик')}{th('progress', 'Прогресс')}{th('avg', 'Балл', 'center')}<th className="center">Сдано</th>{th('last', 'Был')}</tr></thead>
            <tbody key={`${filter}-${sort}`}>
              {shown.map((s) => {
                const p = pct(s);
                const last = s.lastActive ? new Date(s.lastActive).getTime() : null;
                const stale = last === null || last < Date.now() - WEEK;
                return (
                  <tr key={s.id} className={s.disabled ? 'muted-row' : ''}>
                    <td data-label="Ученик">
                      <span className="person-cell">
                        <Avatar name={s.name} size={30} />
                        <span><b>{s.name}</b>
                          <small className="muted">{s.disabled ? 'заблокирован' : s.mustChange ? 'ещё не вошёл' : s.login ?? ''}</small></span>
                      </span>
                    </td>
                    <td data-label="Прогресс">
                      <span className="inline-meter"><span className="meter"><i style={{ width: `${p}%` }} /></span><span className="num">{p}%</span></span>
                    </td>
                    <td data-label="Балл" className="center">
                      {s.avgPercent === null ? <span className="muted">—</span>
                        : <span className={`score-chip ${s.avgPercent >= 80 ? 'good' : s.avgPercent >= 55 ? 'mid' : 'low'}`}>{s.avgPercent}%</span>}
                    </td>
                    <td data-label="Сдано" className="center num">
                      {s.done}<span className="muted">/{s.tasks}</span>
                      {s.pending > 0 && <span className="status-pill warn" title="Ждут проверки">{s.pending}</span>}
                    </td>
                    <td data-label="Был" className={stale ? 'stale' : ''}>{formatAgo(s.lastActive)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

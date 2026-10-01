'use client';
import { useState } from 'react';
import type { GroupStudentRow } from '@/lib/lms/teach-home';
import { formatAgo } from '@/lib/lms/format';
import { Avatar } from '@/components/cabinet/viz';
import { useLocale, useT } from '@/i18n/client';
import { teachReview } from '@/i18n/messages/teach-review';
import { INTL_LOCALE } from '@/i18n/config';

type Filter = 'all' | 'behind' | 'never' | 'pending';
type Sort = 'name' | 'progress' | 'avg' | 'last';
const WEEK = 7 * 86_400_000;

const behind = (s: GroupStudentRow) => !s.disabled && (
  s.lastActive === null || new Date(s.lastActive).getTime() < Date.now() - WEEK || (s.avgPercent !== null && s.avgPercent < 55) || s.returned > 0);

const FILTERS: { key: Filter; label: 'gAll' | 'gBehind' | 'gNever' | 'gPending'; match: (s: GroupStudentRow) => boolean }[] = [
  { key: 'all', label: 'gAll', match: () => true },
  { key: 'behind', label: 'gBehind', match: behind },
  { key: 'never', label: 'gNever', match: (s) => s.mustChange && !s.disabled },
  { key: 'pending', label: 'gPending', match: (s) => s.pending > 0 },
];

const pct = (s: GroupStudentRow) => (s.topics ? Math.round((s.opened / s.topics) * 100) : 0);

/** Ученики группы: быстрые фильтры и сортировка по прогрессу, баллу и последнему заходу. */
export default function GroupStudents({ students }: { students: GroupStudentRow[] }) {
  const t = useT(teachReview);
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const shown = students.filter(f.match).sort((a, b) => {
    if (sort === 'progress') return pct(a) - pct(b);
    if (sort === 'avg') return (a.avgPercent ?? -1) - (b.avgPercent ?? -1);
    if (sort === 'last') return (a.lastActive ?? '').localeCompare(b.lastActive ?? '');
    return a.name.localeCompare(b.name, INTL_LOCALE[locale]);
  });
  const th = (key: Sort, label: string, cls = '') => (
    <th className={cls} aria-sort={sort === key ? 'ascending' : undefined}>
      <button type="button" className={sort === key ? 'th-sort active' : 'th-sort'} onClick={() => setSort(key)}>{label}</button>
    </th>
  );

  if (students.length === 0) return <p className="empty-state">{t('groupEmpty')}</p>;
  return (
    <>
      <div className="cf-filter group-filter" role="group" aria-label={t('groupFilter')}>
        {FILTERS.map((x) => (
          <button key={x.key} type="button" aria-pressed={filter === x.key}
            className={filter === x.key ? 'cf-filter-item active' : 'cf-filter-item'} onClick={() => setFilter(x.key)}>
            {t(x.label)}<span className="cf-count">{students.filter(x.match).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="empty-state">{t('noneMatch')}</p> : (
        <div className="table-wrap">
          <table className="data-table student-rows">
            <thead><tr>{th('name', t('student'))}{th('progress', t('progress'))}{th('avg', t('score'), 'center')}<th className="center">{t('submitted')}</th>{th('last', t('lastSeen'))}</tr></thead>
            <tbody key={`${filter}-${sort}`}>
              {shown.map((s) => {
                const p = pct(s);
                const last = s.lastActive ? new Date(s.lastActive).getTime() : null;
                const stale = last === null || last < Date.now() - WEEK;
                return (
                  <tr key={s.id} className={s.disabled ? 'muted-row' : ''}>
                    <td data-label={t('student')}>
                      <span className="person-cell">
                        <Avatar name={s.name} size={30} />
                        <span><b>{s.name}</b>
                          <small className="muted">{s.disabled ? t('blocked') : s.mustChange ? t('notLoggedIn') : s.login ?? ''}</small></span>
                      </span>
                    </td>
                    <td data-label={t('progress')}>
                      <span className="inline-meter"><span className="meter"><i style={{ width: `${p}%` }} /></span><span className="num">{p}%</span></span>
                    </td>
                    <td data-label={t('score')} className="center">
                      {s.avgPercent === null ? <span className="muted">—</span>
                        : <span className={`score-chip ${s.avgPercent >= 80 ? 'good' : s.avgPercent >= 55 ? 'mid' : 'low'}`}>{s.avgPercent}%</span>}
                    </td>
                    <td data-label={t('submitted')} className="center num">
                      {s.done}<span className="muted">/{s.tasks}</span>
                      {s.pending > 0 && <span className="status-pill warn" title={t('gPending')}>{s.pending}</span>}
                    </td>
                    <td data-label={t('lastSeen')} className={stale ? 'stale' : ''}>{formatAgo(s.lastActive, locale)}</td>
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

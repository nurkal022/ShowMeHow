import Link from 'next/link';
import type { GroupSummary } from '@/lib/org/groups';
import { withOrgParam } from '@/lib/lms/links';
import { IconPrint, IconUsers } from '@/components/icons';
import GroupRowMenu from './GroupRowMenu';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { orgPeople } from '@/i18n/messages/org-people';

export default function GroupsTable({ groups, org, locale = 'ru' }: { groups: GroupSummary[]; org: string; locale?: Locale }) {
  const t = translator(orgPeople, locale);
  if (groups.length === 0) {
    return <p className="empty-state">{t('noGroups')}</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead>
          <tr><th>{t('group')}</th><th>{t('teachers')}</th><th className="center">{t('studentsCol')}</th><th><span className="visually-hidden">{t('actions')}</span></th></tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td data-label={t('group')}>
                <span className="cf-group-name">
                  <span className="cf-kind cf-kind-text" aria-hidden="true"><IconUsers size={16} /></span>
                  <Link href={withOrgParam(`/org/groups/${g.id}`, org)}><strong>{g.title}</strong></Link>
                </span>
              </td>
              <td data-label={t('teachers')}>
                {g.teacherNames.length
                  ? <span className="cf-tags">{g.teacherNames.map((n) => <span key={n} className="cf-tag">{n}</span>)}</span>
                  : <span className="muted">{t('notAssigned')}</span>}
              </td>
              <td data-label={t('studentsCol')} className="center">{g.studentCount}</td>
              <td className="actions">
                <span className="cf-row-actions">
                  <Link className="btn btn-sm btn-ghost" href={withOrgParam(`/org/groups/${g.id}`, org)}>{t('open')}</Link>
                  <Link className="icon-btn cf-icon-btn" href={`/org/groups/${g.id}/credentials`}
                    aria-label={t('sheetOf', { title: g.title })} title={t('sheet')}><IconPrint size={16} /></Link>
                  <GroupRowMenu slug={org} groupId={g.id} title={g.title} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

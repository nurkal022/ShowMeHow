import Link from 'next/link';
import type { GroupSummary } from '@/lib/org/groups';
import { withOrgParam } from '@/lib/lms/links';
import { IconPrint, IconUsers } from '@/components/icons';
import GroupRowMenu from './GroupRowMenu';

export default function GroupsTable({ groups, org }: { groups: GroupSummary[]; org: string }) {
  if (groups.length === 0) {
    return <p className="empty-state">Пока нет групп. Создайте первую — например, «7А».</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead>
          <tr><th>Группа</th><th>Учителя</th><th className="center">Учеников</th><th><span className="visually-hidden">Действия</span></th></tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td data-label="Группа">
                <span className="cf-group-name">
                  <span className="cf-kind cf-kind-text" aria-hidden="true"><IconUsers size={16} /></span>
                  <Link href={withOrgParam(`/org/groups/${g.id}`, org)}><strong>{g.title}</strong></Link>
                </span>
              </td>
              <td data-label="Учителя">
                {g.teacherNames.length
                  ? <span className="cf-tags">{g.teacherNames.map((t) => <span key={t} className="cf-tag">{t}</span>)}</span>
                  : <span className="muted">не назначены</span>}
              </td>
              <td data-label="Учеников" className="center">{g.studentCount}</td>
              <td className="actions">
                <span className="cf-row-actions">
                  <Link className="btn btn-sm btn-ghost" href={withOrgParam(`/org/groups/${g.id}`, org)}>Открыть</Link>
                  <Link className="icon-btn cf-icon-btn" href={`/org/groups/${g.id}/credentials`}
                    aria-label={`Лист паролей группы ${g.title}`} title="Лист паролей"><IconPrint size={16} /></Link>
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

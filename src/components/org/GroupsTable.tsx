import Link from 'next/link';
import type { GroupSummary } from '@/lib/org/groups';
import { withOrgParam } from '@/lib/lms/links';

export default function GroupsTable({ groups, org }: { groups: GroupSummary[]; org: string }) {
  if (groups.length === 0) {
    return <p className="empty-state">Пока нет групп. Создайте первую — например, «7А».</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Группа</th><th>Учителя</th><th className="center">Учеников</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td data-label="Группа"><Link href={withOrgParam(`/org/groups/${g.id}`, org)}>{g.title}</Link></td>
              <td data-label="Учителя">{g.teacherNames.length ? g.teacherNames.join(', ') : 'не назначены'}</td>
              <td data-label="Учеников" className="center">{g.studentCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

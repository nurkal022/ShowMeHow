import type { GroupStudent } from '@/lib/org/groups';
import StatusPill, { personStatus } from '@/components/cabinet/StatusPill';

export default function StudentsTable({ students, actions }: {
  students: GroupStudent[];
  actions?: (s: GroupStudent) => React.ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Ученик</th><th>Логин</th><th>Статус</th>{actions && <th />}</tr></thead>
        <tbody>
          {students.map((s) => {
            const status = personStatus(s);
            return (
              <tr key={s.userId}>
                <td data-label="Ученик">{s.displayName}</td>
                <td data-label="Логин"><span className="num">{s.login ?? '—'}</span></td>
                <td data-label="Статус"><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                {actions && <td className="actions">{actions(s)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

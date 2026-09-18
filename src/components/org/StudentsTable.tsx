import type { GroupStudent } from '@/lib/org/groups';
import StatusPill, { personStatus } from '@/components/cabinet/StatusPill';

export default function StudentsTable({ students, actions }: {
  students: GroupStudent[];
  actions?: (s: GroupStudent) => React.ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead>
          <tr><th className="cf-col-n">№</th><th>Ученик</th><th>Логин</th><th>Статус</th>
            {actions && <th><span className="visually-hidden">Действия</span></th>}</tr>
        </thead>
        <tbody>
          {students.map((s, i) => {
            const status = personStatus(s);
            return (
              <tr key={s.userId}>
                <td data-label="№" className="cf-col-n"><span className="num muted">{i + 1}</span></td>
                <td data-label="Ученик"><strong>{s.displayName}</strong></td>
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

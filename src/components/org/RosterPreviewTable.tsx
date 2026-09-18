import type { RosterPreviewRow } from '@/lib/org/bulk';
import { ROSTER_ISSUE_LABELS } from '@/lib/org/roster';
import StatusPill from '@/components/cabinet/StatusPill';

export default function RosterPreviewTable({ rows }: { rows: RosterPreviewRow[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Строка</th><th>Фамилия</th><th>Имя</th><th>Логин</th><th>Пометка</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line}>
              <td data-label="Строка">{r.line}</td>
              <td data-label="Фамилия">{r.lastName || '—'}</td>
              <td data-label="Имя">{r.firstName || '—'}</td>
              <td data-label="Логин"><span className="num">{r.login ?? '—'}</span></td>
              <td data-label="Пометка">
                {r.issue
                  ? <StatusPill tone="warn">{ROSTER_ISSUE_LABELS[r.issue]}</StatusPill>
                  : <StatusPill tone="ok">будет создан</StatusPill>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

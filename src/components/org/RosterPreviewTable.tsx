import type { RosterPreviewRow } from '@/lib/org/bulk';
import { ROSTER_ISSUE_LABELS } from '@/lib/org/roster';
import StatusPill from '@/components/cabinet/StatusPill';

/** Предпросмотр списка: строки с пометкой подсвечены, у остальных виден итоговый логин. */
export default function RosterPreviewTable({ rows }: { rows: RosterPreviewRow[] }) {
  return (
    <div className="table-wrap cf-preview-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>Строка</th><th>Фамилия</th><th>Имя</th><th>Логин</th><th>Пометка</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className={r.issue ? (r.issue === 'duplicate' || r.issue === 'in_group' ? 'cf-row-warn' : 'cf-row-bad') : undefined}>
              <td data-label="Строка"><span className="num">{r.line}</span></td>
              <td data-label="Фамилия">{r.lastName || '—'}</td>
              <td data-label="Имя">{r.firstName || '—'}</td>
              <td data-label="Логин"><span className="num">{r.login ?? '—'}</span></td>
              <td data-label="Пометка">
                {r.issue
                  ? <StatusPill tone={r.issue === 'duplicate' || r.issue === 'in_group' ? 'warn' : 'danger'}>{ROSTER_ISSUE_LABELS[r.issue]}</StatusPill>
                  : <StatusPill tone="ok">будет создан</StatusPill>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { Journal } from '@/lib/lms/journal';
import { cellText } from '@/lib/lms/journal';
import { formatScore } from '@/lib/lms/format';

export default function JournalTable({ journal }: { journal: Journal }) {
  if (journal.rows.length === 0 || journal.assignments.length === 0) {
    return (
      <p className="empty-state">
        В журнале пока пусто: нужны задания в курсе и группа с учениками, которой курс открыт.
      </p>
    );
  }
  const headers = journal.assignments.map((a) => `${a.topicTitle}: ${a.title} (${a.points})`);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>Ученик</th><th>Группы</th>{headers.map((h) => <th key={h} className="center">{h}</th>)}<th>Итого</th></tr>
        </thead>
        <tbody>
          {journal.rows.map((r) => (
            <tr key={r.student.id}>
              <td data-label="Ученик">{r.student.name}</td>
              <td data-label="Группы">{r.student.groups.join(', ')}</td>
              {r.cells.map((c, i) => (
                <td key={c.blockId} data-label={headers[i]} className="center">{cellText(c)}</td>
              ))}
              <td data-label="Итого"><strong>{`${formatScore(r.total)} из ${formatScore(r.max)}`}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { Progress } from '@/lib/lms/journal';

export default function ProgressTable({ progress }: { progress: Progress }) {
  if (progress.rows.length === 0 || progress.topics.length === 0) {
    return <p className="empty-state">Прогресса пока нет: нужны темы в курсе и группа с учениками, которой курс открыт.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>Ученик</th>{progress.topics.map((t) => <th key={t.id} className="center">{t.title}</th>)}<th>Открыто тем</th></tr>
        </thead>
        <tbody>
          {progress.rows.map((r) => (
            <tr key={r.student.id}>
              <td data-label="Ученик">{r.student.name}</td>
              {r.opened.map((opened, i) => (
                <td key={progress.topics[i].id} data-label={progress.topics[i].title} className="center">
                  {opened ? 'открывал' : '—'}
                </td>
              ))}
              <td data-label="Открыто тем">{`${r.count} из ${progress.topics.length}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

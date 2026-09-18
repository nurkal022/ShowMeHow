import type { Progress } from '@/lib/lms/journal';

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Прогресс: сколько тем открыл каждый ученик и как идёт каждая тема по группе — полосами. */
export default function ProgressTable({ progress }: { progress: Progress }) {
  if (progress.rows.length === 0 || progress.topics.length === 0) {
    return <p className="empty-state">Прогресса пока нет: нужны темы в курсе и группа с учениками, которой курс открыт.</p>;
  }
  const total = progress.topics.length;
  const students = progress.rows.length;
  return (
    <div className="cf-progress">
      <section className="cf-card cf-progress-card" aria-labelledby="progress-topics">
        <h2 id="progress-topics">По темам</h2>
        <p className="muted">Сколько учеников открывали каждую тему.</p>
        <ul className="cf-bars">
          {progress.topics.map((t, i) => {
            const opened = progress.rows.filter((r) => r.opened[i]).length;
            return (
              <li key={t.id} className="cf-bar-row">
                <span className="cf-bar-label">{`${i + 1}. ${t.title}`}</span>
                <span className="cf-bar" role="img" aria-label={`Открыли ${opened} из ${students}`}>
                  <span className="cf-bar-fill" style={{ width: `${percent(opened, students)}%` }} />
                </span>
                <span className="cf-bar-num">{`${opened} из ${students}`}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cf-card cf-progress-card" aria-labelledby="progress-students">
        <h2 id="progress-students">По ученикам</h2>
        <p className="muted">Закрашенная клетка — тему ученик открывал.</p>
        <ul className="cf-bars">
          {progress.rows.map((r) => (
            <li key={r.student.id} className="cf-bar-row cf-bar-row-student">
              <span className="cf-bar-label cf-person">
                <strong>{r.student.name}</strong>
                {r.student.groups.length > 0 && <span className="muted">{r.student.groups.join(', ')}</span>}
              </span>
              <span className="cf-bar-stack">
                <span className="cf-bar" aria-hidden="true">
                  <span className="cf-bar-fill" style={{ width: `${percent(r.count, total)}%` }} />
                </span>
              <span className="cf-steps">
                {r.opened.map((opened, i) => (
                  <span key={progress.topics[i].id} className={opened ? 'cf-step on' : 'cf-step'}
                    title={`${progress.topics[i].title}: ${opened ? 'открывал' : 'не открывал'}`}>
                    <span className="visually-hidden">{`${progress.topics[i].title}: ${opened ? 'открывал' : 'не открывал'}. `}</span>
                  </span>
                ))}
              </span>
              </span>
              <span className="cf-bar-num">{`${r.count} из ${total}`}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

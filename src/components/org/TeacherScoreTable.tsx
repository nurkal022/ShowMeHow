import type { TeacherScore } from '@/lib/org/reports';
import { formatAgo } from '@/lib/lms/format';
import { Avatar } from '@/components/cabinet/viz';

/** Подсветка: зелёное — хорошо, красное — стоит обсудить. Пороги мягкие и видны в подсказке. */
function mark(v: number | null, good: (x: number) => boolean, bad: (x: number) => boolean): string {
  if (v === null) return '';
  return good(v) ? 'good' : bad(v) ? 'bad' : '';
}

/** Работа учителей за 30 дней: скорость и качество проверки, долги, разборы уроков, активность учеников. */
export default function TeacherScoreTable({ teachers }: { teachers: TeacherScore[] }) {
  return (
    <section className="cab-card">
      <header className="cab-card-head">
        <div><h2>Работа учителей за 30 дней</h2><span className="muted">Скорость и качество проверки, долги, разборы уроков и вовлечённость учеников</span></div>
      </header>
      <div className="table-wrap">
        <table className="data-table score-table">
          <thead><tr>
            <th>Учитель</th><th className="center" title="Опубликовано / всего">Курсы</th><th className="center">Ученики активны</th>
            <th className="center">Балл учеников</th><th className="center">Проверено</th><th className="center" title="Медиана часов от сдачи до оценки; хорошо — до суток">До проверки</th>
            <th className="center" title="Доля оценок с комментарием ученику">С комментарием</th><th className="center">Ждут</th><th className="center" title="Разборы уроков с помощником">Разборы</th><th>Был</th>
          </tr></thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.userId}>
                <td data-label="Учитель"><span className="person-cell"><Avatar name={t.name} size={30} /><span><b>{t.name}</b><small className="muted">{t.groups.join(', ') || 'без групп'}</small></span></span></td>
                <td data-label="Курсы" className="center num">{t.published}<small className="muted">/{t.courses}</small></td>
                <td data-label="Ученики активны" className={`center num ${mark(t.activeShare, (x) => x >= 70, (x) => x < 40)}`}>{t.activeShare === null ? '—' : `${t.activeShare}%`}</td>
                <td data-label="Балл учеников" className={`center num ${mark(t.avgPercent, (x) => x >= 75, (x) => x < 55)}`}>{t.avgPercent === null ? '—' : `${t.avgPercent}%`}</td>
                <td data-label="Проверено" className="center num">{t.graded}</td>
                <td data-label="До проверки" className={`center num ${mark(t.medianHours, (x) => x <= 24, (x) => x > 72)}`}>{t.medianHours === null ? '—' : `${t.medianHours} ч`}</td>
                <td data-label="С комментарием" className={`center num ${mark(t.commentShare, (x) => x >= 60, (x) => x < 20)}`}>{t.commentShare === null ? '—' : `${t.commentShare}%`}</td>
                <td data-label="Ждут" className={`center num ${mark(t.oldestPendingDays, (x) => x <= 2, (x) => x > 7)}`}>{t.pending}{t.oldestPendingDays !== null && <small className="muted"> · {t.oldestPendingDays} дн.</small>}</td>
                <td data-label="Разборы" className="center num">{t.debriefs}</td>
                <td data-label="Был">{formatAgo(t.lastActive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

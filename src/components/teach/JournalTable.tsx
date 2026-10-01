import type { Journal, JournalCell } from '@/lib/lms/journal';
import { cellTextIn } from '@/lib/lms/journal';
import { formatScore } from '@/lib/lms/format';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { teachReview } from '@/i18n/messages/teach-review';

function cellTone(c: JournalCell, points: number): string {
  if (c.state === 'graded' && c.score !== null) {
    if (points <= 0) return 'good';
    const share = c.score / points;
    return share >= 0.8 ? 'good' : share >= 0.5 ? 'mid' : 'low';
  }
  if (c.state === 'submitted') return 'wait';
  if (c.state === 'returned') return 'back';
  return 'none';
}

/** Журнал: имя ученика и шапка остаются на месте, прокручиваются только оценки — внутри карточки. */
export default function JournalTable({ journal, studentHref, locale = 'ru' }: { journal: Journal; studentHref?: (id: string) => string; locale?: Locale }) {
  const t = translator(teachReview, locale);
  if (journal.rows.length === 0 || journal.assignments.length === 0) {
    return (
      <p className="empty-state">
        {t('journalEmpty')}
      </p>
    );
  }
  const headers = journal.assignments.map((a) => `${a.topicTitle}: ${a.title} (${a.points})`);
  return (
    <div className="cf-card cf-grid-card">
      <div className="cf-legend" aria-hidden="true">
        <span><i className="cf-dot good" />{t('legendGood')}</span>
        <span><i className="cf-dot mid" />50–79%</span>
        <span><i className="cf-dot low" />{t('legendLow')}</span>
        <span><i className="cf-dot wait" />{t('legendWait')}</span>
      </div>
      <div className="cf-grid-scroll" tabIndex={0} role="region" aria-label={t('journalRegion')}>
        <table className="cf-grid-table">
          <thead>
            <tr>
              <th scope="col" className="cf-sticky-col">{t('student')}</th>
              {journal.assignments.map((a, i) => (
                <th key={a.blockId} scope="col" title={headers[i]}>
                  <span className="visually-hidden">{headers[i]}</span>
                  <span className="cf-col-head" aria-hidden="true">
                    <span className="muted">{a.topicTitle}</span>
                    <span>{a.title}</span>
                    <span className="muted">{t('maxPoints', { n: a.points })}</span>
                  </span>
                </th>
              ))}
              <th scope="col" className="cf-total">{t('total')}</th>
            </tr>
          </thead>
          <tbody>
            {journal.rows.map((r) => (
              <tr key={r.student.id}>
                <th scope="row" className="cf-sticky-col">
                  <span className="cf-person">
                    <strong>{studentHref ? <a href={studentHref(r.student.id)}>{r.student.name}</a> : r.student.name}</strong>
                    {r.student.groups.length > 0 && <span className="muted">{r.student.groups.join(', ')}</span>}
                  </span>
                </th>
                {r.cells.map((c, i) => (
                  <td key={c.blockId}>
                    <span className={`cf-cell ${cellTone(c, journal.assignments[i].points)}`}>{cellTextIn(c, locale)}</span>
                  </td>
                ))}
                <td className="cf-total"><strong>{t('ofMax', { a: formatScore(r.total, locale), b: formatScore(r.max, locale) })}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

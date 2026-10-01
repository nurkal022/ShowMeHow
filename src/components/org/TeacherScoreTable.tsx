import type { TeacherScore } from '@/lib/org/reports';
import { formatAgo } from '@/lib/lms/format';
import { Avatar } from '@/components/cabinet/viz';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { org } from '@/i18n/messages/org';

/** Подсветка: зелёное — хорошо, красное — стоит обсудить. Пороги мягкие и видны в подсказке. */
function mark(v: number | null, good: (x: number) => boolean, bad: (x: number) => boolean): string {
  if (v === null) return '';
  return good(v) ? 'good' : bad(v) ? 'bad' : '';
}

/** Работа учителей за 30 дней: скорость и качество проверки, долги, разборы уроков, активность учеников. */
export default function TeacherScoreTable({ teachers, locale = 'ru' }: { teachers: TeacherScore[]; locale?: Locale }) {
  const tr = translator(org, locale);
  return (
    <section className="cab-card">
      <header className="cab-card-head">
        <div><h2>{tr('scoreTitle')}</h2><span className="muted">{tr('scoreHint')}</span></div>
      </header>
      <div className="table-wrap">
        <table className="data-table score-table">
          <thead><tr>
            <th>{tr('c_teacher')}</th><th className="center" title={tr('c_coursesTip')}>{tr('c_courses')}</th><th className="center">{tr('c_active')}</th>
            <th className="center">{tr('c_score')}</th><th className="center">{tr('c_graded')}</th><th className="center" title={tr('c_toReviewTip')}>{tr('c_toReview')}</th>
            <th className="center" title={tr('c_commentTip')}>{tr('c_comment')}</th><th className="center">{tr('c_waiting')}</th><th className="center" title={tr('c_debriefsTip')}>{tr('c_debriefs')}</th><th>{tr('c_seen')}</th>
          </tr></thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.userId}>
                <td data-label={tr('c_teacher')}><span className="person-cell"><Avatar name={t.name} size={30} /><span><b>{t.name}</b><small className="muted">{t.groups.join(', ') || tr('noGroups')}</small></span></span></td>
                <td data-label={tr('c_courses')} className="center num">{t.published}<small className="muted">/{t.courses}</small></td>
                <td data-label={tr('c_active')} className={`center num ${mark(t.activeShare, (x) => x >= 70, (x) => x < 40)}`}>{t.activeShare === null ? '—' : `${t.activeShare}%`}</td>
                <td data-label={tr('c_score')} className={`center num ${mark(t.avgPercent, (x) => x >= 75, (x) => x < 55)}`}>{t.avgPercent === null ? '—' : `${t.avgPercent}%`}</td>
                <td data-label={tr('c_graded')} className="center num">{t.graded}</td>
                <td data-label={tr('c_toReview')} className={`center num ${mark(t.medianHours, (x) => x <= 24, (x) => x > 72)}`}>{t.medianHours === null ? '—' : tr('hours', { n: t.medianHours })}</td>
                <td data-label={tr('c_comment')} className={`center num ${mark(t.commentShare, (x) => x >= 60, (x) => x < 20)}`}>{t.commentShare === null ? '—' : `${t.commentShare}%`}</td>
                <td data-label={tr('c_waiting')} className={`center num ${mark(t.oldestPendingDays, (x) => x <= 2, (x) => x > 7)}`}>{t.pending}{t.oldestPendingDays !== null && <small className="muted"> · {tr('days', { n: t.oldestPendingDays })}</small>}</td>
                <td data-label={tr('c_debriefs')} className="center num">{t.debriefs}</td>
                <td data-label={tr('c_seen')}>{formatAgo(t.lastActive, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

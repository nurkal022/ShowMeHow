import type { Progress } from '@/lib/lms/journal';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { teachReview } from '@/i18n/messages/teach-review';

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Прогресс: сколько тем открыл каждый ученик и как идёт каждая тема по группе — полосами. */
export default function ProgressTable({ progress, locale = 'ru' }: { progress: Progress; locale?: Locale }) {
  const t = translator(teachReview, locale);
  if (progress.rows.length === 0 || progress.topics.length === 0) {
    return <p className="empty-state">{t('progressEmpty')}</p>;
  }
  const total = progress.topics.length;
  const students = progress.rows.length;
  return (
    <div className="cf-progress">
      <section className="cf-card cf-progress-card" aria-labelledby="progress-topics">
        <h2 id="progress-topics">{t('byTopics')}</h2>
        <p className="muted">{t('byTopicsSub')}</p>
        <ul className="cf-bars">
          {progress.topics.map((tp, i) => {
            const opened = progress.rows.filter((r) => r.opened[i]).length;
            return (
              <li key={tp.id} className="cf-bar-row">
                <span className="cf-bar-label">{`${i + 1}. ${tp.title}`}</span>
                <span className="cf-bar" role="img" aria-label={t('openedOf', { n: opened, total: students })}>
                  <span className="cf-bar-fill" style={{ width: `${percent(opened, students)}%` }} />
                </span>
                <span className="cf-bar-num">{t('ofMax', { a: opened, b: students })}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cf-card cf-progress-card" aria-labelledby="progress-students">
        <h2 id="progress-students">{t('byStudents')}</h2>
        <p className="muted">{t('byStudentsSub')}</p>
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
                    title={t(opened ? 'stepOpened' : 'stepNotOpened', { title: progress.topics[i].title })}>
                    <span className="visually-hidden">{`${t(opened ? 'stepOpened' : 'stepNotOpened', { title: progress.topics[i].title })}. `}</span>
                  </span>
                ))}
              </span>
              </span>
              <span className="cf-bar-num">{t('ofMax', { a: r.count, b: total })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

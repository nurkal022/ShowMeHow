import type { TeacherActivity } from '@/lib/org/insights';
import { formatAgo } from '@/lib/lms/format';
import Sparkline from '@/components/cabinet/charts/Sparkline';
import { Avatar } from '@/components/cabinet/viz';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { org } from '@/i18n/messages/org';

const DAY = 86_400_000;

/** Карточки учителей: нагрузка, долг по проверке и когда человек был в последний раз. */
export default function TeacherCards({ teachers, locale = 'ru' }: { teachers: TeacherActivity[]; locale?: Locale }) {
  const tr = translator(org, locale);
  return (
    <div className="teacher-grid">
      {teachers.map((t) => {
        const ago = t.lastActive ? Date.now() - new Date(t.lastActive).getTime() : null;
        const pulse = ago === null ? 'off' : ago < 2 * DAY ? 'on' : ago < 7 * DAY ? 'mid' : 'off';
        return (
          <article key={t.userId} className="teacher-card">
            <header>
              <span className="teacher-avatar"><Avatar name={t.name} size={42} /><i className={`pulse pulse-${pulse}`} /></span>
              <div>
                <h3>{t.name}</h3>
                <span className="muted">{t.admin ? tr('adminPrefix') : ''}{t.lastActive ? tr('lastSeen', { ago: formatAgo(t.lastActive, locale) }) : tr('neverIn')}</span>
              </div>
            </header>
            <div className="chip-row">
              {t.groups.length ? t.groups.map((g) => <span key={g} className="chip-sm">{g}</span>) : <span className="chip-sm warn">{tr('noGroups')}</span>}
            </div>
            <dl className="teacher-facts">
              <div><dt>{tr('courses', { n: t.courses })}</dt><dd>{t.published}<small>/{t.courses}</small></dd></div>
              <div className={t.pending > 10 ? 'hot' : ''}><dt>{tr('pending')}</dt><dd>{t.pending}</dd></div>
              <div><dt>{tr('graded7')}</dt><dd>{t.graded7d}</dd></div>
            </dl>
            <div className="teacher-spark">
              {t.spark.some((v) => v > 0)
                ? <Sparkline values={t.spark} label={tr('sparkGraded', { name: t.name })} />
                : <span className="muted">{tr('noGrading')}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

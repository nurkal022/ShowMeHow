import type { TeacherActivity } from '@/lib/org/insights';
import { formatAgo, ruPlural } from '@/lib/lms/format';
import Sparkline from '@/components/cabinet/charts/Sparkline';
import { Avatar } from '@/components/cabinet/viz';

const DAY = 86_400_000;

/** Карточки учителей: нагрузка, долг по проверке и когда человек был в последний раз. */
export default function TeacherCards({ teachers }: { teachers: TeacherActivity[] }) {
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
                <span className="muted">{t.admin ? 'админ · ' : ''}{t.lastActive ? `был ${formatAgo(t.lastActive)}` : 'ещё не входил'}</span>
              </div>
            </header>
            <div className="chip-row">
              {t.groups.length ? t.groups.map((g) => <span key={g} className="chip-sm">{g}</span>) : <span className="chip-sm warn">без групп</span>}
            </div>
            <dl className="teacher-facts">
              <div><dt>{ruPlural(t.courses, 'курс', 'курса', 'курсов')}</dt><dd>{t.published}<small>/{t.courses}</small></dd></div>
              <div className={t.pending > 10 ? 'hot' : ''}><dt>ждут проверки</dt><dd>{t.pending}</dd></div>
              <div><dt>проверил за 7 дн.</dt><dd>{t.graded7d}</dd></div>
            </dl>
            <div className="teacher-spark">
              {t.spark.some((v) => v > 0)
                ? <Sparkline values={t.spark} label={`${t.name}: проверенные работы за 14 дней`} />
                : <span className="muted">за 2 недели проверок не было</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

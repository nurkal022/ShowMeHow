'use client';
import type { ActivityDay } from '@/lib/lms/student-home';
import { useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';
import { IconFlame } from '@/components/icons';

function level(n: number): 0 | 1 | 2 | 3 {
  if (n === 0) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  return 3;
}

/**
 * Сетка активности за N недель: столбец — неделя, строка — день недели.
 * Данные простые (сколько действий в день), поэтому оттенков всего три.
 */
export default function ActivityGrid({ days, weeks = 12, streak, bestStreak, today }: {
  days: ActivityDay[]; weeks?: number; streak: number; bestStreak: number; today: string;
}) {
  const t = useT(learn);
  const WEEKDAYS = t('weekdays').split(',');
  const MONTHS = t('months').split(',');
  const counts = new Map(days.map((d) => [d.date, d.count]));
  const end = new Date(`${today}T12:00:00Z`);
  // Сетка заканчивается текущей неделей: последний столбец — эта неделя с понедельника.
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - (weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + w * 7 + d);
    const key = day.toISOString().slice(0, 10);
    return { key, month: day.getUTCMonth(), date: day.getUTCDate(), n: counts.get(key) ?? 0, future: day > end };
  }));
  const active = days.filter((d) => d.count > 0).length;

  return (
    <section className="ag" aria-label={t('activity')}>
      <header className="ag-head">
        <span className={streak > 0 ? 'ag-flame on' : 'ag-flame'} aria-hidden="true"><IconFlame size={22} /></span>
        <div>
          <strong>{streak > 0 ? t('streakDays', { n: streak }) : t('streakBroken')}</strong>
          <span className="muted">{streak > 0 ? t('bestStreak', { n: bestStreak }) : t('startAgain')}</span>
        </div>
        <span className="muted ag-total">{t('activeDaysInWeeks', { n: active, weeks })}</span>
      </header>
      <div className="ag-body">
        <div className="ag-week-labels" aria-hidden="true">{WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="ag-cols" role="img" aria-label={t('activityAria', { weeks, n: active })}>
          {cols.map((col, i) => (
            <div key={i} className="ag-col">
              <span className="ag-month" aria-hidden="true">
                {/* Подпись месяца — над первой неделей месяца. */}
                {col[0].date <= 7 ? MONTHS[col[0].month] : ''}
              </span>
              {col.map((c) => (
                <i key={c.key} className={c.future ? 'ag-cell future' : `ag-cell l${level(c.n)}`}
                  title={c.future ? '' : t('cellTitle', { date: c.date, month: MONTHS[c.month], what: c.n === 0 ? t('noActivity') : t('actionsN', { n: c.n }) })} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <footer className="ag-legend">
        <span className="muted">{t('less')}</span>
        <i className="ag-cell l0" /><i className="ag-cell l1" /><i className="ag-cell l2" /><i className="ag-cell l3" />
        <span className="muted">{t('more')}</span>
      </footer>
    </section>
  );
}

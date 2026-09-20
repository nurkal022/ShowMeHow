import type { ActivityDay } from '@/lib/lms/student-home';
import { ruPlural } from '@/lib/lms/format';
import { IconFlame } from '@/components/icons';

const WEEKDAYS = ['пн', '', 'ср', '', 'пт', '', 'вс'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

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
    <section className="ag" aria-label="Активность">
      <header className="ag-head">
        <span className={streak > 0 ? 'ag-flame on' : 'ag-flame'} aria-hidden="true"><IconFlame size={22} /></span>
        <div>
          <strong>{streak > 0 ? `${streak} ${ruPlural(streak, 'день', 'дня', 'дней')} подряд` : 'Серия прервалась'}</strong>
          <span className="muted">{streak > 0 ? `Лучшая серия: ${bestStreak}` : 'Позанимайтесь сегодня — начнём заново'}</span>
        </div>
        <span className="muted ag-total">{`${active} ${ruPlural(active, 'день', 'дня', 'дней')} за ${weeks} недель`}</span>
      </header>
      <div className="ag-body">
        <div className="ag-week-labels" aria-hidden="true">{WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="ag-cols" role="img" aria-label={`Дни с занятиями за ${weeks} недель: ${active}`}>
          {cols.map((col, i) => (
            <div key={i} className="ag-col">
              <span className="ag-month" aria-hidden="true">
                {/* Подпись месяца — над первой неделей месяца. */}
                {col[0].date <= 7 ? MONTHS[col[0].month] : ''}
              </span>
              {col.map((c) => (
                <i key={c.key} className={c.future ? 'ag-cell future' : `ag-cell l${level(c.n)}`}
                  title={c.future ? '' : `${c.date} ${MONTHS[c.month]} — ${c.n === 0 ? 'без занятий' : `${c.n} ${ruPlural(c.n, 'действие', 'действия', 'действий')}`}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <footer className="ag-legend">
        <span className="muted">меньше</span>
        <i className="ag-cell l0" /><i className="ag-cell l1" /><i className="ag-cell l2" /><i className="ag-cell l3" />
        <span className="muted">больше</span>
      </footer>
    </section>
  );
}

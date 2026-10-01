import { db } from '../db/client';
import type { Locale } from '@/i18n/config';

/**
 * Серия и значки ученика. Ничего не хранится отдельно: всё считается по сданным работам
 * и открытым темам, поэтому не расходится с журналом и не требует миграций.
 */

export interface Badge { id: string; title: string; hint: string; earned: boolean; progress: number; goal: number }
export interface Achievements { streak: number; bestStreak: number; activeDays: string[]; badges: Badge[] }

/** Серия — дни подряд до сегодня (или до вчера, если сегодня ещё не занимался). */
export function streakOf(days: string[], today: string): { current: number; best: number } {
  const set = new Set(days);
  const prev = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
  let start = set.has(today) ? today : prev(today);
  let current = 0;
  while (set.has(start)) { current += 1; start = prev(start); }
  let best = 0;
  for (const d of [...set].sort()) {
    let run = 1;
    let p = prev(d);
    while (set.has(p)) { run += 1; p = prev(p); }
    best = Math.max(best, run);
  }
  return { current, best };
}

type BadgeId = 'first' | 'ten' | 'sniper' | 'explorer' | 'lab' | 'exam' | 'streak3' | 'streak7';
const BADGE_TEXT: Record<Locale, Record<BadgeId, [title: string, hint: string]>> = {
  ru: {
    first: ['Первый шаг', 'Сдать первое задание'], ten: ['Десятка', 'Сдать 10 заданий'],
    sniper: ['Снайпер', '5 заданий на полный балл'], explorer: ['Исследователь', 'Открыть 5 тем'],
    lab: ['Экспериментатор', 'Сдать таблицу измерений'], exam: ['Выдержка', 'Написать контрольную'],
    streak3: ['Три дня подряд', 'Заниматься 3 дня без перерыва'], streak7: ['Неделя', 'Серия из 7 дней'],
  },
  kk: {
    first: ['Алғашқы қадам', 'Алғашқы тапсырманы тапсыру'], ten: ['Ондық', '10 тапсырма тапсыру'],
    sniper: ['Мерген', 'Толық ұпайға 5 тапсырма'], explorer: ['Зерттеуші', '5 тақырып ашу'],
    lab: ['Экспериментатор', 'Өлшеулер кестесін тапсыру'], exam: ['Төзімділік', 'Бақылау жұмысын жазу'],
    streak3: ['Қатарынан үш күн', '3 күн үзіліссіз оқу'], streak7: ['Апта', '7 күндік серия'],
  },
  en: {
    first: ['First step', 'Submit your first assignment'], ten: ['Top ten', 'Submit 10 assignments'],
    sniper: ['Sharpshooter', '5 assignments with full points'], explorer: ['Explorer', 'Open 5 topics'],
    lab: ['Experimenter', 'Submit a measurement table'], exam: ['Composure', 'Take a test'],
    streak3: ['Three days in a row', 'Study 3 days without a break'], streak7: ['Full week', 'A 7-day streak'],
  },
};

export async function studentAchievements(userId: string, locale: Locale = 'ru'): Promise<Achievements> {
  const [days, stats] = await Promise.all([
    db().query<{ d: string }>(
      `SELECT DISTINCT to_char(at AT TIME ZONE 'Asia/Almaty', 'YYYY-MM-DD') AS d FROM (
         SELECT submitted_at AS at FROM submissions WHERE student_id = $1 AND submitted_at IS NOT NULL
         UNION ALL SELECT last_at FROM topic_views WHERE user_id = $1
         UNION ALL SELECT first_at FROM topic_views WHERE user_id = $1) x
       WHERE at > now() - interval '120 days'`, [userId]),
    db().query<{ submitted: number; full: number; topics: number; tables: number; exams: number }>(
      `SELECT
         count(*) FILTER (WHERE s.status IN ('submitted', 'graded'))::int AS submitted,
         count(*) FILTER (WHERE s.status = 'graded' AND s.score >= (b.payload->>'points')::numeric AND (b.payload->>'points')::numeric > 0)::int AS full,
         (SELECT count(*)::int FROM topic_views WHERE user_id = $1) AS topics,
         count(*) FILTER (WHERE s.status IN ('submitted', 'graded') AND b.payload->'spec'->>'type' = 'table')::int AS tables,
         (SELECT count(DISTINCT t.id)::int FROM topics t JOIN blocks b2 ON b2.topic_id = t.id
            JOIN submissions s2 ON s2.block_id = b2.id AND s2.student_id = $1 AND s2.status IN ('submitted', 'graded')
            WHERE t.format = 'exam') AS exams
       FROM submissions s JOIN blocks b ON b.id = s.block_id WHERE s.student_id = $1`, [userId]),
  ]);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' });
  const list = days.rows.map((r) => r.d);
  const { current, best } = streakOf(list, today);
  const s = stats.rows[0];
  const text = BADGE_TEXT[locale] ?? BADGE_TEXT.ru;
  const badge = (id: BadgeId, have: number, goal: number): Badge =>
    ({ id, title: text[id][0], hint: text[id][1], earned: have >= goal, progress: Math.min(have, goal), goal });
  return {
    streak: current, bestStreak: best, activeDays: list,
    badges: [
      badge('first', s.submitted, 1),
      badge('ten', s.submitted, 10),
      badge('sniper', s.full, 5),
      badge('explorer', s.topics, 5),
      badge('lab', s.tables, 1),
      badge('exam', s.exams, 1),
      badge('streak3', best, 3),
      badge('streak7', best, 7),
    ],
  };
}

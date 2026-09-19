import { db } from '../db/client';

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

export async function studentAchievements(userId: string): Promise<Achievements> {
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
  const badge = (id: string, title: string, hint: string, have: number, goal: number): Badge =>
    ({ id, title, hint, earned: have >= goal, progress: Math.min(have, goal), goal });
  return {
    streak: current, bestStreak: best, activeDays: list,
    badges: [
      badge('first', 'Первый шаг', 'Сдать первое задание', s.submitted, 1),
      badge('ten', 'Десятка', 'Сдать 10 заданий', s.submitted, 10),
      badge('sniper', 'Снайпер', '5 заданий на полный балл', s.full, 5),
      badge('explorer', 'Исследователь', 'Открыть 5 тем', s.topics, 5),
      badge('lab', 'Экспериментатор', 'Сдать таблицу измерений', s.tables, 1),
      badge('exam', 'Выдержка', 'Написать контрольную', s.exams, 1),
      badge('streak3', 'Три дня подряд', 'Заниматься 3 дня без перерыва', best, 3),
      badge('streak7', 'Неделя', 'Серия из 7 дней', best, 7),
    ],
  };
}

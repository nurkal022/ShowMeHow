import { db } from './db/client';
import type { AuthUser } from './auth/users';

export const TRIAL_LIMIT = 10;

export interface QuotaStatus {
  limit: number | null;    // null — без ограничения (админ)
  used: number;
  remaining: number | null;
}

export const QUOTA_EXHAUSTED_MESSAGE =
  `Лимит пробной версии исчерпан: использовано ${TRIAL_LIMIT} из ${TRIAL_LIMIT} генераций. ` +
  'Доработка уже созданных симуляций по-прежнему доступна.';

/**
 * Израсходованное считается по журналу заданий, а не отдельным счётчиком в users:
 * два источника правды рано или поздно разойдутся. Тратят квоту только успешно
 * завершённые генерации — отменённые и упавшие не считаются.
 */
export async function quotaStatus(user: AuthUser): Promise<QuotaStatus> {
  if (user.role === 'admin') {
    return { limit: null, used: 0, remaining: null };
  }
  const { rows } = await db().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM jobs WHERE owner_id = $1 AND status = 'done'", [user.id]);
  const used = Number(rows[0]?.count ?? '0');
  return { limit: TRIAL_LIMIT, used, remaining: Math.max(0, TRIAL_LIMIT - used) };
}

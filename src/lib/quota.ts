import { db } from './db/client';
import type { AuthUser } from './auth/users';
import type { Membership } from './org/types';
import { generationLimit, TRIAL_LIMIT } from './org/policy';

export { TRIAL_LIMIT };

export interface QuotaStatus {
  limit: number | null;    // null — без ограничения (админ)
  used: number;
  remaining: number | null;
}

/** Число берётся из фактического лимита: у учителя он задан организацией. */
export function quotaExhaustedMessage(limit: number, orgLimit: boolean): string {
  const tail = 'Доработка уже созданных симуляций по-прежнему доступна.';
  if (orgLimit) {
    return `Лимит генераций от вашей организации исчерпан: использовано ${limit} из ${limit}. ${tail}`;
  }
  return `Лимит пробной версии исчерпан: использовано ${limit} из ${limit} генераций. ${tail}`;
}

export const QUOTA_EXHAUSTED_MESSAGE = quotaExhaustedMessage(TRIAL_LIMIT, false);

/**
 * Израсходованное считается по журналу заданий, а не отдельным счётчиком в users:
 * два источника правды рано или поздно разойдутся. Тратят квоту только успешно
 * завершённые генерации — отменённые и упавшие не считаются. Доработки квоту не
 * тратят: считаются только задания вида generate. Лимит зависит от
 * членств (см. generationLimit). Членства обязательны: забытый аргумент молча
 * занизил бы лимит учителя до пробного.
 */
export async function quotaStatus(user: AuthUser, memberships: Membership[]): Promise<QuotaStatus> {
  const limit = generationLimit(user, memberships);
  if (limit === null) {
    return { limit: null, used: 0, remaining: null };
  }
  const { rows } = await db().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM jobs
     WHERE owner_id = $1 AND kind = 'generate' AND status = 'done'`, [user.id]);
  const used = Number(rows[0]?.count ?? '0');
  return { limit, used, remaining: Math.max(0, limit - used) };
}

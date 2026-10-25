import { NextResponse } from 'next/server';
import { db } from './db/client';
import type { AuthUser } from './auth/users';
import type { Membership } from './org/types';
import { generationLimit, isPlatformAdmin, TRIAL_LIMIT } from './org/policy';
import { getPlatformSettings } from './platform-settings';

export { TRIAL_LIMIT };

export interface QuotaStatus {
  limit: number | null;    // null — без ограничения (админ)
  used: number;
  remaining: number | null;
  /** Откуда лимит: пробный, от организации или выставлен человеку админом. */
  source: 'trial' | 'org' | 'personal' | 'admin';
}

interface UserLimits { generation_limit: number | null; ai_daily_limit: number | null }

async function personalLimits(userId: string): Promise<UserLimits> {
  const { rows } = await db().query<UserLimits>(
    'SELECT generation_limit, ai_daily_limit FROM users WHERE id = $1', [userId]);
  return rows[0] ?? { generation_limit: null, ai_daily_limit: null };
}

/** Число берётся из фактического лимита: у преподавателя он задан организацией. */
export function quotaExhaustedMessage(limit: number, orgLimit: boolean | QuotaStatus['source']): string {
  const tail = 'Доработка уже созданных симуляций по-прежнему доступна.';
  if (orgLimit === 'personal') {
    return `Ваш лимит генераций исчерпан: использовано ${limit} из ${limit}. ${tail}`;
  }
  if (orgLimit === true || orgLimit === 'org') {
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
 * занизил бы лимит преподавателя до пробного.
 */
export async function quotaStatus(user: AuthUser, memberships: Membership[]): Promise<QuotaStatus> {
  if (isPlatformAdmin(user)) return { limit: null, used: 0, remaining: null, source: 'admin' };
  const [settings, personal] = await Promise.all([getPlatformSettings(), personalLimits(user.id)]);
  const byRole = generationLimit(user, memberships, settings.trialGenerations) ?? 0;
  const source: QuotaStatus['source'] = personal.generation_limit !== null ? 'personal'
    : memberships.some((m) => (m.role === 'teacher' || m.role === 'org_admin') && !m.sandbox) ? 'org' : 'trial';
  const limit = personal.generation_limit ?? byRole;
  const { rows } = await db().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM jobs
     WHERE owner_id = $1 AND kind = 'generate' AND status = 'done'`, [user.id]);
  const used = Number(rows[0]?.count ?? '0');
  return { limit, used, remaining: Math.max(0, limit - used), source };
}

export interface AiAllowance { limit: number | null; used: number }

/** Суточный лимит ИИ-запросов: скользящие 24 часа, без часовых поясов. */
export async function aiAllowance(user: AuthUser): Promise<AiAllowance> {
  if (isPlatformAdmin(user)) return { limit: null, used: 0 };
  const [settings, personal, { rows }] = await Promise.all([
    getPlatformSettings(), personalLimits(user.id),
    db().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ai_usage WHERE user_id = $1 AND created_at > now() - interval '24 hours'`, [user.id]),
  ]);
  return { limit: personal.ai_daily_limit ?? settings.aiDailyLimit, used: Number(rows[0]?.count ?? '0') };
}

export function aiLimitMessage(limit: number): string {
  return `Лимит ИИ-запросов на сутки исчерпан: использовано ${limit} из ${limit}. Попробуйте завтра или попросите администратора увеличить лимит.`;
}

/**
 * Списывает один ИИ-запрос или отвечает 429, если сутки уже выбраны. Пишется до вызова модели:
 * упавший запрос тоже тратит деньги, а повтор по кругу — ровно то, от чего лимит защищает.
 */
export async function chargeAi(user: AuthUser, kind: string): Promise<NextResponse | null> {
  const { limit, used } = await aiAllowance(user);
  if (limit !== null && used >= limit) {
    return NextResponse.json({ error: aiLimitMessage(limit) }, { status: 429 });
  }
  await db().query('INSERT INTO ai_usage (user_id, kind) VALUES ($1, $2)', [user.id, kind]);
  return null;
}

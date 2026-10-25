import { db, hasDb } from './db/client';

/** Настройки платформы, которые админ меняет без доступа к серверу. Без базы — значения по умолчанию. */
export interface PlatformSettings {
  /** Можно ли завести аккаунт самому. Закрыта — аккаунты выдают организации и админ. */
  registrationOpen: boolean;
  /** Сколько тренажёров может создать человек без организации (пробный доступ). */
  trialGenerations: number;
  /** ИИ-запросов за сутки на человека: доработки, план, помощники. */
  aiDailyLimit: number;
}

export const REGISTRATION_CLOSED_MESSAGE = 'Регистрация закрыта. Аккаунт выдаёт ваш университет или администратор платформы.';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = { registrationOpen: true, trialGenerations: 1, aiDailyLimit: 40 };

export const LIMIT_KEYS = ['trialGenerations', 'aiDailyLimit'] as const;
export type LimitKey = typeof LIMIT_KEYS[number];

const count = (v: unknown, def: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : def);

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (!hasDb()) return DEFAULT_PLATFORM_SETTINGS;
  const { rows } = await db().query<{ key: string; value: unknown }>('SELECT key, value FROM platform_settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    registrationOpen: map.get('registrationOpen') !== false,
    trialGenerations: count(map.get('trialGenerations'), DEFAULT_PLATFORM_SETTINGS.trialGenerations),
    aiDailyLimit: count(map.get('aiDailyLimit'), DEFAULT_PLATFORM_SETTINGS.aiDailyLimit),
  };
}

export async function setPlatformLimit(key: LimitKey, value: number): Promise<void> {
  await db().query(
    `INSERT INTO platform_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(value)]);
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await db().query(
    `INSERT INTO platform_settings (key, value) VALUES ('registrationOpen', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(open)]);
}

export interface UsageRow { orgName: string; generations: number; tokens: number; people: number }

/**
 * Расход за 30 дней по организациям: генерации и токены модели. Человек в нескольких
 * организациях считается в первой по алфавиту; без организации — строка «Частные».
 */
export async function usageByOrg(days = 30): Promise<UsageRow[]> {
  const { rows } = await db().query<{ org: string | null; generations: number; tokens: string; people: number }>(
    `WITH home AS (
       SELECT DISTINCT ON (m.user_id) m.user_id, o.name FROM memberships m JOIN organizations o ON o.id = m.org_id
       ORDER BY m.user_id, o.name
     ), recent AS (
       SELECT j.id, j.owner_id, j.kind, j.status FROM jobs j WHERE j.created_at > now() - make_interval(days => $1)
     )
     SELECT h.name AS org,
       count(DISTINCT r.id) FILTER (WHERE r.kind = 'generate' AND r.status = 'done')::int AS generations,
       coalesce(sum((e.event->>'promptTokens')::bigint + (e.event->>'completionTokens')::bigint), 0)::text AS tokens,
       count(DISTINCT r.owner_id)::int AS people
     FROM recent r
     LEFT JOIN home h ON h.user_id = r.owner_id
     LEFT JOIN job_events e ON e.job_id = r.id AND e.event->>'type' = 'usage'
     GROUP BY h.name ORDER BY tokens DESC`, [days]);
  return rows.map((r) => ({ orgName: r.org ?? 'Частные пользователи', generations: r.generations, tokens: Number(r.tokens), people: r.people }));
}

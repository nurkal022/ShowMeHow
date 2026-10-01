import { db } from '../db/client';
import { decryptSecret, encryptSecret } from './secret';
import { ResearchError } from './store';
import { createZenodoClient } from './zenodo';

/**
 * Внешние сервисы автора. Zenodo подключается личным токеном: запись публикуется
 * от имени автора и попадает в его профиль (и ORCID), а не в аккаунт платформы.
 * Токен наружу не отдаётся никогда — даже самому автору; в базе он зашифрован.
 */

export interface ZenodoSettings { connected: boolean; sandbox: boolean; name?: string }

interface Row { secret: string; settings: { sandbox?: boolean; name?: string } | null }

/** Шифротекст привязан к пользователю: строку из чужой записи не расшифровать как свою. */
const aad = (userId: string) => `zenodo:${userId}`;

async function row(userId: string): Promise<Row | null> {
  const { rows } = await db().query<Row>(
    "SELECT secret, settings FROM research_integrations WHERE user_id = $1 AND provider = 'zenodo'", [userId]);
  return rows[0] ?? null;
}

export async function getZenodoSettings(userId: string): Promise<ZenodoSettings> {
  const r = await row(userId);
  if (!r) return { connected: false, sandbox: false };
  return { connected: true, sandbox: !!r.settings?.sandbox, ...(r.settings?.name ? { name: r.settings.name } : {}) };
}

/** Сначала пробуем токен на Zenodo: сохранять заведомо негодный — значит узнать об этом в момент публикации. */
export async function saveZenodoToken(
  userId: string, token: string, sandbox: boolean, fetchImpl?: typeof fetch,
): Promise<ZenodoSettings> {
  const t = token.trim();
  if (!t || t.length > 500 || /\s/.test(t)) throw new ResearchError('Вставьте персональный токен Zenodo целиком.');
  await createZenodoClient({ token: t, sandbox, fetch: fetchImpl }).check();
  const settings = { sandbox, connectedAt: new Date().toISOString() };
  await db().query(
    `INSERT INTO research_integrations (user_id, provider, secret, settings, updated_at) VALUES ($1, 'zenodo', $2, $3, now())
     ON CONFLICT (user_id, provider) DO UPDATE SET secret = EXCLUDED.secret, settings = EXCLUDED.settings, updated_at = now()`,
    [userId, encryptSecret(t, aad(userId)), JSON.stringify(settings)]);
  return getZenodoSettings(userId);
}

export async function removeZenodo(userId: string): Promise<void> {
  await db().query("DELETE FROM research_integrations WHERE user_id = $1 AND provider = 'zenodo'", [userId]);
}

/** Только для сервера: токен и сервер для клиента Zenodo. null — не подключён. */
export async function getZenodoToken(userId: string): Promise<{ token: string; sandbox: boolean } | null> {
  const r = await row(userId);
  if (!r) return null;
  try {
    return { token: decryptSecret(r.secret, aad(userId)), sandbox: !!r.settings?.sandbox };
  } catch {
    throw new ResearchError('Сохранённый токен Zenodo не читается (сменился ключ шифрования) — подключите Zenodo заново.');
  }
}

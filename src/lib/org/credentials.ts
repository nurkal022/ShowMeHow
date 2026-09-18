import { db } from '../db/client';

/**
 * Лист паролей. Временный пароль ученика хранится в открытом виде, пока ученик
 * его не сменил, и не дольше 30 дней: без почты другой доставки нет (спецификация §4).
 * Строку удаляют updatePassword и setTemporaryPassword (src/lib/auth/users.ts).
 */

export const CREDENTIAL_TTL_DAYS = 30;

export async function savePendingCredential(userId: string, password: string): Promise<void> {
  await db().query(
    `INSERT INTO pending_credentials (user_id, password) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password, created_at = now()`,
    [userId, password]);
}

export async function purgeExpiredCredentials(): Promise<number> {
  const r = await db().query(
    'DELETE FROM pending_credentials WHERE created_at <= now() - make_interval(days => $1)',
    [CREDENTIAL_TTL_DAYS]);
  return r.rowCount ?? 0;
}

export interface CredentialCard {
  userId: string;
  displayName: string;
  login: string;
  /** null — ученик уже сменил пароль или строка устарела. */
  password: string | null;
}

export async function listGroupCredentials(groupId: string): Promise<CredentialCard[]> {
  await purgeExpiredCredentials();
  const { rows } = await db().query<{
    id: string; display_name: string | null; login: string; password: string | null;
  }>(
    `SELECT u.id, u.display_name, u.login, pc.password
     FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
     JOIN users u ON u.id = gm.user_id
     JOIN memberships m ON m.user_id = u.id AND m.org_id = g.org_id AND m.role = 'student'
     LEFT JOIN pending_credentials pc ON pc.user_id = u.id
     WHERE gm.group_id = $1 AND u.disabled_at IS NULL AND u.login IS NOT NULL
     ORDER BY u.display_name NULLS LAST, u.login`, [groupId]);
  return rows.map((r) => ({
    userId: r.id, displayName: r.display_name ?? r.login, login: r.login, password: r.password,
  }));
}

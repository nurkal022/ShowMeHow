import { closeDb, db } from '../src/lib/db/client';
import { createUser, findUserByIdentifier, updatePassword, updateProfile } from '../src/lib/auth/users';
import { setPlatformRole } from '../src/lib/admin/users';

/**
 * Заводит или обновляет администратора платформы:
 * `npx tsx scripts/grant-admin.ts <почта> <пароль> [имя]`.
 *
 * Аккаунт есть — ему ставится пароль и роль admin; нет — создаётся.
 * Роль платформы иначе выдаётся только по списку почт в коде, а для показов
 * нужен отдельный супер-админ, не трогающий личный аккаунт владельца.
 */
export async function grantAdmin(
  email: string, password: string, name: string | null, print: (line: string) => void,
): Promise<void> {
  if (!email || !password) throw new Error('Нужны почта и пароль: grant-admin.ts <почта> <пароль> [имя]');
  const found = await findUserByIdentifier(email);
  const user = found ?? await createUser(email, password);
  if (found) await updatePassword(user.id, password);
  if (name) await updateProfile(user.id, { displayName: name });
  await db().query('UPDATE users SET disabled_at = NULL, must_change_password = false WHERE id = $1', [user.id]);
  await setPlatformRole(user.id, 'admin');
  print(`${found ? 'Обновлён' : 'Создан'} администратор платформы: ${email}`);
}

if (process.argv[1]?.endsWith('grant-admin.ts')) {
  const [email, password, ...rest] = process.argv.slice(2);
  grantAdmin(email, password, rest.join(' ') || null, (line) => console.log(line))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
    .finally(() => closeDb());
}

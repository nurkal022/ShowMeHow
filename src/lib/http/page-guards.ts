import { notFound } from 'next/navigation';
import { requirePageUser } from '../auth/page-guard';
import type { AuthUser } from '../auth/users';
import { isPlatformAdmin } from '../org/policy';

/** Страницы /admin: не вошёл — на вход, не админ — 404, временный пароль — null. */
export async function requireAdminPage(next: string): Promise<AuthUser | null> {
  const user = await requirePageUser(next);
  if (!user) return null;
  if (!isPlatformAdmin(user)) notFound();
  return user;
}

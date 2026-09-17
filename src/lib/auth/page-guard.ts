import { redirect } from 'next/navigation';
import { currentUserFromCookies, currentUserAllowingPasswordChangeFromCookies } from './session';
import type { AuthUser } from './users';

/**
 * Общий вход для защищённых серверных страниц. middleware проверяет только
 * наличие cookie (Edge, без базы) — протухшую сессию (запись в БД уже нет)
 * оно пропускает, и без этой проверки страница отрисовалась бы, а её API-запросы
 * вернули бы 401. Здесь — настоящая проверка через базу.
 *
 * Возвращает пользователя, если сессия жива и пароль не временный. Если пароля
 * нет вовсе — редиректит на /login?next=…  Если пароль временный — возвращает
 * null и НЕ редиректит: корневой layout сам подменит страницу формой смены
 * пароля (currentUserAllowingPasswordChangeFromCookies там же), а редирект отсюда
 * увёл бы на /login и зациклил бы пользователя между layout и страницей.
 */
export async function requirePageUser(next: string): Promise<AuthUser | null> {
  const user = await currentUserFromCookies();
  if (user) return user;
  const allowing = await currentUserAllowingPasswordChangeFromCookies();
  if (allowing) return null;
  redirect(`/login?next=${encodeURIComponent(next)}`);
}

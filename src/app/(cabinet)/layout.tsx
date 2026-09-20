import '../cabinet.css';
import '../cabinet-flows.css';
import '../cabinet-home.css';
import SiteChrome from '@/components/SiteChrome';
import Shell from '@/components/cabinet/Shell';
import { currentUserFromCookies } from '@/lib/auth/session';
import { listMemberships } from '@/lib/org/access';
import { buildCabinetMenu } from '@/lib/cabinet/menu';

/**
 * Кабинеты (/admin, /org, /teach) — отдельная рамка вместо шапки сайта.
 * Права здесь не проверяются: это делает каждая страница (чужому — 404).
 * Оболочка лишь решает, какие пункты меню показать. Тому, у кого нет ни одного
 * кабинета, рисуем обычный сайт — его 404 не должен выглядеть как админка.
 */
export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();
  const menu = user ? buildCabinetMenu(user, await listMemberships(user.id)) : null;
  if (!user || !menu || menu.groups.length === 0) return <SiteChrome>{children}</SiteChrome>;
  return <Shell user={user} menu={menu}>{children}</Shell>;
}

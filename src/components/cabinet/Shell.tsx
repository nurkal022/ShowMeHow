import type { AuthUser } from '@/lib/auth/users';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { SIDEBAR_KEY, type CabinetMenu } from '@/lib/cabinet/menu';
import { listSwitchTargets } from '@/lib/admin/switch';
import ShellFrame from './ShellFrame';

/** Скрипт до отрисовки: свёрнутая панель не должна «схлопываться» на глазах. */
const SIDEBAR_BOOT_SCRIPT = `(function(){try{
if(localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==='collapsed')
document.documentElement.setAttribute('data-cab-sidebar','collapsed');
}catch(e){}})()`;

/**
 * Оболочка кабинетов: тёмная боковая панель, верхняя полоса и серое поле под
 * содержимое. Сервер считает меню по правам, рамку и состояние держит клиент.
 */
export default async function Shell({ user, menu, children }: {
  user: AuthUser; menu: CabinetMenu; children: React.ReactNode;
}) {
  const switchTargets = user.role === 'admin' ? await listSwitchTargets() : [];
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT_SCRIPT }} />
      <ShellFrame menu={menu} switchTargets={switchTargets}
        user={{ name: userLabel(user), contact: userContact(user), platformAdmin: user.role === 'admin' }}>
        {children}
      </ShellFrame>
    </>
  );
}

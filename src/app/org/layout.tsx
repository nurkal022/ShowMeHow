import { Suspense } from 'react';
import CabinetNav, { type CabinetNavItem } from '@/components/cabinet/CabinetNav';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listMemberships } from '@/lib/org/access';
import { isPlatformAdmin } from '@/lib/org/policy';

export const metadata = { title: 'Организация — Tesseract' };

const ITEMS: CabinetNavItem[] = [
  { href: '/org', label: 'Обзор', exact: true },
  { href: '/org/teachers', label: 'Учителя' },
  { href: '/org/groups', label: 'Группы' },
  { href: '/org/settings', label: 'Настройки' },
];

/**
 * Права проверяет каждая страница. Учитель группы заходит только в карточку
 * своей группы и лист паролей, поэтому меню кабинета ему не показываем.
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser('/org');
  if (!user) return null;
  const showNav = isPlatformAdmin(user)
    || (await listMemberships(user.id)).some((m) => m.role === 'org_admin');
  return (
    <div className="cabinet">
      {showNav && <Suspense><CabinetNav items={ITEMS} /></Suspense>}
      {children}
    </div>
  );
}

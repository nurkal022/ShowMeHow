import { Suspense } from 'react';
import CabinetNav, { type CabinetNavItem } from '@/components/cabinet/CabinetNav';
import { requireAdminPage } from '@/lib/http/page-guards';

export const metadata = { title: 'Админка — Tesseract' };

const ITEMS: CabinetNavItem[] = [
  { href: '/admin', label: 'Обзор', exact: true },
  { href: '/admin/orgs', label: 'Организации' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/catalog', label: 'Каталог' },
  { href: '/admin/log', label: 'Журнал' },
];

/** Каждая страница проверяет права сама; layout лишь не рисует меню чужим. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage('/admin');
  if (!user) return null;
  return (
    <div className="cabinet">
      <Suspense><CabinetNav items={ITEMS} /></Suspense>
      {children}
    </div>
  );
}

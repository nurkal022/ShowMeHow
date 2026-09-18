import { requireAdminPage } from '@/lib/http/page-guards';

export const metadata = { title: 'Админка — Tesseract' };

/** Каждая страница проверяет права сама; меню рисует оболочка кабинетов. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage('/admin');
  if (!user) return null;
  return <div className="cabinet">{children}</div>;
}

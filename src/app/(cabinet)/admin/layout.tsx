import { requireAdminPage } from '@/lib/http/page-guards';
import { getT } from '@/i18n/server';
import { admin } from '@/i18n/messages/admin';

export async function generateMetadata() {
  const t = await getT(admin);
  return { title: `${t('metaTitle')} — Tesseract` };
}

/** Каждая страница проверяет права сама; меню рисует оболочка кабинетов. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage('/admin');
  if (!user) return null;
  return <div className="cabinet">{children}</div>;
}

import { requirePageUser } from '@/lib/auth/page-guard';
import { getT } from '@/i18n/server';
import { org } from '@/i18n/messages/org';

export async function generateMetadata() {
  const t = await getT(org);
  return { title: `${t('metaTitle')} — Tesseract` };
}

/**
 * Права проверяет каждая страница. Учитель группы заходит только в карточку
 * своей группы и лист паролей — раздела «Организация» в его меню нет.
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser('/org');
  if (!user) return null;
  return <div className="cabinet">{children}</div>;
}

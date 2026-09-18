import { requirePageUser } from '@/lib/auth/page-guard';

export const metadata = { title: 'Организация — Tesseract' };

/**
 * Права проверяет каждая страница. Учитель группы заходит только в карточку
 * своей группы и лист паролей — раздела «Организация» в его меню нет.
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser('/org');
  if (!user) return null;
  return <div className="cabinet">{children}</div>;
}

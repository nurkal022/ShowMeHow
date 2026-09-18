import { requirePageUser } from '@/lib/auth/page-guard';

export const metadata = { title: 'Преподавание — Tesseract' };

export default async function TeachLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser('/teach');
  if (!user) return null;
  return <div className="cabinet">{children}</div>;
}

import { requirePageUser } from '@/lib/auth/page-guard';
import '../../learn.css';
import '../../learn-course.css';
import '../../learn-home.css';
import '../../learn-mistakes.css';

export const metadata = { title: 'Курсы — Tesseract' };

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  // Вход проверяется один раз на весь раздел; временный пароль — layout подменит страницу.
  const user = await requirePageUser('/learn');
  if (!user) return null;
  return <>{children}</>;
}

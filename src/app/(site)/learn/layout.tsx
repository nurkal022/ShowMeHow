import { requirePageUser } from '@/lib/auth/page-guard';
import '../../learn.css';
import '../../learn-course.css';
import '../../learn-home.css';
import '../../learn-mistakes.css';
import { getT } from '@/i18n/server';
import { learnHome } from '@/i18n/messages/learn-home';

export async function generateMetadata() {
  const t = await getT(learnHome);
  return { title: t('metaTitle') };
}

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  // Вход проверяется один раз на весь раздел; временный пароль — layout подменит страницу.
  const user = await requirePageUser('/learn');
  if (!user) return null;
  return <>{children}</>;
}

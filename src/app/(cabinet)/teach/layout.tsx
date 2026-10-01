import { requirePageUser } from '@/lib/auth/page-guard';
import { getT } from '@/i18n/server';
import { teachHome } from '@/i18n/messages/teach-home';

export async function generateMetadata() {
  const t = await getT(teachHome);
  return { title: t('metaTitle') };
}

export default async function TeachLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser('/teach');
  if (!user) return null;
  return <div className="cabinet">{children}</div>;
}

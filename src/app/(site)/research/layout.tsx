import '../../research.css';
import '../../research-article.css';
import '../../research-data.css';
import '../../research-theme.css';
import ResearchFonts from '@/components/research/ResearchFonts';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getT } from '@/i18n/server';
import { researchHub } from '@/i18n/messages/research-hub';

export async function generateMetadata() {
  const t = await getT(researchHub);
  return { title: t('metaTitle') };
}

export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser('/research');
  if (!user) return null;
  return <><ResearchFonts />{children}</>;
}

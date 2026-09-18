import { requirePageUser } from '@/lib/auth/page-guard';
import LibraryView from '@/components/LibraryView';

export default async function LibraryPage() {
  const user = await requirePageUser('/library');
  // Временный пароль — layout уже подменяет страницу формой смены.
  if (!user) return null;
  return <LibraryView />;
}

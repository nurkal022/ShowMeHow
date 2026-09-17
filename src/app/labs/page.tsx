import { currentUserFromCookies } from '@/lib/auth/session';
import { LABS } from '@/lib/labs';
import LabsView from '@/components/labs/LabsView';

export const metadata = { title: 'Лаборатории — Tesseract' };

// Список лабораторий открыт без входа — см. middleware.ts (isPublicPath):
// сцены и так открыты для очков VR, и список ничего личного не раскрывает.
export default async function LabsPage() {
  const user = await currentUserFromCookies();
  return <LabsView labs={LABS} isGuest={!user} />;
}

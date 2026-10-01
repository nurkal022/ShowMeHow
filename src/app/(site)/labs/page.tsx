import { currentUserFromCookies } from '@/lib/auth/session';
import { LABS } from '@/lib/labs';
import LabsView from '@/components/labs/LabsView';
import { getT } from '@/i18n/server';
import { app } from '@/i18n/messages/app';

export async function generateMetadata() {
  return { title: (await getT(app))('labsMeta') };
}

// Список лабораторий открыт без входа — см. middleware.ts (isPublicPath):
// сцены и так открыты для очков VR, и список ничего личного не раскрывает.
export default async function LabsPage() {
  const user = await currentUserFromCookies();
  return <LabsView labs={LABS} isGuest={!user} />;
}

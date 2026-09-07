import { redirect } from 'next/navigation';
import { currentUserFromCookies } from '@/lib/auth/session';
import { LABS } from '@/lib/labs';
import LabsView from '@/components/labs/LabsView';

export const metadata = { title: 'Лаборатории — Tesseract' };

export default async function LabsPage() {
  const user = await currentUserFromCookies();
  if (!user) redirect('/login?next=%2Flabs');
  return <LabsView labs={LABS} />;
}

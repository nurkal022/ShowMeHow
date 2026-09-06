import { redirect } from 'next/navigation';
import { getRenderableArtifact } from '@/lib/storage';
import { currentUserFromCookies } from '@/lib/auth/session';
import { IconBack } from '@/components/icons';

export default async function Present({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromCookies();
  if (!user) redirect('/login');
  const { id } = await params;
  let html: string | null;
  try {
    html = await getRenderableArtifact(user.id, id);
  } catch {
    html = null;
  }
  if (html === null) return <p style={{ padding: 20 }}>Симуляция не найдена.</p>;
  return (
    <>
      <iframe
        sandbox="allow-scripts"
        srcDoc={html}
        title="Презентация"
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none', zIndex: 40 }}
      />
      <a className="present-exit" href="/library"><IconBack size={17} />Выйти</a>
    </>
  );
}

import { getRenderableArtifact } from '@/lib/storage';
import { requirePageUser } from '@/lib/auth/page-guard';
import { IconBack } from '@/components/icons';

export default async function Present({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/present/${id}`);
  // Временный пароль — layout уже подменяет страницу формой смены.
  if (!user) return null;
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

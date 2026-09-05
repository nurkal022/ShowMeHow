import { getRenderableArtifact } from '@/lib/storage';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

export default async function Present({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let html: string | null;
  try {
    html = await getRenderableArtifact(TEMP_OWNER_ID, id);
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
      <a className="present-exit" href="/library">← Выйти</a>
    </>
  );
}

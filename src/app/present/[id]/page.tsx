import { getRenderableArtifact, getSharedArtifact } from '@/lib/storage';
import { requirePageUser } from '@/lib/auth/page-guard';
import { canView } from '@/lib/lms/access';
import { IconBack } from '@/components/icons';

export default async function Present({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/present/${id}`);
  // Временный пароль — layout уже подменяет страницу формой смены.
  if (!user) return null;
  let html: string | null = null;
  let own = false;
  try {
    html = await getRenderableArtifact(user.id, id);
    own = html !== null;
    // Тренажёр из курса или каталога открывается «На весь экран» и не владельцу.
    if (html === null && await canView(user, id)) html = (await getSharedArtifact(id))?.html ?? null;
  } catch {
    html = null;
  }
  if (html === null) {
    return <p style={{ padding: 20 }}>Симуляция не найдена. Возможно, автор её удалил.</p>;
  }
  return (
    <>
      <iframe
        sandbox="allow-scripts"
        srcDoc={html}
        title="Презентация"
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none', zIndex: 40 }}
      />
      <a className="present-exit" href={own ? '/library' : '/learn'}><IconBack size={17} />Выйти</a>
    </>
  );
}

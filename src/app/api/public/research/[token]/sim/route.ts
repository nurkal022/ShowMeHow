import { getRenderableArtifact } from '@/lib/storage';
import { publicView } from '@/lib/research/store';
import { localeFromRequest } from '@/i18n/config';
import { localizeMessage } from '@/i18n/catalog';

type P = { params: Promise<{ token: string }> };

/**
 * Тренажёр из опубликованного материала или проекта — открыто, по токену.
 * Отдаём только симуляцию, привязанную к этому публичному материалу: сам токен
 * не открывает остальную библиотеку автора.
 */
export async function GET(req: Request, { params }: P) {
  const { token } = await params;
  const view = await publicView(token);
  const itemId = new URL(req.url).searchParams.get('item');
  const item = view?.items.find((i) => i.kind === 'sim' && (view.kind === 'item' || i.id === itemId));
  const simId = (item?.doc as { simulationId?: string } | undefined)?.simulationId;
  const html = view && simId ? await getRenderableArtifact(view.ownerId, simId).catch(() => null) : null;
  if (!html) return new Response(localizeMessage('Не найдено', localeFromRequest(req)), { status: 404 });
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
      'Content-Security-Policy': 'sandbox allow-scripts',
    },
  });
}

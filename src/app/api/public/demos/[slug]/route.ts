import { listBundledDemos } from '@/lib/demos';
import { instrument } from '@/lib/artifact';

type P = { params: Promise<{ slug: string }> };

/**
 * Встроенные примеры — открыто, без входа: их показывает лендинг гостям.
 * Это собственные демо платформы, чужих симуляций здесь нет.
 */
export async function GET(_req: Request, { params }: P) {
  const { slug } = await params;
  const demo = listBundledDemos().find((d) => d.slug === slug);
  if (!demo) return new Response('Не найдено', { status: 404 });
  return new Response(instrument(demo.html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      // Страница живёт только внутри iframe с sandbox: своих прав у неё нет.
      'Content-Security-Policy': 'sandbox allow-scripts',
    },
  });
}

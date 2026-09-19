import { bundledThumbnail } from '@/lib/demos';

type P = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: P) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return new Response('Не найдено', { status: 404 });
  const png = bundledThumbnail(slug);
  if (!png) return new Response('Не найдено', { status: 404 });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
}

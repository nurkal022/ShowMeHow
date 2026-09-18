import { guardUser } from '@/lib/http/guards';
import { notFound, type IdParams } from '@/lib/http/route-kit';
import { getAsset } from '@/lib/lms/assets';

/** Картинка урока. Адрес неугадываем, но без входа не отдаётся. */
export async function GET(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const asset = await getAsset((await params).id);
  if (!asset) return notFound();
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      'Content-Type': asset.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, notFound, withUserErrors } from '@/lib/http/route-kit';
import { listMemberships } from '@/lib/org/access';
import { ASSET_MAX_BYTES, saveAsset } from '@/lib/lms/assets';

/** Загрузка картинки для урока: только тем, кто преподаёт или администрирует. Тело — сам файл. */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const staff = user.role === 'admin' || (await listMemberships(user.id)).some((m) => m.role !== 'student');
  if (!staff) return notFound();
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > ASSET_MAX_BYTES) return badRequest('Картинка больше 4 МБ — уменьшите её и попробуйте снова.');
  return withUserErrors(async () => {
    const id = await saveAsset(user.id, Buffer.from(await req.arrayBuffer()));
    return NextResponse.json({ src: `/api/lms/assets/${id}` }, { status: 201 });
  });
}

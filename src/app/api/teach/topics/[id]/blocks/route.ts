import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, notFound, readBody, type IdParams } from '@/lib/http/route-kit';
import { staffTopic } from '@/lib/lms/access';
import { createBlock } from '@/lib/lms/blocks';
import { isBlockKind } from '@/lib/lms/block-schema';

/** «Добавить блок»: блок создаётся с содержимым по умолчанию, дальше — «Изменить». */
export async function POST(req: Request, { params }: IdParams) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  const staff = await staffTopic(user, id);
  if (!staff) return notFound();
  const kind = (await readBody(req))?.kind;
  if (!isBlockKind(kind)) return badRequest('Тип блока — текст, тренажёр, лаборатория или задание.');
  return NextResponse.json({ block: await createBlock(staff.topic.id, kind) }, { status: 201 });
}

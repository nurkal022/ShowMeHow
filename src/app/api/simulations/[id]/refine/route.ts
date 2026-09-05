import { NextResponse } from 'next/server';
import { makeCtx, refineExisting } from '@/lib/pipeline/run';
import { getArtifact } from '@/lib/storage';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const { instruction } = await req.json();
  // Чужая и несуществующая симуляции дают 404, как во всех остальных роутах;
  // 500 остаётся только за настоящими сбоями пайплайна.
  if ((await getArtifact(user.id, id)) === null) {
    return NextResponse.json({ error: 'Симуляция не найдена.' }, { status: 404 });
  }
  // Доработка квоту не тратит и ограничителю параллелизма не подчиняется:
  // это правка уже созданной симуляции, а не новая генерация.
  try {
    await refineExisting(makeCtx(() => {}), user.id, id, instruction);
    return NextResponse.json({ html: await getArtifact(user.id, id) });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) },
      { status: 500 });
  }
}

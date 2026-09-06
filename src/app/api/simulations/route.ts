import { NextResponse } from 'next/server';
import { listSimulations } from '@/lib/storage';
import { ensureDemosForUser } from '@/lib/demos';
import { currentUserFromRequest } from '@/lib/auth/session';
import { unauthorized } from '@/lib/auth/guard';

export async function GET(req: Request) {
  const user = await currentUserFromRequest(req);
  if (!user) return unauthorized();
  // Библиотека не должна встречать пустотой и кнопкой «установить»: примеры
  // раскладываются сами при первом обращении. Сбой установки не должен ронять
  // выдачу — тогда пользователь просто увидит свои симуляции без примеров.
  try {
    await ensureDemosForUser(user.id);
  } catch (e) {
    console.error('не удалось разложить примеры:', e);
  }
  return NextResponse.json(await listSimulations(user.id));
}

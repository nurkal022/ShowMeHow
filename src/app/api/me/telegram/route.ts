import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { connectUrl, revokeTelegram } from '@/lib/telegram/community';

/** «Подключить Telegram» из профиля: одноразовая ссылка в бота на 15 минут. */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const url = await connectUrl(user.id);
  if (!url) return NextResponse.json({ error: 'Telegram-бот не настроен.' }, { status: 503 });
  return NextResponse.json({ url });
}

export async function DELETE(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  await revokeTelegram(user.id, 'self');
  return NextResponse.json({ ok: true });
}

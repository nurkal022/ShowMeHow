import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { logAdminAction } from '@/lib/admin/actions';
import { escapeHtml } from '@/lib/telegram/api';
import { postToTopic } from '@/lib/telegram/group';
import { revokeTelegram } from '@/lib/telegram/community';

const MAX_ANNOUNCE = 3500; // у Telegram предел 4096 символов на сообщение

/** Действия админа над сообществом: анонс в группу и отключение человека. */
export async function POST(req: Request) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  switch (body.action) {
    case 'announce': {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return badRequest('Напишите текст анонса.');
      if (text.length > MAX_ANNOUNCE) return badRequest(`Анонс длиннее ${MAX_ANNOUNCE} символов.`);
      const ok = await postToTopic('announce', escapeHtml(text));
      if (!ok) return badRequest('Группа не настроена: напишите /setup в группе.');
      await logAdminAction(admin.id, 'community.announce', text.slice(0, 80));
      return NextResponse.json({ ok: true });
    }
    case 'revoke': {
      if (typeof body.userId !== 'string') return badRequest('Не указан пользователь.');
      await revokeTelegram(body.userId, 'admin');
      await logAdminAction(admin.id, 'community.revoke', body.userId);
      return NextResponse.json({ ok: true });
    }
    default:
      return badRequest('Неизвестное действие.');
  }
}

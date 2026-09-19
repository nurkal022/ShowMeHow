import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { readBody } from '@/lib/http/route-kit';
import { listNotifications, markRead } from '@/lib/notifications';

export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  return NextResponse.json(await listNotifications(user.id));
}

/** { ids } — прочитать эти; без ids — все. */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 100) : undefined;
  await markRead(user.id, ids);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody } from '@/lib/http/route-kit';
import { siteFromHeaders } from '@/lib/http/site';
import { throttled } from '@/lib/http/throttle';
import { loadTarget, preview, publishTarget, withZenodoErrors, type TargetKind } from '@/lib/research/zenodo-publish';
import { localeFromRequest } from '@/i18n/config';

const isTarget = (v: unknown): v is TargetKind => v === 'item' || v === 'project';
const site = (req: Request) => siteFromHeaders((n) => req.headers.get(n));

/** Предпросмотр для формы: какие файлы уйдут, SVG рисунков для PNG и значения по умолчанию. */
export async function GET(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const q = new URL(req.url).searchParams;
  const target = q.get('target');
  const id = q.get('id') ?? '';
  if (!isTarget(target)) return badRequest(INVALID_BODY_MESSAGE);
  return withZenodoErrors(async () => {
    const t = await loadTarget(user.id, target, id, site(req), localeFromRequest(req));
    return t ? NextResponse.json(preview(t, user.displayName?.trim() ?? '')) : notFound();
  });
}

/**
 * Публикация в Zenodo. Необратима: без confirm === true не делаем ничего —
 * случайный запрос не должен оставить вечную запись от имени автора.
 */
export async function POST(req: Request) {
  const user = await guardUser(req);
  if (user instanceof Response) return user;
  const body = await readBody(req);
  if (!body || !isTarget(body.target) || typeof body.id !== 'string') return badRequest(INVALID_BODY_MESSAGE);
  if (body.confirm !== true) return badRequest('Подтвердите, что понимаете: запись в Zenodo нельзя удалить.');
  const { target, id } = body;
  return throttled(user.id, 'zenodo', () => withZenodoErrors(async () => {
    const t = await loadTarget(user.id, target, id, site(req));
    if (!t) return notFound();
    return NextResponse.json({ zenodo: await publishTarget(user.id, t, body) });
  }));
}

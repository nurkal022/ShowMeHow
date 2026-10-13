import { NextResponse } from 'next/server';
import { badRequest, INVALID_BODY_MESSAGE, readBody } from '@/lib/http/route-kit';
import { SESSION_COOKIE, readCookie, resolveSessionDetails } from '@/lib/auth/session';
import { startImpersonation, stopImpersonation } from '@/lib/auth/impersonation';
import { sandboxOf, sandboxPerson } from '@/lib/demo/access';
import { ensureSandbox } from '@/lib/demo/sandbox';
import { withOrgParam } from '@/lib/lms/links';

/**
 * Демо-режим: { view: 'create' | 'org' | 'teacher' | 'student' }.
 * create — завести личный демо-университет; org — вернуться в свой аккаунт (руководство);
 * teacher/student — посмотреть глазами преподавателя или студента своей песочницы.
 */
export async function POST(req: Request) {
  const details = await resolveSessionDetails(readCookie(req, SESSION_COOKIE));
  if (!details) return NextResponse.json({ error: 'Войдите в аккаунт.' }, { status: 401 });
  const owner = details.impersonator ?? details.user;
  const body = await readBody(req);
  const view = body?.view;
  if (view !== 'create' && view !== 'org' && view !== 'teacher' && view !== 'student') return badRequest(INVALID_BODY_MESSAGE);

  if (view === 'create') {
    if (details.impersonator) return badRequest('Сначала вернитесь в свой аккаунт.');
    const box = await ensureSandbox(owner);
    return NextResponse.json({ ok: true, next: withOrgParam('/org', box.slug) });
  }
  const box = await sandboxOf(owner.id);
  if (!box) return NextResponse.json({ error: 'Демо-университет ещё не создан.' }, { status: 404 });
  if (view === 'org') {
    if (!details.impersonator) return NextResponse.json({ ok: true, next: withOrgParam('/org', box.slug) });
    return stopImpersonation(req);
  }
  const target = await sandboxPerson(box.orgId, view);
  if (!target) return NextResponse.json({ error: 'В демо-университете нет такой роли.' }, { status: 404 });
  return startImpersonation(req, owner, target, box.slug);
}

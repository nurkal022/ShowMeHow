import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody, withUserErrors } from '@/lib/http/route-kit';
import { parsePersonInput } from '@/lib/org/person-input';
import { provisionMember } from '@/lib/org/people';

type P = { params: Promise<{ slug: string }> };

/** «Добавить учителя»: существующий по почте — членством, новый — с временным паролем. */
export async function POST(req: Request, { params }: P) {
  const { slug } = await params;
  const g = await guardOrg(req, slug, ['org_admin']);
  if (g instanceof Response) return g;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const person = parsePersonInput(body);
  if ('error' in person) return badRequest(person.error);
  return withUserErrors(async () => {
    const r = await provisionMember(g.membership.orgId, 'teacher', person);
    return NextResponse.json({ label: r.label, tempPassword: r.tempPassword, created: r.created }, { status: 201 });
  });
}

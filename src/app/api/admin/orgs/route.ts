import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, readBody, withUserErrors } from '@/lib/http/route-kit';
import { parsePersonInput } from '@/lib/org/person-input';
import { provisionMember } from '@/lib/org/people';
import { createOrganization } from '@/lib/org/orgs';
import { findUserByIdentifier } from '@/lib/auth/users';
import { logAdminAction } from '@/lib/admin/actions';
import { OrgError } from '@/lib/org/types';

/** Создание организации вместе с первым администратором (спецификация §3). */
export async function POST(req: Request) {
  const admin = await guardAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const person = parsePersonInput(body.admin);
  if ('error' in person) return badRequest(person.error);
  return withUserErrors(async () => {
    // Логин первого админа проверяем до создания организации: отказ не должен оставлять пустую школу.
    if (person.kind === 'login' && await findUserByIdentifier(person.login)) {
      throw new OrgError(`Логин «${person.login}» уже занят. Укажите другой.`);
    }
    const org = await createOrganization({
      name: typeof body.name === 'string' ? body.name : '',
      kind: typeof body.kind === 'string' ? body.kind : '',
      slug: typeof body.slug === 'string' ? body.slug : '',
    });
    const first = await provisionMember(org.id, 'org_admin', person);
    await logAdminAction(admin.id, 'org.create', org.slug, { name: org.name, admin: first.label });
    return NextResponse.json({
      org: { id: org.id, slug: org.slug, name: org.name },
      admin: { label: first.label, tempPassword: first.tempPassword, created: first.created },
    }, { status: 201 });
  });
}

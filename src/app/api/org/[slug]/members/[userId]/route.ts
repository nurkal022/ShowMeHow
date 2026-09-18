import { NextResponse } from 'next/server';
import { guardOrg } from '@/lib/http/guards';
import { badRequest, INVALID_BODY_MESSAGE, notFound, readBody, withUserErrors } from '@/lib/http/route-kit';
import { canManageGroup, isPlatformAdmin } from '@/lib/org/access';
import { getOrgPerson, isExclusiveMember, removeMember } from '@/lib/org/people';
import { getGroup, isStudentInGroup, moveStudent } from '@/lib/org/groups';
import { savePendingCredential } from '@/lib/org/credentials';
import { disableUser, enableUser, setTemporaryPassword } from '@/lib/auth/users';
import { generateTempPassword } from '@/lib/auth/temp-password';
import { userLabel } from '@/lib/auth/identifier';
import { OrgError } from '@/lib/org/types';

type P = { params: Promise<{ slug: string; userId: string }> };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Действия над учителем или учеником. Админ организации — всё, кроме действий
 * над администраторами; учитель группы — только сброс пароля ученику своей группы.
 */
export async function POST(req: Request, { params }: P) {
  const { slug, userId } = await params;
  const g = await guardOrg(req, slug, ['teacher']);
  if (g instanceof Response) return g;
  const { user, membership } = g;
  const body = await readBody(req);
  if (!body) return badRequest(INVALID_BODY_MESSAGE);
  const target = await getOrgPerson(membership.orgId, userId);
  if (!target) return notFound();
  const action = body.action;
  const groupId = str(body.groupId);

  if (membership.role !== 'org_admin') {
    const group = groupId ? await getGroup(groupId) : null;
    const allowed = action === 'reset-password' && target.role === 'student' && group !== null
      && group.orgId === membership.orgId && await canManageGroup(user, group.id)
      && await isStudentInGroup(group.id, target.userId);
    if (!allowed) return notFound();
  } else if (target.role === 'org_admin' || target.userId === user.id) {
    return badRequest('Действия над администраторами организации доступны только администратору платформы.');
  }

  return withUserErrors(async () => {
    if (action !== 'move' && !isPlatformAdmin(user) && !(await isExclusiveMember(membership.orgId, target.userId))) {
      throw new OrgError('Этот человек состоит и в других организациях или администрирует платформу — '
        + 'это действие доступно только администратору платформы.');
    }
    switch (action) {
      case 'reset-password': {
        const password = generateTempPassword();
        await setTemporaryPassword(target.userId, password);
        // Ученику новый пароль попадает в лист; учителю — только на экран.
        if (target.role === 'student') await savePendingCredential(target.userId, password);
        return NextResponse.json({ ok: true, password, label: userLabel(target) });
      }
      case 'disable':
        await disableUser(target.userId);
        return NextResponse.json({ ok: true });
      case 'enable':
        await enableUser(target.userId);
        return NextResponse.json({ ok: true });
      case 'remove': {
        if (target.role !== 'teacher') {
          throw new OrgError('Убрать из организации можно только учителя. Учеников блокируют.');
        }
        const { reassignedCourses } = await removeMember(membership.orgId, target.userId, user.id);
        return NextResponse.json({ ok: true, reassignedCourses });
      }
      case 'move': {
        if (target.role !== 'student') throw new OrgError('Переводить между группами можно только учеников.');
        const from = await getGroup(groupId);
        const to = await getGroup(str(body.toGroupId));
        if (!from || !to || from.orgId !== membership.orgId || to.orgId !== membership.orgId) {
          throw new OrgError('Группа не найдена.');
        }
        await moveStudent(target.userId, from.id, to.id);
        return NextResponse.json({ ok: true });
      }
      default:
        throw new OrgError('Неизвестное действие.');
    }
  });
}

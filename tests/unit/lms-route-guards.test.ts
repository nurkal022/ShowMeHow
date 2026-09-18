import { describe, it, expect, vi } from 'vitest';
import type { AuthUser } from '@/lib/auth/users';
import { firstParam } from '@/lib/http/params';
import { POST as adminCreateOrg } from '@/app/api/admin/orgs/route';
import { PATCH as adminPatchOrg } from '@/app/api/admin/orgs/[id]/route';
import { POST as adminUserAction } from '@/app/api/admin/users/[id]/route';
import { PATCH as adminCatalog } from '@/app/api/admin/catalog/[id]/route';
import { PATCH as orgSettings } from '@/app/api/org/[slug]/settings/route';
import { POST as orgTeachers } from '@/app/api/org/[slug]/teachers/route';
import { POST as orgGroups } from '@/app/api/org/[slug]/groups/route';
import { PATCH as orgGroupPatch, DELETE as orgGroupDelete } from '@/app/api/org/[slug]/groups/[groupId]/route';
import { PUT as orgGroupTeachers } from '@/app/api/org/[slug]/groups/[groupId]/teachers/route';
import { POST as orgGroupStudents } from '@/app/api/org/[slug]/groups/[groupId]/students/route';
import { POST as orgMember } from '@/app/api/org/[slug]/members/[userId]/route';
import { POST as teachCourses } from '@/app/api/teach/courses/route';
import { PATCH as teachCourse } from '@/app/api/teach/courses/[id]/route';
import { POST as teachTopics } from '@/app/api/teach/courses/[id]/topics/route';
import { GET as teachJournal } from '@/app/api/teach/courses/[id]/journal/route';
import { PATCH as teachTopic, DELETE as teachTopicDelete } from '@/app/api/teach/topics/[id]/route';
import { POST as teachBlocks } from '@/app/api/teach/topics/[id]/blocks/route';
import { PATCH as teachBlock, DELETE as teachBlockDelete } from '@/app/api/teach/blocks/[id]/route';
import { POST as teachBlockSim } from '@/app/api/teach/blocks/[id]/simulation/route';
import { POST as teachRecalc } from '@/app/api/teach/blocks/[id]/recalculate/route';
import { PATCH as teachSubmission } from '@/app/api/teach/submissions/[id]/route';
import { GET as teachSims } from '@/app/api/teach/simulations/route';

// Роуты вызываются без базы: отказ «не вошёл» и «не админ» случается до первого запроса.
const session = vi.hoisted(() => ({ current: null as AuthUser | null }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  currentUserFromRequest: async () => session.current,
  currentUserFromCookies: async () => session.current,
}));

const ID = '11111111-1111-1111-1111-111111111111';
const USER: AuthUser = {
  id: ID, email: 'u@example.com', login: null, displayName: null, role: 'user', mustChangePassword: false };
const idParams = () => ({ params: Promise.resolve({ id: ID }) });
const req = (method = 'POST') => new Request('http://t', { method, body: '{}' });

type Call = [string, () => Promise<Response>];
const ADMIN_CALLS: Call[] = [
  ['POST /api/admin/orgs', () => adminCreateOrg(req())],
  ['PATCH /api/admin/orgs/[id]', () => adminPatchOrg(req('PATCH'), idParams())],
  ['POST /api/admin/users/[id]', () => adminUserAction(req(), idParams())],
  ['PATCH /api/admin/catalog/[id]', () => adminCatalog(req('PATCH'), idParams())],
];

describe('роуты админки', () => {
  for (const [name, call] of ADMIN_CALLS) {
    it(`${name}: без входа 401, не админу 404`, async () => {
      session.current = null;
      expect((await call()).status).toBe(401);
      session.current = USER;
      const res = await call();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Не найдено.' });
    });
  }
});

const slug = () => ({ params: Promise.resolve({ slug: 'sch12' }) });
const group = () => ({ params: Promise.resolve({ slug: 'sch12', groupId: ID }) });
const member = () => ({ params: Promise.resolve({ slug: 'sch12', userId: ID }) });

const ANON_CALLS: Call[] = [
  ['PATCH /api/org/[slug]/settings', () => orgSettings(req('PATCH'), slug())],
  ['POST /api/org/[slug]/teachers', () => orgTeachers(req(), slug())],
  ['POST /api/org/[slug]/groups', () => orgGroups(req(), slug())],
  ['PATCH /api/org/[slug]/groups/[groupId]', () => orgGroupPatch(req('PATCH'), group())],
  ['DELETE /api/org/[slug]/groups/[groupId]', () => orgGroupDelete(req('DELETE'), group())],
  ['PUT /api/org/[slug]/groups/[groupId]/teachers', () => orgGroupTeachers(req('PUT'), group())],
  ['POST /api/org/[slug]/groups/[groupId]/students', () => orgGroupStudents(req(), group())],
  ['POST /api/org/[slug]/members/[userId]', () => orgMember(req(), member())],
  ['POST /api/teach/courses', () => teachCourses(req())],
  ['PATCH /api/teach/courses/[id]', () => teachCourse(req('PATCH'), idParams())],
  ['POST /api/teach/courses/[id]/topics', () => teachTopics(req(), idParams())],
  ['GET /api/teach/courses/[id]/journal', () => teachJournal(new Request('http://t'), idParams())],
  ['PATCH /api/teach/topics/[id]', () => teachTopic(req('PATCH'), idParams())],
  ['DELETE /api/teach/topics/[id]', () => teachTopicDelete(req('DELETE'), idParams())],
  ['POST /api/teach/topics/[id]/blocks', () => teachBlocks(req(), idParams())],
  ['PATCH /api/teach/blocks/[id]', () => teachBlock(req('PATCH'), idParams())],
  ['DELETE /api/teach/blocks/[id]', () => teachBlockDelete(req('DELETE'), idParams())],
  ['POST /api/teach/blocks/[id]/simulation', () => teachBlockSim(req(), idParams())],
  ['POST /api/teach/blocks/[id]/recalculate', () => teachRecalc(req(), idParams())],
  ['PATCH /api/teach/submissions/[id]', () => teachSubmission(req('PATCH'), idParams())],
  ['GET /api/teach/simulations', () => teachSims(new Request('http://t/api/teach/simulations'))],
];

describe('роуты кабинетов без входа', () => {
  for (const [name, call] of ANON_CALLS) {
    it(`${name}: 401`, async () => {
      session.current = null;
      expect((await call()).status).toBe(401);
    });
  }
});

describe('параметры адреса', () => {
  it('firstParam', () => {
    expect(firstParam('a')).toBe('a');
    expect(firstParam(['b', 'c'])).toBe('b');
    expect(firstParam(undefined)).toBeUndefined();
  });
});

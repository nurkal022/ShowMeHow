import { describe, it, expect, vi } from 'vitest';
import type { AuthUser } from '@/lib/auth/users';
import { firstParam } from '@/lib/http/params';
import { POST as adminCreateOrg } from '@/app/api/admin/orgs/route';
import { PATCH as adminPatchOrg } from '@/app/api/admin/orgs/[id]/route';
import { POST as adminUserAction } from '@/app/api/admin/users/[id]/route';
import { PATCH as adminCatalog } from '@/app/api/admin/catalog/[id]/route';

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

describe('параметры адреса', () => {
  it('firstParam', () => {
    expect(firstParam('a')).toBe('a');
    expect(firstParam(['b', 'c'])).toBe('b');
    expect(firstParam(undefined)).toBeUndefined();
  });
});

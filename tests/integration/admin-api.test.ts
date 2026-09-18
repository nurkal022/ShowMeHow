import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, findUserByIdentifier, type AuthUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { findOrgBySlug } from '@/lib/org/orgs';
import { orgRoleOf } from '@/lib/org/access';
import { listAdminActions } from '@/lib/admin/actions';
import { POST as createOrg } from '@/app/api/admin/orgs/route';
import { PATCH as patchOrg } from '@/app/api/admin/orgs/[id]/route';
import { POST as userAction } from '@/app/api/admin/users/[id]/route';
import { PATCH as catalog } from '@/app/api/admin/catalog/[id]/route';

const SCHEMA = 'admin_api_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

function call(cookie: string, body: unknown, method = 'POST'): Request {
  return new Request('http://t', {
    method, headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!pool)('API админки', () => {
  let admin: AuthUser;
  let adminCookie: string;
  let plainCookie: string;

  beforeEach(async () => {
    await pool!.query('TRUNCATE organizations, users, admin_actions CASCADE');
    process.env.SHOWMEHOW_ADMIN_EMAIL = 'boss@example.com';
    admin = await createUser('boss@example.com', 'пароль123');
    delete process.env.SHOWMEHOW_ADMIN_EMAIL;
    adminCookie = `${SESSION_COOKIE}=${await createSession(admin.id)}`;
    const plain = await createUser('plain@example.com', 'пароль123');
    plainCookie = `${SESSION_COOKIE}=${await createSession(plain.id)}`;
  });

  it('создаёт школу с новым админом по логину и пишет журнал', async () => {
    const res = await createOrg(call(adminCookie, {
      name: 'Школа №12', kind: 'school', slug: 'sch12',
      admin: { login: 'director.sch12', displayName: 'Директор' },
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.admin).toMatchObject({ label: 'Директор', created: true });
    expect(body.admin.tempPassword).toMatch(/-/);
    const org = (await findOrgBySlug('sch12'))!;
    const director = (await findUserByIdentifier('director.sch12'))!;
    expect(director.mustChangePassword).toBe(true);
    expect(await orgRoleOf(director.id, org.id)).toBe('org_admin');
    const [entry] = await listAdminActions();
    expect(entry).toMatchObject({ action: 'org.create', target: 'sch12' });
  });

  it('существующий по почте становится админом без пароля', async () => {
    await createUser('director@example.com', 'пароль123');
    const res = await createOrg(call(adminCookie, {
      name: 'Колледж', kind: 'college', slug: 'col7', admin: { email: 'director@example.com' } }));
    expect(res.status).toBe(201);
    expect((await res.json()).admin).toEqual({ label: 'director@example.com', tempPassword: null, created: false });
  });

  it('отказы не оставляют пустых организаций', async () => {
    await createUser('taken@example.com', 'пароль123');
    await pool!.query("UPDATE users SET login = 'taken.login' WHERE email = 'taken@example.com'");
    const cases = [
      { name: 'Школа', kind: 'school', slug: 'Плохой слаг', admin: { email: 'a@b.cd' } },
      { name: 'Школа', kind: 'school', slug: 'sch1', admin: {} },
      { name: 'Школа', kind: 'school', slug: 'sch2', admin: { login: 'taken.login', displayName: 'Имя' } },
      { name: '', kind: 'school', slug: 'sch3', admin: { email: 'a@b.cd' } },
    ];
    for (const body of cases) {
      const res = await createOrg(call(adminCookie, body));
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe('string');
    }
    const { rows } = await pool!.query('SELECT 1 FROM organizations');
    expect(rows).toHaveLength(0);
    expect((await createOrg(call(plainCookie, cases[0]))).status).toBe(404);
  });

  it('архив, настройки, действия над пользователем', async () => {
    const created = await (await createOrg(call(adminCookie, {
      name: 'Школа', kind: 'school', slug: 'sch12', admin: { email: 'd@example.com' } }))).json();
    const orgId = created.org.id;
    const patched = await patchOrg(call(adminCookie, { archived: true, settings: { studentsCanGenerate: true } }, 'PATCH'),
      params(orgId));
    expect(patched.status).toBe(200);
    const pb = await patchOrg(call(adminCookie, {}, 'PATCH'), params(orgId));
    expect((await pb.json()).settings.studentsCanGenerate).toBe(true);
    expect((await patchOrg(call(adminCookie, {}, 'PATCH'), params(crypto.randomUUID()))).status).toBe(404);

    const target = (await findUserByIdentifier('d@example.com'))!;
    const reset = await userAction(call(adminCookie, { action: 'reset-password' }), params(target.id));
    expect((await reset.json()).password).toMatch(/-/);
    expect((await userAction(call(adminCookie, { action: 'disable' }), params(target.id))).status).toBe(200);
    expect((await userAction(call(adminCookie, { action: 'enable' }), params(target.id))).status).toBe(200);
    expect((await userAction(call(adminCookie, { action: 'make-admin' }), params(target.id))).status).toBe(200);
    expect((await findUserByIdentifier('d@example.com'))!.role).toBe('admin');
    const self = await userAction(call(adminCookie, { action: 'revoke-admin' }), params(admin.id));
    expect(self.status).toBe(400);
    expect((await self.json()).error).toBe('Нельзя снять права администратора с самого себя.');
    expect((await userAction(call(adminCookie, { action: 'disable' }), params(admin.id))).status).toBe(400);
    expect((await userAction(call(adminCookie, { action: 'fly' }), params(target.id))).status).toBe(400);
    expect((await userAction(call(adminCookie, { action: 'enable' }), params(crypto.randomUUID()))).status).toBe(404);
    expect((await listAdminActions()).map((a) => a.action)).toEqual([
      'user.make_admin', 'user.enable', 'user.disable', 'user.reset_password', 'org.settings', 'org.archive', 'org.create',
    ]);
  });

  it('флажок каталога', async () => {
    const simId = crypto.randomUUID();
    await pool!.query(
      `INSERT INTO simulations (id, owner_id, title, prompt, subject, created_at, updated_at)
       VALUES ($1, $2, 'Маятник', 'п', 'Физика', now(), now())`, [simId, admin.id]);
    expect((await catalog(call(adminCookie, { catalog: true }, 'PATCH'), params(simId))).status).toBe(200);
    const { rows } = await pool!.query<{ visibility: string }>('SELECT visibility FROM simulations');
    expect(rows[0].visibility).toBe('catalog');
    expect((await catalog(call(adminCookie, { catalog: 'да' }, 'PATCH'), params(simId))).status).toBe(400);
    expect((await catalog(call(adminCookie, { catalog: true }, 'PATCH'), params(crypto.randomUUID()))).status).toBe(404);
    expect((await listAdminActions())[0]).toMatchObject({ action: 'catalog.add', target: 'Маятник' });
  });
});

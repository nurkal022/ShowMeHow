import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import {
  createUser, createLoginUser, disableUser, enableUser, findActiveUserById, setTemporaryPassword, updatePassword,
} from '@/lib/auth/users';
import { logAdminAction, listAdminActions } from '@/lib/admin/actions';
import { adminActionLabel } from '@/lib/admin/labels';
import { searchUsers, getUserCard, setPlatformRole, escapeLike } from '@/lib/admin/users';
import { listAllSimulations, listCatalog, setSimulationVisibility } from '@/lib/admin/catalog';
import { platformOverview } from '@/lib/admin/overview';
import { savePendingCredential, listGroupCredentials, purgeExpiredCredentials } from '@/lib/org/credentials';
import { createOrganization, addMember } from '@/lib/org/orgs';
import { createGroup, addToGroup } from '@/lib/org/groups';

const SCHEMA = 'admin_data_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('TRUNCATE organizations, users, admin_actions, jobs CASCADE');
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe('без базы', () => {
  it('escapeLike экранирует шаблонные символы', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
  it('подписи действий', () => {
    expect(adminActionLabel('org.create')).toBe('создал организацию');
    expect(adminActionLabel('что-то новое')).toBe('что-то новое');
  });
});

describe.skipIf(!pool)('данные админки', () => {
  it('журнал: последние сверху, автор подписан', async () => {
    const a = await createUser('boss@example.com', 'пароль123');
    await logAdminAction(a.id, 'org.create', 'sch12', { name: 'Школа' });
    await logAdminAction(a.id, 'user.disable', 'x@example.com');
    const list = await listAdminActions();
    expect(list.map((r) => r.action)).toEqual(['user.disable', 'org.create']);
    expect(list[1]).toMatchObject({ actorLabel: 'boss@example.com', target: 'sch12', payload: { name: 'Школа' } });
  });

  it('поиск по почте, логину и имени; знак % — не шаблон', async () => {
    await createUser('anna@example.com', 'пароль123');
    await createLoginUser({
      login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false });
    expect((await searchUsers('ANNA')).map((u) => u.email)).toEqual(['anna@example.com']);
    expect((await searchUsers('ivanov')).map((u) => u.login)).toEqual(['ivanov.i.sch12']);
    expect((await searchUsers('Иван')).map((u) => u.displayName)).toEqual(['Иванов Иван']);
    expect(await searchUsers('%')).toEqual([]);
    expect(await searchUsers('')).toHaveLength(2);
  });

  it('карточка: членства и статус; роль платформы; разблокировка', async () => {
    const u = await createUser('t@example.com', 'пароль123');
    const org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    await addMember(org.id, u.id, 'teacher');
    await disableUser(u.id);
    expect(await getUserCard(u.id)).toMatchObject({
      email: 't@example.com', role: 'user', disabled: true,
      memberships: [{ orgId: org.id, orgSlug: 'sch12', orgName: 'Школа №12', role: 'teacher', archived: false }],
    });
    await enableUser(u.id);
    expect(await findActiveUserById(u.id)).not.toBeNull();
    expect(await setPlatformRole(u.id, 'admin')).toBe(true);
    expect((await getUserCard(u.id))?.role).toBe('admin');
    expect(await getUserCard('не-uuid')).toBeNull();
    expect(await setPlatformRole(crypto.randomUUID(), 'admin')).toBe(false);
  });

  it('каталог: флажок и поиск по названию и автору', async () => {
    const u = await createUser('author@example.com', 'пароль123');
    const id = crypto.randomUUID();
    await pool!.query(
      `INSERT INTO simulations (id, owner_id, title, prompt, subject, created_at, updated_at)
       VALUES ($1, $2, 'Маятник', 'п', 'Физика', now(), now())`, [id, u.id]);
    expect(await listCatalog('')).toEqual([]);
    expect((await listAllSimulations('author'))[0]).toMatchObject({
      id, title: 'Маятник', ownerId: u.id, ownerLabel: 'author@example.com', visibility: 'private' });
    expect(await setSimulationVisibility(id, 'catalog')).toBe(true);
    expect((await listCatalog('Маят')).map((s) => s.id)).toEqual([id]);
    expect(await setSimulationVisibility('../evil', 'catalog')).toBe(false);
  });

  it('обзор платформы', async () => {
    const u = await createUser('x@example.com', 'пароль123');
    await createOrganization({ slug: 'sch12', name: 'Школа', kind: 'school' });
    await pool!.query(
      "INSERT INTO jobs (id, owner_id, status, request, kind) VALUES ($1, $2, 'done', '{}'::jsonb, 'generate')",
      [crypto.randomUUID(), u.id]);
    const o = await platformOverview();
    expect(o).toMatchObject({ organizations: 1, users: 1, generations7d: 1 });
    expect(o.queue.queued).toBe(0);
  });
});

describe.skipIf(!pool)('лист паролей', () => {
  it('пароль виден, пока не сменён и не старше 30 дней', async () => {
    const org = await createOrganization({ slug: 'sch12', name: 'Школа', kind: 'school' });
    const group = await createGroup(org.id, '7А');
    const make = async (login: string, name: string) => {
      const u = await createLoginUser({ login, displayName: name, password: 'лиса-дом-семь', mustChangePassword: true });
      await addMember(org.id, u.id, 'student');
      await addToGroup(group.id, u.id);
      await savePendingCredential(u.id, 'лиса-дом-семь');
      return u;
    };
    const a = await make('ivanov.i.sch12', 'Иванов Иван');
    const b = await make('petrova.a.sch12', 'Петрова Анна');
    const c = await make('kim.o.sch12', 'Ким Олег');
    expect((await listGroupCredentials(group.id)).map((x) => [x.login, x.password])).toEqual([
      ['ivanov.i.sch12', 'лиса-дом-семь'],
      ['kim.o.sch12', 'лиса-дом-семь'],
      ['petrova.a.sch12', 'лиса-дом-семь'],
    ]);
    await updatePassword(a.id, 'мой-пароль-123');
    // Новый временный пароль делает старую строку недействительной.
    await setTemporaryPassword(b.id, 'сова-мост-три');
    await pool!.query(
      "UPDATE pending_credentials SET created_at = now() - interval '31 days' WHERE user_id = $1", [c.id]);
    expect((await listGroupCredentials(group.id)).map((x) => x.password)).toEqual([null, null, null]);
    expect(await purgeExpiredCredentials()).toBe(0);
    const { rows } = await pool!.query('SELECT 1 FROM pending_credentials');
    expect(rows).toHaveLength(0);
  });
});

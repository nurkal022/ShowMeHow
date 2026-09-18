import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createLoginUser, findUserByIdentifier } from '@/lib/auth/users';
import { verifyPassword } from '@/lib/auth/password';
import { getCourse, listStudentCourses, listTopics } from '@/lib/lms/courses';
import { listGroupCredentials } from '@/lib/org/credentials';
import { createGroup, findGroupByTitle } from '@/lib/org/groups';
import { addMember, createOrganization, findOrgBySlug } from '@/lib/org/orgs';
import { SEED_COURSE_TITLE, SEED_PASSWORD, seedDemoCourse, seedSchool } from '../../scripts/seed-school';

const SCHEMA = 'seed_school_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('тестовая школа', () => {
  it('заводит всё из спецификации и переживает повторный запуск', async () => {
    const lines: string[] = [];
    await seedSchool((l) => lines.push(l));
    await seedSchool(() => {});

    const admin = (await findUserByIdentifier('admin@local.test'))!;
    expect(admin.role).toBe('admin');
    expect(verifyPassword(SEED_PASSWORD, admin.passwordHash)).toBe(true);
    expect(lines.join('\n')).toContain('director@local.test');
    expect(lines.join('\n')).toContain('ivanov.i.sch12');

    const counts = await pool!.query<{ orgs: number; courses: number; blocks: number; students: number; sims: number }>(
      `SELECT (SELECT count(*)::int FROM organizations) AS orgs,
              (SELECT count(*)::int FROM courses) AS courses,
              (SELECT count(*)::int FROM blocks) AS blocks,
              (SELECT count(*)::int FROM memberships WHERE role = 'student') AS students,
              (SELECT count(*)::int FROM simulations) AS sims`);
    expect(counts.rows[0]).toEqual({ orgs: 1, courses: 1, blocks: 6, students: 3, sims: 1 });

    const kinds = await pool!.query<{ kind: string; type: string | null }>(
      `SELECT b.kind, b.payload#>>'{spec,type}' AS type FROM blocks b JOIN topics t ON t.id = b.topic_id
       ORDER BY t.position, b.position`);
    expect(kinds.rows).toEqual([
      { kind: 'text', type: null }, { kind: 'simulation', type: null },
      { kind: 'assignment', type: 'choice' }, { kind: 'assignment', type: 'number' },
      { kind: 'lab', type: null }, { kind: 'assignment', type: 'text' },
    ]);

    const student = (await findUserByIdentifier('ivanov.i.sch12'))!;
    expect(student.mustChangePassword).toBe(true);
    const [card] = await listStudentCourses(student.id);
    expect(card.course).toMatchObject({ title: SEED_COURSE_TITLE, status: 'published' });

    const org = (await findOrgBySlug('sch12'))!;
    const group = (await findGroupByTitle(org.id, '7А'))!;
    const sheet = await listGroupCredentials(group.id);
    expect(sheet).toHaveLength(3);
    expect(sheet.every((c) => c.password !== null)).toBe(true);
    expect(verifyPassword(sheet.find((c) => c.login === 'ivanov.i.sch12')!.password!, student.passwordHash)).toBe(true);
  });

  it('в существующей организации заводит только курс и не дублирует его', async () => {
    const org = await createOrganization({ slug: 'demoschool', name: 'Демо-школа', kind: 'school' });
    const teacher = await createLoginUser({
      login: 'teacher.demoschool', displayName: 'Учитель демо', password: 'нужен-для-записи', mustChangePassword: false,
    });
    await addMember(org.id, teacher.id, 'teacher');
    const group = await createGroup(org.id, '7А');
    const before = await pool!.query<{ users: number }>('SELECT count(*)::int AS users FROM users');

    const lines: string[] = [];
    await seedDemoCourse((l) => lines.push(l), { orgSlug: 'demoschool', teacher: 'teacher.demoschool' });
    await seedDemoCourse(() => {}, { orgSlug: 'demoschool', teacher: 'teacher.demoschool' });

    // Никого не завели и ничьих паролей не показали.
    const after = await pool!.query<{ users: number }>('SELECT count(*)::int AS users FROM users');
    expect(after.rows[0].users).toBe(before.rows[0].users);
    expect(lines.join('\n')).not.toContain(SEED_PASSWORD);

    const courses = await pool!.query<{ id: string; status: string }>(
      'SELECT id, status FROM courses WHERE org_id = $1 AND title = $2', [org.id, SEED_COURSE_TITLE]);
    expect(courses.rowCount).toBe(1);
    expect((await getCourse(courses.rows[0].id))!.status).toBe('published');
    expect(await listTopics(courses.rows[0].id)).toHaveLength(2);

    const opened = await pool!.query<{ group_id: string }>(
      'SELECT group_id FROM course_groups WHERE course_id = $1', [courses.rows[0].id]);
    expect(opened.rows.map((r) => r.group_id)).toEqual([group.id]);

    // Тренажёров у этого учителя и в общем каталоге нет — блок пропущен, задания на месте.
    const kinds = await pool!.query<{ kind: string; type: string | null }>(
      `SELECT b.kind, b.payload#>>'{spec,type}' AS type FROM blocks b JOIN topics t ON t.id = b.topic_id
       WHERE t.course_id = $1 ORDER BY t.position, b.position`, [courses.rows[0].id]);
    expect(kinds.rows).toEqual([
      { kind: 'text', type: null },
      { kind: 'assignment', type: 'choice' }, { kind: 'assignment', type: 'number' },
      { kind: 'lab', type: null }, { kind: 'assignment', type: 'text' },
    ]);
  });

  it('отказывается, когда организации или учителя нет', async () => {
    await expect(seedDemoCourse(() => {}, { orgSlug: 'nosuch', teacher: 'teacher.demoschool' }))
      .rejects.toThrow('не найдена');
    await expect(seedDemoCourse(() => {}, { orgSlug: 'demoschool', teacher: 'ivanov.i.sch12' }))
      .rejects.toThrow('не учитель организации');
  });
});

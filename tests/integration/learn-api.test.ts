import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { addMember, createOrganization } from '@/lib/org/orgs';
import { addToGroup, createGroup } from '@/lib/org/groups';
import { createCourse, createTopic, setCourseGroups, setCourseStatus } from '@/lib/lms/courses';
import { createBlock, setBlockSimulation, updateBlock } from '@/lib/lms/blocks';
import { setSimulationVisibility } from '@/lib/admin/catalog';
import { createSimulation, deleteSimulation, saveThumbnail } from '@/lib/storage';
import { PUT as answer } from '@/app/api/learn/blocks/[id]/answer/route';
import { GET as getSim } from '@/app/api/simulations/[id]/route';
import { GET as getThumb } from '@/app/api/simulations/[id]/thumbnail/route';

const SCHEMA = 'learn_api_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

const cookieOf = async (u: AuthUser) => `${SESSION_COOKIE}=${await createSession(u.id)}`;
function put(cookie: string, body: unknown): Request {
  return new Request('http://t', {
    method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const get = (cookie: string) => new Request('http://t', { headers: { cookie } });
const idP = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!pool)('API ученика и чужие симуляции', () => {
  let teacher: AuthUser;
  let courseId: string;
  let choiceId: string;
  let essayId: string;
  let simId: string;
  let sc: string;
  let outsiderCookie: string;
  let b2cCookie: string;

  beforeEach(async () => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-'));
    await pool!.query('TRUNCATE organizations, users CASCADE');
    const org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    teacher = await createUser('teacher@example.com', 'пароль123');
    await addMember(org.id, teacher.id, 'teacher');
    const student = await createLoginUser({ login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false });
    const outsider = await createLoginUser({ login: 'petrov.p.sch12', displayName: 'Петров Пётр', password: 'пароль123', mustChangePassword: false });
    await addMember(org.id, student.id, 'student');
    await addMember(org.id, outsider.id, 'student');
    const g = await createGroup(org.id, '7А');
    await addToGroup(g.id, student.id);
    const course = await createCourse({ orgId: org.id, ownerId: teacher.id, title: 'Физика 7' });
    courseId = course.id;
    await setCourseGroups(courseId, [g.id], new Set([g.id]));
    const topic = await createTopic(courseId, 'Маятник');
    choiceId = (await createBlock(topic.id, 'assignment')).id;
    await updateBlock(choiceId, { prompt: 'Сколько будет 2 + 2?', points: 10, spec: { type: 'choice', options: [
      { id: 'a', text: '4', correct: true }, { id: 'b', text: '5', correct: false } ] } });
    essayId = (await createBlock(topic.id, 'assignment')).id;
    const sim = await createSimulation(teacher.id, { title: 'Маятник', prompt: 'секретный промпт', subject: 'Физика', tags: [] }, '<html>маятник</html>');
    simId = sim.id;
    await saveThumbnail(teacher.id, simId, Buffer.from('png'));
    await setBlockSimulation((await createBlock(topic.id, 'simulation')).id, simId);
    sc = await cookieOf(student);
    outsiderCookie = await cookieOf(outsider);
    b2cCookie = await cookieOf(await createUser('b2c@example.com', 'пароль123'));
  });

  it('черновик курса и чужой ученик — 404', async () => {
    expect((await answer(put(sc, { answer: { type: 'choice', selected: ['a'] }, submit: true }), idP(choiceId))).status).toBe(404);
    await setCourseStatus(courseId, 'published');
    expect((await answer(put(outsiderCookie, { answer: { type: 'choice', selected: ['a'] }, submit: true }), idP(choiceId))).status).toBe(404);
    expect((await answer(put(sc, { answer: { type: 'text', text: 'x' }, submit: true }), idP('не-uuid'))).status).toBe(404);
  });

  it('сдача: автобалл сразу, правильных ответов в ответе сервера нет', async () => {
    await setCourseStatus(courseId, 'published');
    const res = await answer(put(sc, { answer: { type: 'choice', selected: ['a'] }, submit: true }), idP(choiceId));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('correct');
    expect(JSON.parse(text).submission).toMatchObject({ status: 'graded', score: 10 });
    const again = await answer(put(sc, { answer: { type: 'choice', selected: ['b'] }, submit: true }), idP(choiceId));
    expect(again.status).toBe(400);
  });

  it('черновик, пределы длины и кривое тело', async () => {
    await setCourseStatus(courseId, 'published');
    const draft = await answer(put(sc, { answer: { type: 'text', text: 'черновик' }, submit: false }), idP(essayId));
    expect((await draft.json()).submission).toMatchObject({ status: 'draft', score: null });
    const long = await answer(put(sc, { answer: { type: 'text', text: 'я'.repeat(10001) }, submit: false }), idP(essayId));
    expect(long.status).toBe(400);
    expect((await long.json()).error).toBe('Ответ — не длиннее 10000 символов.');
    expect((await answer(put(sc, { answer: { type: 'text', text: 'x' } }), idP(essayId))).status).toBe(400);
  });

  it('симуляция курса: ученику группы — да, прочим — нет; удалённая — 404', async () => {
    expect((await getSim(get(sc), idP(simId))).status).toBe(404);
    await setCourseStatus(courseId, 'published');
    const shared = await getSim(get(sc), idP(simId));
    expect(shared.status).toBe(200);
    const body = await shared.json();
    expect(body).toMatchObject({ readOnly: true, meta: { id: simId, title: 'Маятник', subject: 'Физика' } });
    expect(body.meta.prompt).toBeUndefined();
    expect(body.html).toContain('маятник');
    expect((await getThumb(get(sc), idP(simId))).status).toBe(200);
    expect((await getSim(get(outsiderCookie), idP(simId))).status).toBe(404);
    expect((await getThumb(get(outsiderCookie), idP(simId))).status).toBe(404);
    const own = await (await getSim(get(await cookieOf(teacher)), idP(simId))).json();
    expect(own.meta.prompt).toBe('секретный промпт');
    expect(own.readOnly).toBeUndefined();

    await deleteSimulation(teacher.id, simId);
    expect((await getSim(get(sc), idP(simId))).status).toBe(404);
  });

  it('симуляция из каталога видна любому вошедшему', async () => {
    expect((await getSim(get(b2cCookie), idP(simId))).status).toBe(404);
    await setSimulationVisibility(simId, 'catalog');
    expect((await getSim(get(b2cCookie), idP(simId))).status).toBe(200);
  });
});

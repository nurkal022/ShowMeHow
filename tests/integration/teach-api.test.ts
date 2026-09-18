import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { addMember, createOrganization, type Organization } from '@/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup, type Group } from '@/lib/org/groups';
import { createSimulation } from '@/lib/storage';
import { setSimulationVisibility } from '@/lib/admin/catalog';
import { getCourse, listCourseGroupIds, listTopics } from '@/lib/lms/courses';
import { getBlock } from '@/lib/lms/blocks';
import { saveAnswer } from '@/lib/lms/submissions';
import { POST as newCourse } from '@/app/api/teach/courses/route';
import { PATCH as patchCourse } from '@/app/api/teach/courses/[id]/route';
import { POST as newTopic } from '@/app/api/teach/courses/[id]/topics/route';
import { GET as journal } from '@/app/api/teach/courses/[id]/journal/route';
import { PATCH as patchTopic, DELETE as deleteTopicRoute } from '@/app/api/teach/topics/[id]/route';
import { POST as newBlock } from '@/app/api/teach/topics/[id]/blocks/route';
import { PATCH as patchBlock, DELETE as deleteBlockRoute } from '@/app/api/teach/blocks/[id]/route';
import { POST as insertSim } from '@/app/api/teach/blocks/[id]/simulation/route';
import { POST as recalc } from '@/app/api/teach/blocks/[id]/recalculate/route';
import { PATCH as grade } from '@/app/api/teach/submissions/[id]/route';
import { GET as picker } from '@/app/api/teach/simulations/route';

const SCHEMA = 'teach_api_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

const cookieOf = async (u: AuthUser) => `${SESSION_COOKIE}=${await createSession(u.id)}`;
function call(cookie: string, body?: unknown, method = 'POST', url = 'http://t'): Request {
  return new Request(url, {
    method, headers: { cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const idP = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => { expect(res.status).toBeLessThan(300); return res.json(); };

const CHOICE = { prompt: 'Сколько будет 2 + 2?', points: 10, spec: { type: 'choice', options: [
  { id: 'a', text: '4', correct: true }, { id: 'b', text: '5', correct: false },
] } };

describe.skipIf(!pool)('API учителя', () => {
  let org: Organization;
  let teacher: AuthUser;
  let student: AuthUser;
  let g7a: Group;
  let g7b: Group;
  let tc: string;
  let otherCookie: string;
  let studentCookie: string;

  beforeEach(async () => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-'));
    await pool!.query('TRUNCATE organizations, users CASCADE');
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    teacher = await createUser('teacher@example.com', 'пароль123');
    const other = await createUser('other@example.com', 'пароль123');
    await addMember(org.id, teacher.id, 'teacher');
    await addMember(org.id, other.id, 'teacher');
    student = await createLoginUser({ login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false });
    await addMember(org.id, student.id, 'student');
    g7a = await createGroup(org.id, '7А');
    g7b = await createGroup(org.id, '7Б');
    await assignTeacher(g7a.id, teacher.id);
    await addToGroup(g7a.id, student.id);
    tc = await cookieOf(teacher);
    otherCookie = await cookieOf(other);
    studentCookie = await cookieOf(student);
  });

  async function scaffold() {
    const { course } = await json(await newCourse(call(tc, { org: 'sch12', title: 'Физика 7', subject: 'Физика' })));
    const { topic } = await json(await newTopic(call(tc, { title: 'Маятник' }), idP(course.id)));
    const { block } = await json(await newBlock(call(tc, { kind: 'assignment' }), idP(topic.id)));
    return { courseId: course.id as string, topicId: topic.id as string, blockId: block.id as string };
  }

  it('курс: создание, чужим и ученику — 404, неизвестная организация — 404', async () => {
    const { courseId, topicId, blockId } = await scaffold();
    expect((await newCourse(call(studentCookie, { org: 'sch12', title: 'X' }))).status).toBe(404);
    expect((await newCourse(call(tc, { org: 'nope', title: 'X' }))).status).toBe(404);
    expect((await newCourse(call(tc, { org: 'sch12', title: '' }))).status).toBe(400);
    for (const cookie of [otherCookie, studentCookie]) {
      expect((await patchCourse(call(cookie, { title: 'X' }, 'PATCH'), idP(courseId))).status).toBe(404);
      expect((await newTopic(call(cookie, { title: 'X' }), idP(courseId))).status).toBe(404);
      expect((await journal(call(cookie, undefined, 'GET'), idP(courseId))).status).toBe(404);
      expect((await patchTopic(call(cookie, { title: 'X' }, 'PATCH'), idP(topicId))).status).toBe(404);
      expect((await newBlock(call(cookie, { kind: 'text' }), idP(topicId))).status).toBe(404);
      expect((await patchBlock(call(cookie, { payload: CHOICE }, 'PATCH'), idP(blockId))).status).toBe(404);
      expect((await deleteBlockRoute(call(cookie, undefined, 'DELETE'), idP(blockId))).status).toBe(404);
      expect((await recalc(call(cookie), idP(blockId))).status).toBe(404);
    }
    expect((await picker(call(studentCookie, undefined, 'GET', 'http://t/api/teach/simulations'))).status).toBe(404);
  });

  it('публикация и группы: своя группа можно, чужая — 400', async () => {
    const { courseId } = await scaffold();
    expect((await patchCourse(call(tc, { groupIds: [g7b.id] }, 'PATCH'), idP(courseId))).status).toBe(400);
    expect((await patchCourse(call(tc, { groupIds: 'все' }, 'PATCH'), idP(courseId))).status).toBe(400);
    const res = await json(await patchCourse(call(tc, { groupIds: [g7a.id], status: 'published', description: 'Механика' }, 'PATCH'), idP(courseId)));
    expect(res.course).toMatchObject({ status: 'published', description: 'Механика' });
    expect(await listCourseGroupIds(courseId)).toEqual([g7a.id]);
    expect((await patchCourse(call(tc, { status: 'hidden' }, 'PATCH'), idP(courseId))).status).toBe(400);
    expect((await getCourse(courseId))?.status).toBe('published');
  });

  it('темы и блоки: перестановка, санация, ревизия, удаление', async () => {
    const { courseId, topicId, blockId } = await scaffold();
    const second = await json(await newTopic(call(tc, { title: 'Свет' }), idP(courseId)));
    expect((await json(await patchTopic(call(tc, { move: 'up' }, 'PATCH'), idP(second.topic.id)))).ok).toBe(true);
    expect((await listTopics(courseId)).map((t) => t.title)).toEqual(['Свет', 'Маятник']);
    expect((await patchTopic(call(tc, { move: 'sideways' }, 'PATCH'), idP(topicId))).status).toBe(400);
    await json(await patchTopic(call(tc, { title: 'Колебания' }, 'PATCH'), idP(topicId)));

    expect((await newBlock(call(tc, { kind: 'video' }), idP(topicId))).status).toBe(400);
    const bad = await patchBlock(call(tc, { payload: { prompt: 'x', spec: { type: 'choice', options: [] } } }, 'PATCH'), idP(blockId));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('Вариантов должно быть от 2 до 10.');
    const saved = await json(await patchBlock(call(tc, { payload: CHOICE }, 'PATCH'), idP(blockId)));
    // Пока ответов нет, правка задания — его составление: ревизия остаётся первой (см. Task 10).
    expect(saved).toMatchObject({ stale: 0, block: { revision: 1 } });

    await patchCourse(call(tc, { groupIds: [g7a.id], status: 'published' }, 'PATCH'), idP(courseId));
    await saveAnswer((await getBlock(blockId))!, student.id, { type: 'choice', selected: ['a'] }, true);
    const flipped = structuredClone(CHOICE);
    flipped.spec.options[0].correct = false;
    flipped.spec.options[1].correct = true;
    const changed = await json(await patchBlock(call(tc, { payload: flipped }, 'PATCH'), idP(blockId)));
    expect(changed.stale).toBe(1);
    expect(await json(await recalc(call(tc), idP(blockId)))).toEqual({ updated: 1 });

    const text = await json(await newBlock(call(tc, { kind: 'text' }), idP(topicId)));
    expect((await recalc(call(tc), idP(text.block.id))).status).toBe(400);
    await json(await patchBlock(call(tc, { move: 'up' }, 'PATCH'), idP(text.block.id)));
    await json(await deleteBlockRoute(call(tc, undefined, 'DELETE'), idP(text.block.id)));
    expect(await getBlock(text.block.id)).toBeNull();
    await json(await deleteTopicRoute(call(tc, undefined, 'DELETE'), idP(topicId)));
    expect((await listTopics(courseId)).map((t) => t.title)).toEqual(['Свет']);
  });

  it('вставка тренажёра: своя и из каталога — да, чужая личная — 404', async () => {
    const { courseId, topicId } = await scaffold();
    const sim = await json(await newBlock(call(tc, { kind: 'simulation' }), idP(topicId)));
    const mine = await createSimulation(teacher.id, { title: 'Маятник', prompt: 'п', subject: 'Физика', tags: [] }, '<html></html>');
    const others = await createSimulation(student.id, { title: 'Чужой', prompt: 'п', subject: 'Физика', tags: [] }, '<html></html>');
    const shared = await createSimulation(student.id, { title: 'Каталог', prompt: 'п', subject: 'Физика', tags: [] }, '<html></html>');
    await setSimulationVisibility(shared.id, 'catalog');
    const ok = await json(await insertSim(call(tc, { simulationId: mine.id }), idP(sim.block.id)));
    expect(ok.href).toBe(`/teach/courses/${courseId}?topic=${topicId}`);
    expect(ok.block.body.payload.simulationId).toBe(mine.id);
    expect((await insertSim(call(tc, { simulationId: shared.id }), idP(sim.block.id))).status).toBe(200);
    expect((await insertSim(call(tc, { simulationId: others.id }), idP(sim.block.id))).status).toBe(404);
    expect((await insertSim(call(otherCookie, { simulationId: mine.id }), idP(sim.block.id))).status).toBe(404);
    // Через правку содержимого чужую личную симуляцию тоже не вставить.
    expect((await patchBlock(call(tc, { payload: { simulationId: others.id, caption: '' } }, 'PATCH'),
      idP(sim.block.id))).status).toBe(404);
    expect((await patchBlock(call(tc, { payload: { simulationId: shared.id, caption: 'Смотрите' } }, 'PATCH'),
      idP(sim.block.id))).status).toBe(200);

    const minePicker = await json(await picker(call(tc, undefined, 'GET', 'http://t/api/teach/simulations?source=mine&q=маят')));
    expect(minePicker.items.map((i: { id: string }) => i.id)).toEqual([mine.id]);
    const catalogPicker = await json(await picker(call(tc, undefined, 'GET', 'http://t/api/teach/simulations?source=catalog')));
    expect(catalogPicker.items).toEqual([{ id: shared.id, title: 'Каталог', subject: 'Физика', ownerLabel: 'Иванов Иван' }]);
  });

  it('оценка через API и журнал CSV', async () => {
    const { courseId, blockId } = await scaffold();
    await json(await patchBlock(call(tc, { payload: { prompt: 'Объясните', points: 5, spec: { type: 'text' } } }, 'PATCH'), idP(blockId)));
    await patchCourse(call(tc, { groupIds: [g7a.id], status: 'published' }, 'PATCH'), idP(courseId));
    const sub = await saveAnswer((await getBlock(blockId))!, student.id, { type: 'text', text: 'Потому что' }, true);
    expect((await grade(call(otherCookie, { action: 'grade', score: 5 }, 'PATCH'), idP(sub.id))).status).toBe(404);
    expect((await grade(call(tc, { action: 'grade', score: 7 }, 'PATCH'), idP(sub.id))).status).toBe(400);
    const graded = await json(await grade(call(tc, { action: 'grade', score: 4, comment: 'Хорошо' }, 'PATCH'), idP(sub.id)));
    expect(graded.submission).toMatchObject({ status: 'graded', score: 4, comment: 'Хорошо' });
    const returned = await json(await grade(call(tc, { action: 'return', comment: 'Дополните' }, 'PATCH'), idP(sub.id)));
    expect(returned.submission.status).toBe('returned');
    expect((await grade(call(tc, { action: 'fly' }, 'PATCH'), idP(sub.id))).status).toBe(400);
    expect((await grade(call(tc, { action: 'grade', score: 1 }, 'PATCH'), idP(crypto.randomUUID()))).status).toBe(404);

    await json(await grade(call(tc, { action: 'grade', score: 5 }, 'PATCH'), idP(sub.id)));
    const csv = await journal(call(tc, undefined, 'GET'), idP(courseId));
    expect(csv.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(csv.headers.get('Content-Disposition')).toContain("filename*=UTF-8''");
    const text = await csv.text();
    expect(text).toContain('Иванов Иван;7А;5;5;5');
  });
});

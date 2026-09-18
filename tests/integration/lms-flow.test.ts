import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import { addMember, createOrganization, type Organization } from '@/lib/org/orgs';
import { addToGroup, createGroup } from '@/lib/org/groups';
import { createCourse, createTopic, setCourseGroups, setCourseStatus } from '@/lib/lms/courses';
import {
  createBlock, deleteBlock, existingSimulationIds, getBlock, listBlocks, listCourseAssignments, moveBlock,
  setBlockSimulation, simulationTitles, staleSubmissionCount, updateBlock, type Block,
} from '@/lib/lms/blocks';
import {
  getOwnSubmission, listBlockAnswers, listOwnSubmissions, listStudentGrades, saveAnswer,
} from '@/lib/lms/submissions';
import { courseJournal, courseProgress, gradeSubmission, recalculateBlock, returnSubmission } from '@/lib/lms/grading';
import { canUseInCourse, canView, staffBlock, studentBlock } from '@/lib/lms/access';
import { toStudentBody } from '@/lib/lms/block-schema';
import { LmsError } from '@/lib/lms/types';

const SCHEMA = 'lms_flow_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

const CHOICE = {
  prompt: 'От чего зависит период?', points: 10, allowRetry: false,
  spec: { type: 'choice', multiple: false, options: [
    { id: 'len', text: 'От длины нити', correct: true },
    { id: 'mass', text: 'От массы', correct: false },
  ] },
};

async function insertSim(ownerId: string, title: string, visibility = 'private'): Promise<string> {
  const id = crypto.randomUUID();
  await pool!.query(
    `INSERT INTO simulations (id, owner_id, title, prompt, subject, visibility, created_at, updated_at)
     VALUES ($1, $2, $3, 'п', 'Физика', $4, now(), now())`, [id, ownerId, title, visibility]);
  return id;
}

describe.skipIf(!pool)('блоки, ответы, проверка', () => {
  let org: Organization;
  let teacher: AuthUser;
  let other: AuthUser;
  let student: AuthUser;
  let outsider: AuthUser;
  let courseId: string;
  let topicId: string;
  let choice: Block;

  beforeEach(async () => {
    await pool!.query('TRUNCATE organizations, users CASCADE');
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    teacher = await createUser('teacher@example.com', 'пароль123');
    other = await createUser('other@example.com', 'пароль123');
    await addMember(org.id, teacher.id, 'teacher');
    await addMember(org.id, other.id, 'teacher');
    student = await createLoginUser({ login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false });
    outsider = await createLoginUser({ login: 'petrov.p.sch12', displayName: 'Петров Пётр', password: 'пароль123', mustChangePassword: false });
    await addMember(org.id, student.id, 'student');
    await addMember(org.id, outsider.id, 'student');
    const g = await createGroup(org.id, '7А');
    await addToGroup(g.id, student.id);
    const course = await createCourse({ orgId: org.id, ownerId: teacher.id, title: 'Физика 7' });
    courseId = course.id;
    await setCourseGroups(courseId, [g.id], new Set([g.id]));
    topicId = (await createTopic(courseId, 'Маятник')).id;
    choice = (await updateBlock((await createBlock(topicId, 'assignment')).id, CHOICE)).block;
  });

  const publish = () => setCourseStatus(courseId, 'published');

  it('блоки: порядок, санация, удаление', async () => {
    const text = await createBlock(topicId, 'text');
    expect((await listBlocks(topicId)).map((b) => b.id)).toEqual([choice.id, text.id]);
    expect(await moveBlock(text.id, 'up')).toBe(true);
    expect((await listBlocks(topicId)).map((b) => b.body.kind)).toEqual(['text', 'assignment']);
    await expect(updateBlock(text.id, { body: 'x'.repeat(20001) })).rejects.toBeInstanceOf(LmsError);
    await deleteBlock(text.id);
    expect(await getBlock(text.id)).toBeNull();
    expect(await listCourseAssignments(courseId)).toEqual([{
      blockId: choice.id, topicId, topicTitle: 'Маятник', title: 'От чего зависит период?', points: 10 }]);
  });

  it('ученик видит блок только опубликованного курса своей группы', async () => {
    expect(await studentBlock(student, choice.id)).toBeNull();
    await publish();
    expect((await studentBlock(student, choice.id))?.block.id).toBe(choice.id);
    expect(await studentBlock(outsider, choice.id)).toBeNull();
    expect((await staffBlock(teacher, choice.id))?.course.id).toBe(courseId);
    expect(await staffBlock(other, choice.id)).toBeNull();
    const safe = JSON.stringify(toStudentBody((await listBlocks(topicId))[0].body));
    expect(safe).not.toContain('correct');
  });

  it('выбор проверяется сразу; повтор без разрешения запрещён', async () => {
    await publish();
    const draft = await saveAnswer(choice, student.id, { type: 'choice', selected: ['mass'] }, false);
    expect(draft).toMatchObject({ status: 'draft', score: null });
    const sub = await saveAnswer(choice, student.id, { type: 'choice', selected: ['len'] }, true);
    expect(sub).toMatchObject({ status: 'graded', autoScore: 10, score: 10, blockRevision: 1 });
    expect(sub.submittedAt).not.toBeNull();
    await expect(saveAnswer(choice, student.id, { type: 'choice', selected: ['mass'] }, true))
      .rejects.toThrow('Ответ уже сдан. Сдать заново можно, если учитель вернёт работу или разрешит повторную сдачу.');
    await expect(saveAnswer(choice, student.id, { type: 'choice', selected: ['mass'] }, false))
      .rejects.toThrow('Черновик нельзя сохранить: ответ уже сдан.');
    await expect(saveAnswer(choice, student.id, { type: 'choice', selected: [] }, true)).rejects.toThrow();
    expect((await listOwnSubmissions(student.id, [choice.id])).get(choice.id)?.id).toBe(sub.id);
  });

  it('пустой ответ не сдаётся; текст ждёт учителя; оценка, возврат, пересдача', async () => {
    await publish();
    const essay = (await updateBlock((await createBlock(topicId, 'assignment')).id,
      { prompt: 'Объясните', points: 5, spec: { type: 'text' } })).block;
    await expect(saveAnswer(essay, student.id, { type: 'text', text: '  ' }, true))
      .rejects.toThrow('Ответ пустой — заполните его перед сдачей.');
    const sub = await saveAnswer(essay, student.id, { type: 'text', text: 'Потому что' }, true);
    expect(sub).toMatchObject({ status: 'submitted', autoScore: null, score: null });
    await expect(gradeSubmission(sub, 5, teacher.id, 6, '')).rejects.toThrow('Балл — число от 0 до 5.');
    const graded = await gradeSubmission(sub, 5, teacher.id, '4,5', 'Хорошо');
    expect(graded).toMatchObject({ status: 'graded', score: 4.5, comment: 'Хорошо', gradedBy: teacher.id });
    const returned = await returnSubmission(graded, teacher.id, 'Добавьте формулу');
    expect(returned).toMatchObject({ status: 'returned', score: null, comment: 'Добавьте формулу' });
    const redraft = await saveAnswer(essay, student.id, { type: 'text', text: 'Потому что T = 2π√(l/g)' }, false);
    expect(redraft.status).toBe('returned');
    const again = await saveAnswer(essay, student.id, { type: 'text', text: 'T = 2π√(l/g)' }, true);
    expect(again).toMatchObject({ status: 'submitted', comment: null, gradedBy: null });

    const draftOnly = await saveAnswer(choice, outsider.id, { type: 'choice', selected: ['len'] }, false);
    await expect(gradeSubmission(draftOnly, 10, teacher.id, 5, null))
      .rejects.toThrow('Черновик нельзя оценить: ученик ещё не сдал ответ.');
  });

  it('разрешённая пересдача перезаписывает ответ и оценку', async () => {
    await publish();
    const retry = (await updateBlock(choice.id, { ...CHOICE, allowRetry: true })).block;
    await saveAnswer(retry, student.id, { type: 'choice', selected: ['mass'] }, true);
    const again = await saveAnswer(retry, student.id, { type: 'choice', selected: ['len'] }, true);
    expect(again).toMatchObject({ status: 'graded', score: 10 });
  });

  it('правка ключа поднимает ревизию, пересчёт не трогает ручные оценки', async () => {
    await publish();
    await saveAnswer(choice, student.id, { type: 'choice', selected: ['len'] }, true);
    const manual = await saveAnswer(choice, outsider.id, { type: 'choice', selected: ['mass'] }, true);
    await gradeSubmission(manual, 10, teacher.id, 3, 'Почти');

    const renamed = await updateBlock(choice.id, { ...CHOICE, prompt: 'Новая формулировка' });
    expect(renamed).toMatchObject({ stale: 0 });
    expect(renamed.block.revision).toBe(1);

    const flipped = structuredClone(CHOICE);
    flipped.spec.options[0].correct = false;
    flipped.spec.options[1].correct = true;
    const changed = await updateBlock(choice.id, flipped);
    expect(changed.block.revision).toBe(2);
    expect(changed.stale).toBe(2);
    expect(await staleSubmissionCount(choice.id)).toBe(2);

    expect(await recalculateBlock(changed.block)).toBe(2);
    expect(await getOwnSubmission(choice.id, student.id)).toMatchObject({ autoScore: 0, score: 0, blockRevision: 2 });
    expect(await getOwnSubmission(choice.id, outsider.id)).toMatchObject({ autoScore: 10, score: 3, blockRevision: 2 });
    expect(await staleSubmissionCount(choice.id)).toBe(0);

    const asText = await updateBlock(choice.id, { ...CHOICE, spec: { type: 'text' } });
    await recalculateBlock(asText.block);
    expect(await getOwnSubmission(choice.id, student.id)).toMatchObject({ status: 'submitted', score: null });
  });

  it('ответы задания, журнал, прогресс и оценки ученика', async () => {
    await publish();
    await saveAnswer(choice, student.id, { type: 'choice', selected: ['len'] }, true);
    const rows = await listBlockAnswers(choice.id, courseId);
    expect(rows.map((r) => [r.student.name, r.submission?.status ?? null])).toEqual([['Иванов Иван', 'graded']]);
    const journal = await courseJournal(courseId);
    expect(journal.rows[0]).toMatchObject({ total: 10, max: 10 });
    expect((await courseProgress(courseId)).rows[0].count).toBe(0);
    expect(await listStudentGrades(student.id)).toEqual([{
      courseId, courseTitle: 'Физика 7', topicId, topicTitle: 'Маятник', blockId: choice.id,
      title: 'От чего зависит период?', points: 10, state: 'graded', score: 10,
    }]);
    expect(await listStudentGrades(outsider.id)).toEqual([]);
  });

  it('симуляции: вставка, существование и canView', async () => {
    const own = await insertSim(teacher.id, 'Маятник');
    const foreign = await insertSim(other.id, 'Чужой');
    const catalog = await insertSim(other.id, 'Каталог', 'catalog');
    expect(await canUseInCourse(teacher.id, own)).toBe(true);
    expect(await canUseInCourse(teacher.id, catalog)).toBe(true);
    expect(await canUseInCourse(teacher.id, foreign)).toBe(false);

    const simBlock = await setBlockSimulation((await createBlock(topicId, 'simulation')).id, own);
    expect(simBlock.body).toMatchObject({ kind: 'simulation', payload: { simulationId: own } });
    await setBlockSimulation(choice.id, foreign);
    await expect(setBlockSimulation((await createBlock(topicId, 'text')).id, own)).rejects.toBeInstanceOf(LmsError);
    expect(await simulationTitles([own, 'не-uuid'])).toEqual(new Map([[own, 'Маятник']]));

    // Черновик курса: ученик симуляцию не видит, владелец и каталог — всегда.
    expect(await canView(student, own)).toBe(false);
    expect(await canView(teacher, own)).toBe(true);
    expect(await canView(outsider, catalog)).toBe(true);
    await publish();
    expect(await canView(student, own)).toBe(true);
    expect(await canView(student, foreign)).toBe(true);   // стенд задания
    expect(await canView(outsider, own)).toBe(false);
    expect(await canView(student, '../evil')).toBe(false);
    expect(await canView({ id: outsider.id, role: 'admin' }, own)).toBe(true);

    await pool!.query('DELETE FROM simulations WHERE id = $1', [own]);
    expect(await existingSimulationIds([own, foreign])).toEqual(new Set([foreign]));
    expect(await canView(student, own)).toBe(false);
  });
});

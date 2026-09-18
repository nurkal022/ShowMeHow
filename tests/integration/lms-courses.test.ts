import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { testDb, resetSchema } from '../db';
import { applyMigrations } from '../../scripts/migrate';
import { closeDb } from '@/lib/db/client';
import { createUser, createLoginUser, type AuthUser } from '@/lib/auth/users';
import { addMember, createOrganization, type Organization } from '@/lib/org/orgs';
import { addToGroup, archiveGroup, assignTeacher, createGroup, type Group } from '@/lib/org/groups';
import { requireOrgRole } from '@/lib/org/access';
import {
  courseStudents, createCourse, createTopic, deleteTopic, getCourse, listCourseGroupIds, listStaffCourses,
  listStudentCourses, listTopics, moveTopic, openedTopicIds, recordTopicView, renameTopic, setCourseGroups,
  setCourseStatus, updateCourse,
} from '@/lib/lms/courses';
import { allowedGroupIds, learnerCourse, staffCourse, staffTopic, studentCourse } from '@/lib/lms/access';

const SCHEMA = 'lms_courses_test';
const pool = testDb(SCHEMA);

beforeAll(async () => {
  if (!pool) return;
  await resetSchema(pool, SCHEMA);
  await applyMigrations(pool);
});
afterAll(async () => { await pool?.end(); await closeDb(); });

describe.skipIf(!pool)('курсы', () => {
  let org: Organization;
  let director: AuthUser;
  let teacher: AuthUser;
  let teacher2: AuthUser;
  let stranger: AuthUser;
  let student: AuthUser;
  let student2: AuthUser;
  let g7a: Group;
  let g7b: Group;

  beforeEach(async () => {
    await pool!.query('TRUNCATE organizations, users CASCADE');
    org = await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
    const col = await createOrganization({ slug: 'col7', name: 'Колледж', kind: 'college' });
    director = await createUser('director@example.com', 'пароль123');
    teacher = await createUser('teacher@example.com', 'пароль123');
    teacher2 = await createUser('teacher2@example.com', 'пароль123');
    stranger = await createUser('stranger@example.com', 'пароль123');
    await addMember(org.id, director.id, 'org_admin');
    await addMember(org.id, teacher.id, 'teacher');
    await addMember(org.id, teacher2.id, 'teacher');
    await addMember(col.id, stranger.id, 'teacher');
    student = await createLoginUser({ login: 'ivanov.i.sch12', displayName: 'Иванов Иван', password: 'пароль123', mustChangePassword: false });
    student2 = await createLoginUser({ login: 'petrova.a.sch12', displayName: 'Петрова Анна', password: 'пароль123', mustChangePassword: false });
    await addMember(org.id, student.id, 'student');
    await addMember(org.id, student2.id, 'student');
    g7a = await createGroup(org.id, '7А');
    g7b = await createGroup(org.id, '7Б');
    await assignTeacher(g7a.id, teacher.id);
    await addToGroup(g7a.id, student.id);
    await addToGroup(g7b.id, student2.id);
  });

  const newCourse = (ownerId = teacher.id) =>
    createCourse({ orgId: org.id, ownerId, title: ' Физика 7 ', subject: 'Физика', description: '' });

  it('создание, правка, статус и пределы', async () => {
    const c = await newCourse();
    expect(c).toMatchObject({ title: 'Физика 7', subject: 'Физика', status: 'draft', ownerId: teacher.id });
    await expect(createCourse({ orgId: org.id, ownerId: teacher.id, title: 'я'.repeat(201) }))
      .rejects.toThrow('Поле «Название» — не длиннее 200 символов.');
    expect((await updateCourse(c.id, { description: 'Механика' }))).toMatchObject({
      title: 'Физика 7', description: 'Механика' });
    await expect(updateCourse(c.id, { title: '' })).rejects.toThrow('Заполните поле «Название».');
    await setCourseStatus(c.id, 'published');
    expect((await getCourse(c.id))?.status).toBe('published');
    expect(await getCourse('x')).toBeNull();
  });

  it('темы: порядок, перестановка, переименование, удаление', async () => {
    const c = await newCourse();
    const t1 = await createTopic(c.id, 'Первая');
    const t2 = await createTopic(c.id, 'Вторая');
    const t3 = await createTopic(c.id, 'Третья');
    expect(await moveTopic(t3.id, 'up')).toBe(true);
    expect((await listTopics(c.id)).map((t) => t.title)).toEqual(['Первая', 'Третья', 'Вторая']);
    expect(await moveTopic(t1.id, 'up')).toBe(false);
    await renameTopic(t2.id, 'Вторая тема');
    await expect(renameTopic(t2.id, ' ')).rejects.toThrow('Заполните поле «Название темы».');
    await deleteTopic(t3.id);
    await createTopic(c.id, 'Четвёртая');
    expect((await listTopics(c.id)).map((t) => t.title)).toEqual(['Первая', 'Вторая тема', 'Четвёртая']);
  });

  it('учитель правит свой курс, админ организации — любой, прочие — нет', async () => {
    const c = await newCourse();
    const t = await createTopic(c.id, 'Тема');
    expect((await staffCourse(teacher, c.id))?.course.id).toBe(c.id);
    expect(await staffCourse(teacher2, c.id)).toBeNull();
    expect((await staffCourse(director, c.id))?.membership.role).toBe('org_admin');
    expect(await staffCourse(stranger, c.id)).toBeNull();
    expect(await staffCourse(student, c.id)).toBeNull();
    expect((await staffTopic(teacher, t.id))?.topic.id).toBe(t.id);
    expect(await staffTopic(teacher2, t.id)).toBeNull();
    expect(await staffTopic(teacher, 'не-uuid')).toBeNull();
  });

  it('группы курса: учитель выбирает только свои и не трогает чужие', async () => {
    const c = await newCourse();
    const tm = (await requireOrgRole(teacher, org.id, ['teacher']))!;
    const dm = (await requireOrgRole(director, org.id, ['org_admin']))!;
    expect(await allowedGroupIds(teacher, tm)).toEqual([g7a.id]);
    expect((await allowedGroupIds(director, dm)).sort()).toEqual([g7a.id, g7b.id].sort());
    await expect(setCourseGroups(c.id, [g7b.id], new Set([g7a.id])))
      .rejects.toThrow('Эту группу нельзя выбрать: её нет среди ваших групп.');
    await setCourseGroups(c.id, [g7a.id, g7b.id], new Set([g7a.id, g7b.id]));
    await setCourseGroups(c.id, [], new Set([g7a.id]));
    expect(await listCourseGroupIds(c.id)).toEqual([g7b.id]);
  });

  it('ученик видит только опубликованный курс своей группы', async () => {
    const c = await newCourse();
    const t1 = await createTopic(c.id, 'Первая');
    await createTopic(c.id, 'Вторая');
    await setCourseGroups(c.id, [g7a.id], new Set([g7a.id]));
    expect(await studentCourse(student, c.id)).toBeNull();
    expect(await listStudentCourses(student.id)).toEqual([]);

    await setCourseStatus(c.id, 'published');
    expect((await studentCourse(student, c.id))?.id).toBe(c.id);
    expect(await studentCourse(student2, c.id)).toBeNull();
    expect(await studentCourse(teacher, c.id)).toBeNull();
    await recordTopicView(t1.id, student.id);
    await recordTopicView(t1.id, student.id);
    expect([...(await openedTopicIds(c.id, student.id))]).toEqual([t1.id]);
    const [card] = await listStudentCourses(student.id);
    expect(card).toMatchObject({ topicsTotal: 2, topicsOpened: 1, assignmentsTotal: 0, assignmentsSubmitted: 0 });
    expect(card.course.id).toBe(c.id);

    expect(await learnerCourse(teacher, c.id, true)).toMatchObject({ preview: true });
    expect(await learnerCourse(student, c.id, true)).toBeNull();
    expect(await learnerCourse(student, c.id, false)).toMatchObject({ preview: false });

    expect(await courseStudents(c.id)).toEqual([{ id: student.id, name: 'Иванов Иван', groups: ['7А'] }]);
    await archiveGroup(g7a.id);
    expect(await studentCourse(student, c.id)).toBeNull();
  });

  it('список курсов: учитель — свои, админ — все курсы организации', async () => {
    const mine = await newCourse();
    await createTopic(mine.id, 'Тема');
    await setCourseGroups(mine.id, [g7a.id], new Set([g7a.id]));
    const theirs = await newCourse(teacher2.id);
    const forTeacher = await listStaffCourses(org.id, teacher.id);
    expect(forTeacher.map((c) => c.id)).toEqual([mine.id]);
    expect(forTeacher[0]).toMatchObject({
      groupTitles: ['7А'], topicCount: 1, ungraded: 0, ownerLabel: 'teacher@example.com' });
    expect((await listStaffCourses(org.id, null)).map((c) => c.id).sort()).toEqual([mine.id, theirs.id].sort());
  });
});

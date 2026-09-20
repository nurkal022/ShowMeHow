import crypto from 'node:crypto';
import { db } from '../db/client';
import { isUuid } from '../org/access';
import type { JournalStudent, ProgressView } from './journal';
import { nextPosition, swapWithNeighbour, TOPICS, type MoveDirection } from './order';
import {
  LIMITS, LmsError, optionalText, requireText, TOPIC_FORMATS, type Course, type CourseStatus, type Topic, type TopicFormat,
} from './types';

/** Курсы, их группы и темы; что видит ученик. Права проверяет src/lib/lms/access.ts. */

const COURSE_COLUMNS = 'c.id, c.org_id, c.owner_id, c.title, c.subject, c.grade, c.description, c.status, c.created_at, c.updated_at';

interface CourseRow {
  id: string; org_id: string; owner_id: string; title: string; subject: string; grade: string; description: string;
  status: CourseStatus; created_at: Date; updated_at: Date;
}

function toCourse(r: CourseRow): Course {
  return {
    id: r.id, orgId: r.org_id, ownerId: r.owner_id, title: r.title, subject: r.subject,
    grade: r.grade, description: r.description, status: r.status,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export async function createCourse(input: {
  orgId: string; ownerId: string; title: unknown; subject?: unknown; grade?: unknown; description?: unknown;
}): Promise<Course> {
  const title = requireText(input.title, LIMITS.title, 'Название');
  const subject = optionalText(input.subject, LIMITS.subject, 'Предмет');
  const grade = optionalText(input.grade, LIMITS.grade, 'Класс');
  const description = optionalText(input.description, LIMITS.description, 'Описание');
  const { rows } = await db().query<CourseRow>(
    `INSERT INTO courses AS c (id, org_id, owner_id, title, subject, grade, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COURSE_COLUMNS}`,
    [crypto.randomUUID(), input.orgId, input.ownerId, title, subject, grade, description]);
  return toCourse(rows[0]);
}

export async function getCourse(id: string): Promise<Course | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<CourseRow>(`SELECT ${COURSE_COLUMNS} FROM courses c WHERE c.id = $1`, [id]);
  return rows[0] ? toCourse(rows[0]) : null;
}

export async function updateCourse(
  id: string, patch: { title?: unknown; subject?: unknown; grade?: unknown; description?: unknown },
): Promise<Course> {
  const current = await getCourse(id);
  if (!current) throw new LmsError('Курс не найден.');
  const title = patch.title === undefined ? current.title : requireText(patch.title, LIMITS.title, 'Название');
  const subject = patch.subject === undefined
    ? current.subject : optionalText(patch.subject, LIMITS.subject, 'Предмет');
  const description = patch.description === undefined
    ? current.description : optionalText(patch.description, LIMITS.description, 'Описание');
  const grade = patch.grade === undefined ? current.grade : optionalText(patch.grade, LIMITS.grade, 'Класс');
  const { rows } = await db().query<CourseRow>(
    `UPDATE courses c SET title = $2, subject = $3, description = $4, grade = $5, updated_at = now()
     WHERE c.id = $1 RETURNING ${COURSE_COLUMNS}`, [id, title, subject, description, grade]);
  return toCourse(rows[0]);
}

export async function setCourseStatus(id: string, status: CourseStatus): Promise<void> {
  await db().query('UPDATE courses SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
}

export async function touchCourse(id: string): Promise<void> {
  await db().query('UPDATE courses SET updated_at = now() WHERE id = $1', [id]);
}

export interface CourseListItem extends Course {
  ownerLabel: string;
  groupTitles: string[];
  topicCount: number;
  /** Сданных и ещё не проверенных ответов. */
  ungraded: number;
}

export async function listStaffCourses(orgId: string, ownerId: string | null): Promise<CourseListItem[]> {
  const { rows } = await db().query<CourseRow & {
    owner_label: string; group_titles: string[]; topic_count: number; ungraded: number;
  }>(
    `SELECT ${COURSE_COLUMNS},
       coalesce(u.display_name, u.email, u.login) AS owner_label,
       ARRAY(SELECT g.title FROM course_groups cg JOIN groups g ON g.id = cg.group_id
             WHERE cg.course_id = c.id AND g.archived_at IS NULL ORDER BY g.title) AS group_titles,
       (SELECT count(*)::int FROM topics t WHERE t.course_id = c.id) AS topic_count,
       (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id
          JOIN topics t ON t.id = b.topic_id
        WHERE t.course_id = c.id AND s.status = 'submitted') AS ungraded
     FROM courses c JOIN users u ON u.id = c.owner_id
     WHERE c.org_id = $1 AND ($2::uuid IS NULL OR c.owner_id = $2::uuid)
     ORDER BY c.status = 'archived', c.updated_at DESC`, [orgId, ownerId]);
  return rows.map((r) => ({
    ...toCourse(r), ownerLabel: r.owner_label, groupTitles: r.group_titles,
    topicCount: r.topic_count, ungraded: r.ungraded,
  }));
}

export async function listCourseGroupIds(courseId: string): Promise<string[]> {
  const { rows } = await db().query<{ group_id: string }>(
    `SELECT cg.group_id FROM course_groups cg JOIN groups g ON g.id = cg.group_id
     WHERE cg.course_id = $1 AND g.archived_at IS NULL ORDER BY g.title`, [courseId]);
  return rows.map((r) => r.group_id);
}

/**
 * Кому открыт курс. allowed — группы, которые этот человек вправе выбирать
 * (allowedGroupIds): учитель меняет только их, группы, открытые админом, остаются.
 */
export async function setCourseGroups(
  courseId: string, groupIds: string[], allowed: ReadonlySet<string>,
): Promise<void> {
  const wanted = [...new Set(groupIds)];
  if (wanted.some((id) => !allowed.has(id))) {
    throw new LmsError('Эту группу нельзя выбрать: её нет среди ваших групп.');
  }
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM course_groups WHERE course_id = $1 AND group_id = ANY($2::uuid[])',
      [courseId, [...allowed]]);
    if (wanted.length > 0) {
      await client.query(
        `INSERT INTO course_groups (course_id, group_id)
         SELECT $1::uuid, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [courseId, wanted]);
    }
    await client.query('UPDATE courses SET updated_at = now() WHERE id = $1', [courseId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

interface TopicRow { id: string; course_id: string; position: number; title: string; format: TopicFormat; time_limit_min: number | null; due_at: Date | null }
const TOPIC_COLUMNS = 'id, course_id, position, title, format, time_limit_min, due_at';

function toTopic(r: TopicRow): Topic {
  return { id: r.id, courseId: r.course_id, position: r.position, title: r.title, format: r.format, timeLimitMin: r.time_limit_min,
    dueAt: r.due_at ? r.due_at.toISOString() : null };
}

export async function listTopics(courseId: string): Promise<Topic[]> {
  const { rows } = await db().query<TopicRow>(
    `SELECT ${TOPIC_COLUMNS} FROM topics WHERE course_id = $1 ORDER BY position, id`, [courseId]);
  return rows.map(toTopic);
}

export async function getTopic(topicId: string): Promise<Topic | null> {
  if (!isUuid(topicId)) return null;
  const { rows } = await db().query<TopicRow>(
    `SELECT ${TOPIC_COLUMNS} FROM topics WHERE id = $1`, [topicId]);
  return rows[0] ? toTopic(rows[0]) : null;
}

export async function createTopic(courseId: string, title: unknown): Promise<Topic> {
  const clean = requireText(title, LIMITS.title, 'Название темы');
  const position = await nextPosition(TOPICS, courseId);
  const { rows } = await db().query<TopicRow>(
    `INSERT INTO topics (id, course_id, position, title) VALUES ($1, $2, $3, $4)
     RETURNING ${TOPIC_COLUMNS}`, [crypto.randomUUID(), courseId, position, clean]);
  await touchCourse(courseId);
  return toTopic(rows[0]);
}

export async function renameTopic(topicId: string, title: unknown): Promise<void> {
  const clean = requireText(title, LIMITS.title, 'Название темы');
  await db().query('UPDATE topics SET title = $2 WHERE id = $1', [topicId, clean]);
}

/** Удаляет тему вместе с блоками и ответами (каскад в схеме). */
/** Срок сдачи: ISO-строка или null. Прошедшие даты разрешены — учитель мог забыть поставить вовремя. */
export async function setTopicDue(topicId: string, raw: unknown): Promise<void> {
  let due: Date | null = null;
  if (raw !== null && raw !== '' && raw !== undefined) {
    if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) throw new LmsError('Срок сдачи указан неверно.');
    due = new Date(raw);
  }
  await db().query('UPDATE topics SET due_at = $2 WHERE id = $1', [topicId, due]);
}

export async function setTopicFormat(topicId: string, format: unknown, rawLimit: unknown): Promise<void> {
  if (typeof format !== 'string' || !(TOPIC_FORMATS as readonly string[]).includes(format)) throw new LmsError('Неизвестный формат темы.');
  let limit: number | null = null;
  if (format === 'exam' && rawLimit !== null && rawLimit !== undefined && rawLimit !== '') {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 300) throw new LmsError('Время на контрольную — от 1 до 300 минут.');
  }
  await db().query('UPDATE topics SET format = $2, time_limit_min = $3 WHERE id = $1', [topicId, format, limit]);
}

export interface ExamWindow { startedAt: string | null; deadline: string | null; over: boolean }

/** Окно контрольной ученика: отсчёт идёт с первого открытия темы (кнопка «Начать»). */
export async function examWindow(topic: Topic, userId: string): Promise<ExamWindow> {
  const { rows } = await db().query<{ first_at: Date }>(
    'SELECT first_at FROM topic_views WHERE topic_id = $1 AND user_id = $2', [topic.id, userId]);
  const started = rows[0]?.first_at ?? null;
  if (!started) return { startedAt: null, deadline: null, over: false };
  const deadline = topic.timeLimitMin ? new Date(started.getTime() + topic.timeLimitMin * 60_000) : null;
  return { startedAt: started.toISOString(), deadline: deadline?.toISOString() ?? null, over: deadline !== null && deadline.getTime() <= Date.now() };
}

/** Контрольная закончена: время вышло или сданы все задания. До этого баллы и разбор ученику не видны. */
export async function examFinished(topic: Topic, userId: string, window?: ExamWindow): Promise<boolean> {
  const w = window ?? await examWindow(topic, userId);
  if (w.over) return true;
  const { rows } = await db().query<{ total: number; done: number }>(
    `SELECT count(b.id)::int AS total,
       count(s.id) FILTER (WHERE s.status IN ('submitted', 'graded'))::int AS done
     FROM blocks b LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = $2
     WHERE b.topic_id = $1 AND b.kind = 'assignment'`, [topic.id, userId]);
  return rows[0].total > 0 && rows[0].done >= rows[0].total;
}

export async function deleteTopic(topicId: string): Promise<void> {
  await db().query('DELETE FROM topics WHERE id = $1', [topicId]);
}

export async function moveTopic(topicId: string, direction: MoveDirection): Promise<boolean> {
  return swapWithNeighbour(TOPICS, topicId, direction);
}

/**
 * Курсы, открытые ученику: опубликованность проверяет вызывающий. $1 — id ученика.
 * Ученик должен быть в неархивной группе курса и учеником той же организации.
 */
export const VISIBLE_TO_STUDENT = `
  SELECT cg.course_id FROM course_groups cg
  JOIN groups g ON g.id = cg.group_id AND g.archived_at IS NULL
  JOIN organizations o ON o.id = g.org_id AND o.archived_at IS NULL
  JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
  JOIN memberships m ON m.org_id = g.org_id AND m.user_id = $1 AND m.role = 'student'`;

export interface StudentCourseCard {
  course: Course;
  topicsTotal: number;
  topicsOpened: number;
  assignmentsTotal: number;
  assignmentsSubmitted: number;
}

export async function listStudentCourses(userId: string): Promise<StudentCourseCard[]> {
  const { rows } = await db().query<CourseRow & {
    topics_total: number; topics_opened: number; assignments_total: number; assignments_submitted: number;
  }>(
    `SELECT ${COURSE_COLUMNS},
       (SELECT count(*)::int FROM topics t WHERE t.course_id = c.id) AS topics_total,
       (SELECT count(*)::int FROM topic_views v JOIN topics t ON t.id = v.topic_id
        WHERE t.course_id = c.id AND v.user_id = $1) AS topics_opened,
       (SELECT count(*)::int FROM blocks b JOIN topics t ON t.id = b.topic_id
        WHERE t.course_id = c.id AND b.kind = 'assignment') AS assignments_total,
       (SELECT count(*)::int FROM submissions s JOIN blocks b ON b.id = s.block_id
          JOIN topics t ON t.id = b.topic_id
        WHERE t.course_id = c.id AND s.student_id = $1 AND s.status IN ('submitted', 'graded')) AS assignments_submitted
     FROM courses c
     WHERE c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
     ORDER BY c.title`, [userId]);
  return rows.map((r) => ({
    course: toCourse(r), topicsTotal: r.topics_total, topicsOpened: r.topics_opened,
    assignmentsTotal: r.assignments_total, assignmentsSubmitted: r.assignments_submitted,
  }));
}

export async function isCourseVisibleToStudent(userId: string, courseId: string): Promise<boolean> {
  const { rowCount } = await db().query(
    `SELECT 1 FROM courses c WHERE c.id = $2 AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})`,
    [userId, courseId]);
  return (rowCount ?? 0) > 0;
}

export async function recordTopicView(topicId: string, userId: string): Promise<void> {
  await db().query(
    `INSERT INTO topic_views (topic_id, user_id) VALUES ($1, $2)
     ON CONFLICT (topic_id, user_id) DO UPDATE SET last_at = now()`, [topicId, userId]);
}

export async function openedTopicIds(courseId: string, userId: string): Promise<Set<string>> {
  const { rows } = await db().query<{ topic_id: string }>(
    `SELECT v.topic_id FROM topic_views v JOIN topics t ON t.id = v.topic_id
     WHERE t.course_id = $1 AND v.user_id = $2`, [courseId, userId]);
  return new Set(rows.map((r) => r.topic_id));
}

/** Ученики групп курса — строки журнала и таблицы ответов. */
export async function courseStudents(courseId: string): Promise<JournalStudent[]> {
  const { rows } = await db().query<{ id: string; name: string; groups: string[] }>(
    `SELECT u.id, coalesce(u.display_name, u.login, u.email) AS name,
       array_agg(DISTINCT g.title ORDER BY g.title) AS groups
     FROM course_groups cg
     JOIN groups g ON g.id = cg.group_id AND g.archived_at IS NULL
     JOIN group_members gm ON gm.group_id = g.id
     JOIN users u ON u.id = gm.user_id
     JOIN memberships m ON m.user_id = u.id AND m.org_id = g.org_id AND m.role = 'student'
     WHERE cg.course_id = $1
     GROUP BY u.id ORDER BY name`, [courseId]);
  return rows.map((r) => ({ id: r.id, name: r.name, groups: r.groups }));
}

export async function courseTopicViews(courseId: string): Promise<ProgressView[]> {
  const { rows } = await db().query<{ topic_id: string; user_id: string }>(
    `SELECT v.topic_id, v.user_id FROM topic_views v JOIN topics t ON t.id = v.topic_id
     WHERE t.course_id = $1`, [courseId]);
  return rows.map((r) => ({ topicId: r.topic_id, userId: r.user_id }));
}

/**
 * Удаление курса — только пока по нему нет сданных ответов: иначе пропали бы оценки
 * учеников. Курс с ответами отправляют в архив (его можно вернуть).
 */
export async function deleteCourse(courseId: string): Promise<void> {
  const { rows } = await db().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
     WHERE t.course_id = $1 AND s.status <> 'draft'`, [courseId]);
  if (rows[0].n > 0) {
    throw new LmsError(`По курсу уже есть ответы учеников (${rows[0].n}) — удалить его нельзя, чтобы не пропали оценки. Отправьте курс в архив.`);
  }
  await db().query('DELETE FROM courses WHERE id = $1', [courseId]);
}

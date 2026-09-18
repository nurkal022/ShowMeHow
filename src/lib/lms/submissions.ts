import crypto from 'node:crypto';
import { db } from '../db/client';
import { isUuid } from '../org/access';
import {
  autoScore, canSaveDraft, canSubmit, isAnswerComplete, sanitizeAnswer, withHints, type Answer,
} from './answers';
import { assignmentTitle, bodyFromRow } from './block-schema';
import type { Block } from './blocks';
import { courseStudents, VISIBLE_TO_STUDENT } from './courses';
import type { JournalStudent } from './journal';
import { LmsError, type AnswerState, type SubmissionStatus } from './types';

/**
 * Ответы учеников. Одна строка на ученика и задание: повторная сдача
 * перезаписывает ответ и сбрасывает оценку (история попыток — следующая волна).
 */

export interface Submission {
  id: string;
  blockId: string;
  studentId: string;
  blockRevision: number;
  answer: Answer | null;
  status: SubmissionStatus;
  autoScore: number | null;
  score: number | null;
  comment: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  gradedBy: string | null;
  updatedAt: string;
}

export interface SubmissionRow {
  id: string; block_id: string; student_id: string; block_revision: number; answer: unknown;
  status: SubmissionStatus; auto_score: string | null; score: string | null; comment: string | null;
  submitted_at: Date | null; graded_at: Date | null; graded_by: string | null; updated_at: Date;
}

export const SUBMISSION_COLUMNS = `id, block_id, student_id, block_revision, answer, status, auto_score, score,
  comment, submitted_at, graded_at, graded_by, updated_at`;

const num = (v: string | null) => (v === null ? null : Number(v));
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function asAnswer(raw: unknown): Answer | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = (raw as { type?: unknown }).type;
  return t === 'choice' || t === 'number' || t === 'text' || t === 'sim_state' ? raw as Answer : null;
}

export function toSubmission(r: SubmissionRow): Submission {
  return {
    id: r.id, blockId: r.block_id, studentId: r.student_id, blockRevision: r.block_revision,
    answer: asAnswer(r.answer), status: r.status, autoScore: num(r.auto_score), score: num(r.score),
    comment: r.comment, submittedAt: iso(r.submitted_at), gradedAt: iso(r.graded_at),
    gradedBy: r.graded_by, updatedAt: r.updated_at.toISOString(),
  };
}

export async function getSubmission(id: string): Promise<Submission | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE id = $1`, [id]);
  return rows[0] ? toSubmission(rows[0]) : null;
}

export async function getOwnSubmission(blockId: string, studentId: string): Promise<Submission | null> {
  const { rows } = await db().query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE block_id = $1 AND student_id = $2`, [blockId, studentId]);
  return rows[0] ? toSubmission(rows[0]) : null;
}

export async function listOwnSubmissions(studentId: string, blockIds: string[]): Promise<Map<string, Submission>> {
  if (blockIds.length === 0) return new Map();
  const { rows } = await db().query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE student_id = $1 AND block_id = ANY($2::uuid[])`,
    [studentId, blockIds]);
  return new Map(rows.map((r) => [r.block_id, toSubmission(r)]));
}

/**
 * Черновик или сдача. Доступ ученика к блоку проверяет роут (studentBlock).
 * Выбор и число проверяются сразу: статус «проверено», балл — автобалл.
 */
export async function saveAnswer(
  block: Block, studentId: string, rawAnswer: unknown, submit: boolean,
): Promise<Submission> {
  if (block.body.kind !== 'assignment') throw new LmsError('Отвечать можно только на задание.');
  const payload = block.body.payload;
  const current = await getOwnSubmission(block.id, studentId);
  const state: AnswerState = current?.status ?? 'none';
  const answer = sanitizeAnswer(payload.spec, rawAnswer);

  if (!submit) {
    if (!canSaveDraft(state)) throw new LmsError('Черновик нельзя сохранить: ответ уже сдан.');
    // Черновик после возврата остаётся «возвращённым»: комментарий учителя виден.
    const { rows } = await db().query<SubmissionRow>(
      `INSERT INTO submissions (id, block_id, student_id, block_revision, answer, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       ON CONFLICT (block_id, student_id) DO UPDATE SET answer = EXCLUDED.answer, updated_at = now()
       RETURNING ${SUBMISSION_COLUMNS}`,
      [crypto.randomUUID(), block.id, studentId, block.revision, JSON.stringify(answer)]);
    return toSubmission(rows[0]);
  }

  if (!canSubmit(state, payload.allowRetry)) {
    throw new LmsError('Ответ уже сдан. Сдать заново можно, если учитель вернёт работу или разрешит повторную сдачу.');
  }
  if (!isAnswerComplete(answer)) {
    throw new LmsError(answer.type === 'sim_state'
      ? 'Симуляция не передала значения параметров. Обновите страницу и попробуйте ещё раз.'
      : 'Ответ пустой — заполните его перед сдачей.');
  }
  const auto = autoScore(payload, answer);
  const stored = withHints(payload, answer);
  const status: SubmissionStatus = auto === null ? 'submitted' : 'graded';
  const { rows } = await db().query<SubmissionRow>(
    `INSERT INTO submissions (id, block_id, student_id, block_revision, answer, status, auto_score, score,
       comment, submitted_at, graded_at, graded_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, NULL, now(),
       CASE WHEN $6 = 'graded' THEN now() END, NULL, now())
     ON CONFLICT (block_id, student_id) DO UPDATE SET
       block_revision = EXCLUDED.block_revision, answer = EXCLUDED.answer, status = EXCLUDED.status,
       auto_score = EXCLUDED.auto_score, score = EXCLUDED.score, comment = NULL,
       submitted_at = now(), graded_at = EXCLUDED.graded_at, graded_by = NULL, updated_at = now()
     RETURNING ${SUBMISSION_COLUMNS}`,
    [crypto.randomUUID(), block.id, studentId, block.revision, JSON.stringify(stored), status, auto]);
  return toSubmission(rows[0]);
}

export interface AnswerRow {
  student: JournalStudent;
  submission: Submission | null;
}

/** Все ученики групп курса и их ответ на задание — таблица «Ответы». */
export async function listBlockAnswers(blockId: string, courseId: string): Promise<AnswerRow[]> {
  const students = await courseStudents(courseId);
  const { rows } = await db().query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE block_id = $1`, [blockId]);
  const byStudent = new Map(rows.map((r) => [r.student_id, toSubmission(r)]));
  return students.map((student) => ({ student, submission: byStudent.get(student.id) ?? null }));
}

export interface StudentGrade {
  courseId: string;
  courseTitle: string;
  topicId: string;
  topicTitle: string;
  blockId: string;
  title: string;
  points: number;
  state: AnswerState;
  /** Только после проверки. */
  score: number | null;
}

export async function listStudentGrades(studentId: string): Promise<StudentGrade[]> {
  const { rows } = await db().query<{
    course_id: string; course_title: string; topic_id: string; topic_title: string;
    block_id: string; payload: unknown; status: SubmissionStatus | null; score: string | null;
  }>(
    `SELECT c.id AS course_id, c.title AS course_title, t.id AS topic_id, t.title AS topic_title,
       b.id AS block_id, b.payload, s.status, s.score
     FROM courses c
     JOIN topics t ON t.course_id = c.id
     JOIN blocks b ON b.topic_id = t.id AND b.kind = 'assignment'
     LEFT JOIN submissions s ON s.block_id = b.id AND s.student_id = $1
     WHERE c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
     ORDER BY c.title, t.position, t.id, b.position, b.id`, [studentId]);
  return rows.flatMap((r) => {
    const body = bodyFromRow('assignment', r.payload);
    if (body.kind !== 'assignment') return [];
    const state: AnswerState = r.status ?? 'none';
    return [{
      courseId: r.course_id, courseTitle: r.course_title, topicId: r.topic_id, topicTitle: r.topic_title,
      blockId: r.block_id, title: assignmentTitle(body.payload.prompt), points: body.payload.points,
      state, score: state === 'graded' ? num(r.score) : null,
    }];
  });
}

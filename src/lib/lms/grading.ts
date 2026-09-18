import { db } from '../db/client';
import { autoScore, parseScore } from './answers';
import { listCourseAssignments, type Block } from './blocks';
import { courseStudents, courseTopicViews, listTopics } from './courses';
import { buildJournal, buildProgress, type Journal, type Progress } from './journal';
import {
  SUBMISSION_COLUMNS, toSubmission, type Submission, type SubmissionRow,
} from './submissions';
import { LIMITS, LmsError, optionalText, type SubmissionStatus } from './types';

/** Проверка учителем, пересчёт после правки задания, журнал и прогресс курса. */

function comment(raw: unknown): string | null {
  return optionalText(raw, LIMITS.comment, 'Комментарий') || null;
}

export async function gradeSubmission(
  sub: Submission, points: number, graderId: string, rawScore: unknown, rawComment: unknown,
): Promise<Submission> {
  if (sub.status === 'draft') throw new LmsError('Черновик нельзя оценить: ученик ещё не сдал ответ.');
  const score = parseScore(rawScore, points);
  const { rows } = await db().query<SubmissionRow>(
    `UPDATE submissions SET status = 'graded', score = $2, comment = $3, graded_at = now(), graded_by = $4,
       updated_at = now()
     WHERE id = $1 RETURNING ${SUBMISSION_COLUMNS}`, [sub.id, score, comment(rawComment), graderId]);
  return toSubmission(rows[0]);
}

export async function returnSubmission(sub: Submission, graderId: string, rawComment: unknown): Promise<Submission> {
  if (sub.status === 'draft') throw new LmsError('Черновик нельзя вернуть: ученик ещё не сдал ответ.');
  const { rows } = await db().query<SubmissionRow>(
    `UPDATE submissions SET status = 'returned', score = NULL, comment = $2, graded_at = now(), graded_by = $3,
       updated_at = now()
     WHERE id = $1 RETURNING ${SUBMISSION_COLUMNS}`, [sub.id, comment(rawComment), graderId]);
  return toSubmission(rows[0]);
}

/**
 * «Пересчитать N сданных ответов»: ответы со старой ревизией проверяются новым
 * ключом. Оценку, поставленную учителем вручную, пересчёт не трогает — меняется
 * только автобалл. Развёрнутый ответ без ручной оценки уходит учителю на проверку.
 */
export async function recalculateBlock(block: Block): Promise<number> {
  if (block.body.kind !== 'assignment') throw new LmsError('Пересчитать можно только задание.');
  const payload = block.body.payload;
  const { rows } = await db().query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS} FROM submissions
     WHERE block_id = $1 AND block_revision < $2 AND status IN ('submitted', 'graded')`,
    [block.id, block.revision]);
  for (const row of rows) {
    const sub = toSubmission(row);
    const auto = sub.answer ? autoScore(payload, sub.answer) : null;
    const manual = sub.gradedBy !== null;
    const status: SubmissionStatus = manual ? sub.status : auto === null ? 'submitted' : 'graded';
    const score = manual ? sub.score : auto;
    await db().query(
      `UPDATE submissions SET auto_score = $2, score = $3, status = $4, block_revision = $5,
         graded_at = CASE WHEN $4 = 'graded' THEN coalesce(graded_at, now()) END, updated_at = now()
       WHERE id = $1`, [sub.id, auto, score, status, block.revision]);
  }
  return rows.length;
}

export async function courseJournal(courseId: string): Promise<Journal> {
  const [students, assignments, subs] = await Promise.all([
    courseStudents(courseId),
    listCourseAssignments(courseId),
    db().query<{ block_id: string; student_id: string; status: SubmissionStatus; score: string | null }>(
      `SELECT s.block_id, s.student_id, s.status, s.score
       FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
       WHERE t.course_id = $1`, [courseId]),
  ]);
  return buildJournal(students, assignments, subs.rows.map((r) => ({
    blockId: r.block_id, studentId: r.student_id, status: r.status,
    score: r.score === null ? null : Number(r.score),
  })));
}

export async function courseProgress(courseId: string): Promise<Progress> {
  const [students, topics, views] = await Promise.all([
    courseStudents(courseId), listTopics(courseId), courseTopicViews(courseId),
  ]);
  return buildProgress(students, topics.map((t) => ({ id: t.id, title: t.title })), views);
}

import crypto from 'node:crypto';
import { db } from '../db/client';
import { isUuid } from '../org/access';
import {
  answerKeyChanged, assignmentTitle, bodyFromRow, defaultBody, sanitizeBlockBody, withSimulation,
  type BlockBody, type BlockKind,
} from './block-schema';
import { BLOCKS, nextPosition, swapWithNeighbour, type MoveDirection } from './order';
import { LmsError } from './types';

/**
 * Блоки темы. У задания есть ревизия: она растёт, когда меняется то, от чего
 * зависит балл, и ответы со старой ревизией можно пересчитать (grading.ts).
 */

export interface Block {
  id: string;
  topicId: string;
  position: number;
  revision: number;
  updatedAt: string;
  body: BlockBody;
}

interface BlockRow {
  id: string; topic_id: string; position: number; kind: string; payload: unknown;
  revision: number; updated_at: Date;
}

const COLUMNS = 'id, topic_id, position, kind, payload, revision, updated_at';

function toBlock(r: BlockRow): Block {
  return {
    id: r.id, topicId: r.topic_id, position: r.position, revision: r.revision,
    updatedAt: r.updated_at.toISOString(), body: bodyFromRow(r.kind, r.payload),
  };
}

async function touchCourseOfTopic(topicId: string): Promise<void> {
  await db().query(
    'UPDATE courses SET updated_at = now() WHERE id = (SELECT course_id FROM topics WHERE id = $1)', [topicId]);
}

export async function listBlocks(topicId: string): Promise<Block[]> {
  const { rows } = await db().query<BlockRow>(
    `SELECT ${COLUMNS} FROM blocks WHERE topic_id = $1 ORDER BY position, id`, [topicId]);
  return rows.map(toBlock);
}

export async function getBlock(blockId: string): Promise<Block | null> {
  if (!isUuid(blockId)) return null;
  const { rows } = await db().query<BlockRow>(`SELECT ${COLUMNS} FROM blocks WHERE id = $1`, [blockId]);
  return rows[0] ? toBlock(rows[0]) : null;
}

/**
 * afterBlockId — вставка сразу под этим блоком (null — в начало, undefined — в конец).
 * payload — готовое содержимое (дублирование): оно уже прошло sanitizeBlockBody у вызывающего.
 */
export async function createBlock(
  topicId: string, kind: BlockKind, opts: { afterBlockId?: string | null; payload?: BlockBody['payload'] } = {},
): Promise<Block> {
  const payload = opts.payload ?? defaultBody(kind).payload;
  const id = crypto.randomUUID();
  let position: number;
  if (opts.afterBlockId === undefined) {
    position = await nextPosition(BLOCKS, topicId);
  } else {
    const ids = (await listBlocks(topicId)).map((b) => b.id);
    const at = opts.afterBlockId === null ? 0 : ids.indexOf(opts.afterBlockId) + 1;
    position = at + 1;
    // Сдвигаем хвост: позиции не уникальны в схеме, поэтому одним оператором.
    await db().query(
      `UPDATE blocks b SET position = o.ord + 1
       FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
       WHERE b.id = o.id AND b.topic_id = $1 AND o.ord > $3`, [topicId, ids, at]);
    await db().query(
      `UPDATE blocks b SET position = o.ord
       FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
       WHERE b.id = o.id AND b.topic_id = $1 AND o.ord <= $3`, [topicId, ids, at]);
  }
  const { rows } = await db().query<BlockRow>(
    `INSERT INTO blocks (id, topic_id, position, kind, payload) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`, [id, topicId, position, kind, JSON.stringify(payload)]);
  await touchCourseOfTopic(topicId);
  return toBlock(rows[0]);
}

/** Перетаскивание: блок встаёт на место index (с нуля) среди блоков своей темы. */
export async function moveBlockTo(blockId: string, index: number): Promise<void> {
  const current = await getBlock(blockId);
  if (!current) throw new LmsError('Блок не найден.');
  const ids = (await listBlocks(current.topicId)).map((b) => b.id).filter((id) => id !== blockId);
  const at = Math.max(0, Math.min(ids.length, Math.trunc(index)));
  ids.splice(at, 0, blockId);
  await db().query(
    `UPDATE blocks b SET position = o.ord
     FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
     WHERE b.id = o.id AND b.topic_id = $1`, [current.topicId, ids]);
  await touchCourseOfTopic(current.topicId);
}

async function saveBody(blockId: string, body: BlockBody, bump: boolean): Promise<Block> {
  const { rows } = await db().query<BlockRow>(
    `UPDATE blocks SET payload = $2, revision = revision + $3, updated_at = now()
     WHERE id = $1 RETURNING ${COLUMNS}`, [blockId, JSON.stringify(body.payload), bump ? 1 : 0]);
  if (!rows[0]) throw new LmsError('Блок не найден.');
  await touchCourseOfTopic(rows[0].topic_id);
  return toBlock(rows[0]);
}

/** Сданные и проверенные ответы на задание — их и пересчитывает grading.ts. */
async function checkedSubmissionCount(blockId: string): Promise<number> {
  const { rows } = await db().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM submissions
     WHERE block_id = $1 AND status IN ('submitted', 'graded')`, [blockId]);
  return rows[0].n;
}

/** stale — сколько сданных ответов проверены по прежнему ключу. */
export async function updateBlock(blockId: string, payload: unknown): Promise<{ block: Block; stale: number }> {
  const current = await getBlock(blockId);
  if (!current) throw new LmsError('Блок не найден.');
  const next = sanitizeBlockBody(current.body.kind, payload);
  const keyChanged = current.body.kind === 'assignment' && next.kind === 'assignment'
    && answerKeyChanged(current.body.payload, next.payload);
  // Ревизию поднимаем, только если есть что пересчитывать: пока ответов нет,
  // правка задания — это его составление, а не смена ключа у сданных работ.
  const bump = keyChanged && (await checkedSubmissionCount(blockId)) > 0;
  const block = await saveBody(blockId, next, bump);
  return { block, stale: await staleSubmissionCount(blockId) };
}

/** Вставка симуляции не меняет ключ ответа, ревизия остаётся прежней. */
export async function setBlockSimulation(blockId: string, simulationId: string): Promise<Block> {
  const current = await getBlock(blockId);
  if (!current) throw new LmsError('Блок не найден.');
  return saveBody(blockId, withSimulation(current.body, simulationId), false);
}

export async function deleteBlock(blockId: string): Promise<void> {
  await db().query('DELETE FROM blocks WHERE id = $1', [blockId]);
}

export async function moveBlock(blockId: string, direction: MoveDirection): Promise<boolean> {
  return swapWithNeighbour(BLOCKS, blockId, direction);
}

export async function staleSubmissionCount(blockId: string): Promise<number> {
  const { rows } = await db().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM submissions s JOIN blocks b ON b.id = s.block_id
     WHERE s.block_id = $1 AND s.block_revision < b.revision AND s.status IN ('submitted', 'graded')`, [blockId]);
  return rows[0].n;
}

/** Какие из симуляций ещё существуют: удалённую автор блок показывает как «удалён автором». */
export async function existingSimulationIds(ids: string[]): Promise<Set<string>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Set();
  const { rows } = await db().query<{ id: string }>(
    'SELECT id FROM simulations WHERE id = ANY($1::uuid[])', [valid]);
  return new Set(rows.map((r) => r.id));
}

export async function simulationTitles(ids: string[]): Promise<Map<string, string>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Map();
  const { rows } = await db().query<{ id: string; title: string }>(
    'SELECT id, title FROM simulations WHERE id = ANY($1::uuid[])', [valid]);
  return new Map(rows.map((r) => [r.id, r.title]));
}

export interface CourseAssignment {
  blockId: string;
  topicId: string;
  topicTitle: string;
  title: string;
  points: number;
}

export async function listCourseAssignments(courseId: string): Promise<CourseAssignment[]> {
  const { rows } = await db().query<{ id: string; topic_id: string; topic_title: string; payload: unknown }>(
    `SELECT b.id, b.topic_id, t.title AS topic_title, b.payload
     FROM blocks b JOIN topics t ON t.id = b.topic_id
     WHERE t.course_id = $1 AND b.kind = 'assignment'
     ORDER BY t.position, t.id, b.position, b.id`, [courseId]);
  return rows.flatMap((r) => {
    const body = bodyFromRow('assignment', r.payload);
    if (body.kind !== 'assignment') return [];
    return [{
      blockId: r.id, topicId: r.topic_id, topicTitle: r.topic_title,
      title: assignmentTitle(body.payload.prompt), points: body.payload.points,
    }];
  });
}

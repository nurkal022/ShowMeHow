import { db } from '../db/client';

/**
 * Порядок тем и блоков: позиции растут с единицы, дыры после удаления не мешают.
 * Имена таблиц — только из этого белого списка, поэтому их можно подставлять в SQL.
 */

export type Ordered = { table: 'topics'; parent: 'course_id' } | { table: 'blocks'; parent: 'topic_id' };
export const TOPICS: Ordered = { table: 'topics', parent: 'course_id' };
export const BLOCKS: Ordered = { table: 'blocks', parent: 'topic_id' };

export type MoveDirection = 'up' | 'down';

export function isMoveDirection(v: unknown): v is MoveDirection {
  return v === 'up' || v === 'down';
}

export async function nextPosition(o: Ordered, parentId: string): Promise<number> {
  const { rows } = await db().query<{ next: number }>(
    `SELECT coalesce(max(position), 0) + 1 AS next FROM ${o.table} WHERE ${o.parent} = $1`, [parentId]);
  return rows[0].next;
}

/** Меняет местами с соседом одним оператором. false — соседа нет (край списка). */
export async function swapWithNeighbour(o: Ordered, id: string, direction: MoveDirection): Promise<boolean> {
  const cmp = direction === 'up' ? '<' : '>';
  const order = direction === 'up' ? 'DESC' : 'ASC';
  const r = await db().query(
    `WITH cur AS (SELECT id, ${o.parent} AS parent, position FROM ${o.table} WHERE id = $1),
          nb AS (SELECT t.id, t.position FROM ${o.table} t, cur
                 WHERE t.${o.parent} = cur.parent AND t.position ${cmp} cur.position
                 ORDER BY t.position ${order} LIMIT 1)
     UPDATE ${o.table} t
     SET position = CASE WHEN t.id = cur.id THEN nb.position ELSE cur.position END
     FROM cur, nb
     WHERE t.id IN (cur.id, nb.id)`, [id]);
  return (r.rowCount ?? 0) > 0;
}

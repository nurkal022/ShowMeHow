import { db } from '../db/client';
import { LmsError } from './types';
import { VISIBLE_TO_STUDENT } from './courses';

/**
 * Заметки и закладки ученика на шагах урока. Видит их только автор: это его конспект,
 * учителю он не показывается. Права на курс проверяет сам запрос — чужой блок не сохранится.
 */

export interface StepNote {
  blockId: string;
  topicId: string;
  body: string;
  bookmarked: boolean;
  updatedAt: string;
}

export interface NoteEntry extends StepNote {
  courseId: string;
  courseTitle: string;
  subject: string;
  topicTitle: string;
  /** Заголовок шага — чтобы заметку можно было узнать в списке. */
  stepTitle: string;
}

const MAX_NOTE = 4000;

export async function notesOfTopic(userId: string, topicId: string): Promise<StepNote[]> {
  const { rows } = await db().query<{ block_id: string; body: string; bookmarked: boolean; updated_at: Date }>(
    'SELECT block_id, body, bookmarked, updated_at FROM lesson_notes WHERE user_id = $1 AND topic_id = $2',
    [userId, topicId]);
  return rows.map((r) => ({
    blockId: r.block_id, topicId, body: r.body, bookmarked: r.bookmarked, updatedAt: r.updated_at.toISOString(),
  }));
}

/** Сохраняет заметку и/или закладку. Пустая запись без закладки удаляется — списки не засоряются. */
export async function saveNote(
  userId: string, blockId: string, body: unknown, bookmarked: unknown,
): Promise<StepNote | null> {
  const text = typeof body === 'string' ? body.trim() : '';
  if (text.length > MAX_NOTE) throw new LmsError(`Заметка — не длиннее ${MAX_NOTE} символов.`);
  const mark = bookmarked === true;
  if (!text && !mark) {
    await db().query('DELETE FROM lesson_notes WHERE user_id = $1 AND block_id = $2', [userId, blockId]);
    return null;
  }
  const { rows } = await db().query<{ topic_id: string; updated_at: Date }>(
    `INSERT INTO lesson_notes (user_id, block_id, topic_id, body, bookmarked)
     SELECT $1, b.id, b.topic_id, $3, $4 FROM blocks b
       JOIN topics t ON t.id = b.topic_id JOIN courses c ON c.id = t.course_id
     WHERE b.id = $2 AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
     ON CONFLICT (user_id, block_id) DO UPDATE SET body = excluded.body, bookmarked = excluded.bookmarked, updated_at = now()
     RETURNING topic_id, updated_at`, [userId, blockId, text, mark]);
  if (!rows[0]) throw new LmsError('Шаг недоступен — возможно, курс закрыли.');
  return { blockId, topicId: rows[0].topic_id, body: text, bookmarked: mark, updatedAt: rows[0].updated_at.toISOString() };
}

/** Все заметки и закладки ученика — для страницы «Заметки». */
export async function listNotes(userId: string): Promise<NoteEntry[]> {
  const { rows } = await db().query<{
    block_id: string; topic_id: string; body: string; bookmarked: boolean; updated_at: Date;
    course_id: string; course: string; subject: string; topic: string; payload: { title?: string; prompt?: string; caption?: string } | null;
    kind: string;
  }>(
    `SELECT n.block_id, n.topic_id, n.body, n.bookmarked, n.updated_at,
       c.id AS course_id, c.title AS course, c.subject, t.title AS topic, b.payload, b.kind
     FROM lesson_notes n
     JOIN blocks b ON b.id = n.block_id
     JOIN topics t ON t.id = n.topic_id
     JOIN courses c ON c.id = t.course_id
     WHERE n.user_id = $1 AND c.status = 'published' AND c.id IN (${VISIBLE_TO_STUDENT})
     ORDER BY n.updated_at DESC`, [userId]);
  return rows.map((r) => {
    const p = r.payload ?? {};
    const raw = (p.title || p.caption || p.prompt || '').replace(/\s+/g, ' ').trim();
    return {
      blockId: r.block_id, topicId: r.topic_id, body: r.body, bookmarked: r.bookmarked,
      updatedAt: r.updated_at.toISOString(), courseId: r.course_id, courseTitle: r.course,
      subject: r.subject, topicTitle: r.topic,
      stepTitle: raw ? raw.slice(0, 80) : r.kind === 'assignment' ? 'Задание' : 'Шаг урока',
    };
  });
}

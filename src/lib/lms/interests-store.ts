import { db } from '../db/client';
import { sanitizeInterests, type StudentInterests } from './interests';

/** Чтение и запись интересов ученика. Отдельно от чистого interests.ts: там импорт 'pg' недопустим. */

export async function getInterests(userId: string): Promise<StudentInterests> {
  const { rows } = await db().query<{ interests: unknown }>('SELECT interests FROM users WHERE id = $1', [userId]);
  // Пользователя может не быть только при гонке с удалением — «интересы не заполнены» здесь честнее ошибки.
  return sanitizeInterests(rows[0]?.interests);
}

/** Сохранение целиком: форма всегда присылает все поля, частичного патча тут не бывает. */
export async function saveInterests(userId: string, raw: unknown): Promise<StudentInterests> {
  const interests = sanitizeInterests(raw);
  await db().query('UPDATE users SET interests = $2 WHERE id = $1', [userId, JSON.stringify(interests)]);
  return interests;
}

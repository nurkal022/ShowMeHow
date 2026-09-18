import crypto from 'node:crypto';
import { db } from '../db/client';
import { isUuid } from '../org/access';
import { LmsError } from './types';

/** Картинки уроков. Тип определяется по сигнатуре файла, а не по тому, что прислал браузер. */

export const ASSET_MAX_BYTES = 4 * 1024 * 1024;

function sniff(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'image/gif';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function saveAsset(ownerId: string, bytes: Buffer): Promise<string> {
  if (bytes.length === 0) throw new LmsError('Файл пустой.');
  if (bytes.length > ASSET_MAX_BYTES) throw new LmsError('Картинка больше 4 МБ — уменьшите её и попробуйте снова.');
  const mime = sniff(bytes);
  if (!mime) throw new LmsError('Подходят картинки PNG, JPEG, WebP и GIF.');
  const id = crypto.randomUUID();
  await db().query('INSERT INTO lms_assets (id, owner_id, mime, bytes) VALUES ($1, $2, $3, $4)', [id, ownerId, mime, bytes]);
  return id;
}

export async function getAsset(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db().query<{ mime: string; bytes: Buffer }>('SELECT mime, bytes FROM lms_assets WHERE id = $1', [id]);
  return rows[0] ?? null;
}

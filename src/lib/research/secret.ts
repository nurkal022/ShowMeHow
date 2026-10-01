import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../settings';

/**
 * Шифрование чужих секретов в базе (токены внешних сервисов автора). Дамп базы
 * без ключа бесполезен: ключ живёт в окружении или в файле рядом с данными, а не
 * в самой базе. AES-256-GCM — метка аутентичности ловит любую подмену шифротекста.
 * Формат «v1:<iv>:<tag>:<data>» (base64) — версия на случай смены алгоритма.
 */

export class SecretError extends Error {}

const fileKeys = new Map<string, Buffer>();

/** Ключ из SHOWMEHOW_SECRET_KEY: 32 байта hex/base64 берутся как есть, любая другая строка — через sha256. */
function keyFromEnv(raw: string): Buffer {
  const s = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) {
    const b = Buffer.from(s, 'base64');
    if (b.length === 32) return b;
  }
  return createHash('sha256').update(s, 'utf8').digest();
}

/**
 * Без переменной окружения ключ создаётся один раз в data/secret.key (0600):
 * dev и небольшой сервер работают без настройки, а бэкап data/ отдельно от базы
 * не раскрывает токены вместе с дампом.
 */
function keyFromFile(): Buffer {
  const file = path.join(dataDir(), 'secret.key');
  const cached = fileKeys.get(file);
  if (cached) return cached;
  let key: Buffer;
  try {
    key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  } catch {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fresh = randomBytes(32);
    try {
      // wx: два процесса не перезапишут ключ друг друга — проигравший прочитает готовый.
      fs.writeFileSync(file, fresh.toString('base64'), { mode: 0o600, flag: 'wx' });
      key = fresh;
    } catch {
      key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
    }
  }
  if (key.length !== 32) throw new SecretError(`Повреждён ключ шифрования ${file}.`);
  fileKeys.set(file, key);
  return key;
}

function secretKey(): Buffer {
  const env = process.env.SHOWMEHOW_SECRET_KEY;
  return env ? keyFromEnv(env) : keyFromFile();
}

/** aad привязывает шифротекст к месту (например, к пользователю): чужую строку в свою подставить нельзя. */
export function encryptSecret(plain: string, aad?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string, aad?: string): string {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new SecretError('Неизвестный формат секрета.');
  const [, iv, tag, data] = parts.map((p, i) => (i === 0 ? Buffer.alloc(0) : Buffer.from(p, 'base64')));
  if (iv.length !== 12 || tag.length !== 16) throw new SecretError('Повреждённый секрет.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
    if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretError('Секрет не расшифровывается: подменён или сменился ключ.');
  }
}

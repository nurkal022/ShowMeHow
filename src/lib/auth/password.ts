import crypto from 'node:crypto';

const KEY_LEN = 64;

/** Формат хранения: scrypt$<соль hex>$<хеш hex>. Соль своя у каждого пароля. */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length === 0 || expected.length !== KEY_LEN) return false;
    const actual = crypto.scryptSync(plain, salt, KEY_LEN);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    // Повреждённая строка в базе не должна ронять вход — это просто неверный пароль.
    return false;
  }
}

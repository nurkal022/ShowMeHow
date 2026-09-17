import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __resetAttemptsForTests, __attemptKeysForTests } from '@/lib/auth/rate-limit';

// База не нужна: сверхдлинный идентификатор не должен до неё доходить.
const findUserByIdentifier = vi.fn(async () => null);
vi.mock('@/lib/auth/users', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/users')>()),
  findUserByIdentifier: (...args: unknown[]) => findUserByIdentifier(...(args as [])),
}));

// Адрес из x-forwarded-for учитывается только за доверенным прокси.
process.env.SHOWMEHOW_TRUST_PROXY = '1';

const { POST: login } = await import('@/app/api/auth/login/route');

function post(body: unknown): Request {
  return new Request('http://t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
}

describe('вход со сверхдлинным идентификатором', () => {
  beforeEach(async () => {
    await __resetAttemptsForTests();
    findUserByIdentifier.mockClear();
  });

  it('отвечает обычным 401, не ходит в базу и не заводит счётчик идентификатора', async () => {
    const res = await login(post({ identifier: 'a'.repeat(100_000), password: 'пароль123' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Неверный логин, почта или пароль.' });
    expect(findUserByIdentifier).not.toHaveBeenCalled();
    // Остался только счётчик IP.
    expect(await __attemptKeysForTests()).toHaveLength(1);
  });

  it('идентификатор допустимой длины по-прежнему ищется в базе', async () => {
    const res = await login(post({ identifier: 'ivanov.i.sch12', password: 'пароль123' }));
    expect(res.status).toBe(401);
    expect(findUserByIdentifier).toHaveBeenCalledWith('ivanov.i.sch12');
  });
});

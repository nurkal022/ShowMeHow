import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetAttemptsForTests } from '@/lib/auth/rate-limit';

// База не нужна: аккаунтов нет, а сверка пароля подменена быстрой, чтобы
// триста с лишним запросов не тратили время на scrypt.
vi.mock('@/lib/auth/users', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/users')>()),
  findUserByIdentifier: async () => null,
}));
vi.mock('@/lib/auth/password', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/password')>()),
  verifyPassword: () => false,
}));

const { POST: login } = await import('@/app/api/auth/login/route');

const post = (identifier: string) => new Request('http://t', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.40' },
  body: JSON.stringify({ identifier, password: 'пароль123' }),
});

async function failFromOneAddress(times: number): Promise<void> {
  for (let i = 0; i < times; i++) expect((await login(post(`s${i}.sch12`))).status).toBe(401);
}

describe('счётчик IP во входе зависит от SHOWMEHOW_TRUST_PROXY', () => {
  const saved = process.env.SHOWMEHOW_TRUST_PROXY;
  beforeEach(async () => { await __resetAttemptsForTests(); });
  afterEach(() => {
    if (saved === undefined) delete process.env.SHOWMEHOW_TRUST_PROXY;
    else process.env.SHOWMEHOW_TRUST_PROXY = saved;
  });

  it('за прокси 301-я попытка с одного адреса получает 429', async () => {
    process.env.SHOWMEHOW_TRUST_PROXY = '1';
    await failFromOneAddress(300);
    expect((await login(post('fresh.sch12'))).status).toBe(429);
  });

  it('без прокси адресу не верим: 301 неудача не закрывает вход другим', async () => {
    delete process.env.SHOWMEHOW_TRUST_PROXY;
    await failFromOneAddress(301);
    expect((await login(post('fresh.sch12'))).status).toBe(401);
    // Счётчик идентификатора при этом работает.
    for (let i = 0; i < 10; i++) expect((await login(post('ivanov.sch12'))).status).toBe(401);
    expect((await login(post('ivanov.sch12'))).status).toBe(429);
  });
});

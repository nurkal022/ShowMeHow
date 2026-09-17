import crypto from 'node:crypto';
import type { Page } from '@playwright/test';

/** Новый человек на каждый тест: у него своя пустая очередь и своя библиотека. */
export async function signUp(page: Page, prefix: string): Promise<void> {
  const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const res = await page.request.post('/api/auth/register',
    { data: { email, password: 'e2e-demo-pass-123' } });
  if (!res.ok()) throw new Error(`Регистрация не прошла: ${res.status()} ${await res.text()}`);
}

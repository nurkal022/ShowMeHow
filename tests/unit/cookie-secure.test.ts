import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { isSecureRequest, setSessionCookie } from '@/lib/auth/cookie';

describe('флаг Secure у куки сессии', () => {
  it('http-запрос считается небезопасным, https — безопасным', () => {
    expect(isSecureRequest(new Request('http://95.141.135.244:3100/api/auth/login'))).toBe(false);
    expect(isSecureRequest(new Request('https://example.org/api/auth/login'))).toBe(true);
  });

  it('за прокси протокол берётся из x-forwarded-proto', () => {
    const behindProxy = new Request('http://127.0.0.1:3100/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(isSecureRequest(behindProxy)).toBe(true);
    // Список значений: первый — исходный протокол клиента.
    const chain = new Request('http://127.0.0.1:3100/x', {
      headers: { 'x-forwarded-proto': 'https, http' },
    });
    expect(isSecureRequest(chain)).toBe(true);
  });

  it('по http кука ставится БЕЗ Secure — иначе браузер её выбросит', () => {
    const res = setSessionCookie(NextResponse.json({ ok: true }), 'токен', false);
    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toContain('HttpOnly');
    expect(header).not.toContain('Secure');
  });

  it('по https кука ставится с Secure', () => {
    const res = setSessionCookie(NextResponse.json({ ok: true }), 'токен', true);
    expect(res.headers.get('set-cookie') ?? '').toContain('Secure');
  });
});

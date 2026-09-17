import { describe, it, expect } from 'vitest';
import { isUnauthorized } from '@/lib/auth/client-session';

describe('распознавание протухшей сессии на клиенте', () => {
  it('401 — сессия протухла', () => {
    expect(isUnauthorized(new Response(null, { status: 401 }))).toBe(true);
  });
  it('прочие статусы — не признак протухшей сессии', () => {
    expect(isUnauthorized(new Response(null, { status: 200 }))).toBe(false);
    expect(isUnauthorized(new Response(null, { status: 404 }))).toBe(false);
    expect(isUnauthorized(new Response(null, { status: 500 }))).toBe(false);
  });
});

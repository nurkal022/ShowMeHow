import { describe, it, expect } from 'vitest';
import { clientIp } from '@/lib/auth/client-ip';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const req = (xff?: string) =>
  new Request('http://t/api/auth/login', { headers: xff ? { 'x-forwarded-for': xff } : {} });

describe('clientIp', () => {
  it('без доверенного прокси адреса нет: заголовку не верим', () => {
    expect(clientIp(req('6.6.6.6'), env({}))).toBeNull();
    expect(clientIp(req('6.6.6.6'), env({ SHOWMEHOW_TRUST_PROXY: '0' }))).toBeNull();
    expect(clientIp(req(), env({}))).toBeNull();
  });

  it('за прокси берёт адрес, который дописал прокси', () => {
    const trusted = env({ SHOWMEHOW_TRUST_PROXY: '1' });
    expect(clientIp(req('1.2.3.4'), trusted)).toBe('1.2.3.4');
    expect(clientIp(req('6.6.6.6, 1.2.3.4'), trusted)).toBe('1.2.3.4');
    expect(clientIp(req(' 6.6.6.6 ,1.2.3.4 '), trusted)).toBe('1.2.3.4');
  });

  it('за прокси без заголовка адреса тоже нет', () => {
    expect(clientIp(req(), env({ SHOWMEHOW_TRUST_PROXY: '1' }))).toBeNull();
    expect(clientIp(req(' , '), env({ SHOWMEHOW_TRUST_PROXY: '1' }))).toBeNull();
  });
});

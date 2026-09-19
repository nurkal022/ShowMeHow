import { describe, it, expect } from 'vitest';
import { isPublicPath } from '@/middleware';

describe('публичные пути middleware', () => {
  it('список лабораторий открыт без входа', () => {
    expect(isPublicPath('/labs')).toBe(true);
  });
  it('сцены лабораторий открыты без входа', () => {
    expect(isPublicPath('/labs/chemistry')).toBe(true);
    expect(isPublicPath('/lab/chemistry')).toBe(true);
  });
  it('похожий, но чужой путь не открывается по случайному совпадению префикса', () => {
    expect(isPublicPath('/labsomething')).toBe(false);
    expect(isPublicPath('/labs-secret')).toBe(false);
  });
  it('вход, регистрация и здоровье сервиса открыты', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/register')).toBe(true);
    expect(isPublicPath('/api/auth/login')).toBe(true);
    expect(isPublicPath('/api/health')).toBe(true);
  });
  it('лендинг и встроенные демо открыты гостю', () => {
    expect(isPublicPath('/')).toBe(true);
    expect(isPublicPath('/api/public/demos/pendulum')).toBe(true);
    expect(isPublicPath('/api/publicity')).toBe(false);
  });
  it('остальное закрыто', () => {
    expect(isPublicPath('/library')).toBe(false);
    expect(isPublicPath('/profile')).toBe(false);
    expect(isPublicPath('/present/abc')).toBe(false);
  });
});

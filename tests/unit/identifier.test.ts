import { describe, it, expect } from 'vitest';
import {
  parseIdentifier, normalizeIdentifier, isValidLogin, userLabel, userContact,
} from '@/lib/auth/identifier';

describe('разбор идентификатора', () => {
  it('ввод с @ — почта, нормализованная', () => {
    expect(parseIdentifier('  Ivan@Example.COM ')).toEqual({ kind: 'email', value: 'ivan@example.com' });
  });

  it('ввод без @ — логин в нижнем регистре', () => {
    expect(parseIdentifier(' Ivanov.I.SCH12 ')).toEqual({ kind: 'login', value: 'ivanov.i.sch12' });
  });

  it('пустое, не строка и недопустимый логин дают null', () => {
    expect(parseIdentifier('')).toBeNull();
    expect(parseIdentifier('   ')).toBeNull();
    expect(parseIdentifier(undefined)).toBeNull();
    expect(parseIdentifier(42)).toBeNull();
    expect(parseIdentifier('ab')).toBeNull();            // короче трёх
    expect(parseIdentifier('.ivanov')).toBeNull();       // начинается не с буквы или цифры
    expect(parseIdentifier('иванов')).toBeNull();        // кириллица
    expect(parseIdentifier('ivan ov')).toBeNull();       // пробел внутри
    expect(parseIdentifier('a'.repeat(41))).toBeNull();  // длиннее сорока
  });

  it('алфавит логина: буквы, цифры, точка, дефис, подчёркивание', () => {
    expect(isValidLogin('ivanov.i.sch12')).toBe(true);
    expect(isValidLogin('a_b-c.d')).toBe(true);
    expect(isValidLogin('abc')).toBe(true);
    expect(isValidLogin('a'.repeat(40))).toBe(true);
    expect(isValidLogin('ivanov@sch12')).toBe(false);
    expect(isValidLogin('Ivanov')).toBe(false);
  });

  it('нормализация — trim и нижний регистр', () => {
    expect(normalizeIdentifier('  AbC ')).toBe('abc');
  });
});

describe('userLabel и userContact', () => {
  it('имя важнее почты, почта важнее логина', () => {
    expect(userLabel({ displayName: 'Иван', email: 'i@e.com', login: 'ivan' })).toBe('Иван');
    expect(userLabel({ displayName: null, email: 'i@e.com', login: 'ivan' })).toBe('i@e.com');
    expect(userLabel({ displayName: null, email: null, login: 'ivan' })).toBe('ivan');
    expect(userLabel({ displayName: '', email: null, login: 'ivan' })).toBe('ivan');
  });

  it('контакт — почта, иначе логин', () => {
    expect(userContact({ email: 'i@e.com', login: 'ivan' })).toBe('i@e.com');
    expect(userContact({ email: null, login: 'ivan' })).toBe('ivan');
    expect(userContact({ email: null, login: null })).toBe('');
  });
});

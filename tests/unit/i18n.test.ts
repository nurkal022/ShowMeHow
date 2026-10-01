import { describe, expect, it } from 'vitest';
import { defineMessages, format, translator } from '@/i18n/core';
import { localeFromCookieHeader } from '@/i18n/config';
import { localizeMessage } from '@/i18n/catalog';

describe('i18n', () => {
  it('подстановки и множественное число по правилам языка', () => {
    const t = '{n, plural, one {# рисунок} few {# рисунка} many {# рисунков} other {# рисунка}}';
    expect(format(t, { n: 1 }, 'ru')).toBe('1 рисунок');
    expect(format(t, { n: 3 }, 'ru')).toBe('3 рисунка');
    expect(format(t, { n: 11 }, 'ru')).toBe('11 рисунков');
    expect(format('{n, plural, one {# figure} other {# figures}}', { n: 1 }, 'en')).toBe('1 figure');
    expect(format('{n, plural, one {# figure} other {# figures}}', { n: 5 }, 'en')).toBe('5 figures');
    expect(format('{n, plural, other {# сурет}}', { n: 5 }, 'kk')).toBe('5 сурет');
    expect(format('Привет, {name}!', { name: 'Аня' }, 'ru')).toBe('Привет, Аня!');
    expect(format('{n, plural, =0 {нет} other {#}}', { n: 0 }, 'ru')).toBe('нет');
  });
  it('перевод с запасным русским', () => {
    const m = defineMessages({ ru: { a: 'А', b: 'Б' }, kk: { a: 'Ә', b: '' }, en: { a: 'A', b: 'B' } });
    expect(translator(m, 'kk')('a')).toBe('Ә');
    expect(translator(m, 'kk')('b')).toBe('');
    expect(translator(m, 'en')('b')).toBe('B');
  });
  it('язык из cookie', () => {
    expect(localeFromCookieHeader('a=1; tesseract-lang=kk; b=2')).toBe('kk');
    expect(localeFromCookieHeader('tesseract-lang=xx')).toBe('ru');
    expect(localeFromCookieHeader(null)).toBe('ru');
  });
  it('неизвестное серверное сообщение остаётся как есть', () => {
    expect(localizeMessage('Совсем новое сообщение', 'en')).toBe('Совсем новое сообщение');
    expect(localizeMessage('Что угодно', 'ru')).toBe('Что угодно');
  });
});

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StudentsTable from '@/components/org/StudentsTable';
import RosterPreviewTable from '@/components/org/RosterPreviewTable';
import CredentialSheet, { chunk } from '@/components/org/CredentialSheet';

describe('карточка группы', () => {
  it('ученики со статусом', () => {
    const html = renderToStaticMarkup(createElement(StudentsTable, { students: [
      { userId: 'u1', displayName: 'Иванов Иван', login: 'ivanov.i.sch12', disabled: false, mustChangePassword: true },
    ] }));
    expect(html).toContain('ivanov.i.sch12');
    expect(html).toContain('ждёт смены пароля');
  });
  it('предпросмотр списка: логины и пометки словами', () => {
    const html = renderToStaticMarkup(createElement(RosterPreviewTable, { rows: [
      { line: 1, lastName: 'Иванов', firstName: 'Иван', issue: null, login: 'ivanov.i.sch12' },
      { line: 2, lastName: '', firstName: '', issue: 'empty', login: null },
      { line: 3, lastName: 'Иванов', firstName: 'Иван', issue: 'duplicate', login: null },
    ] }));
    expect(html).toContain('ivanov.i.sch12');
    expect(html).toContain('пустая строка');
    expect(html).toContain('дубль в списке');
    expect(html).toContain('будет создан');
  });
});

describe('лист паролей', () => {
  it('по восемь карточек на страницу', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7, 8, 9], 8)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8], [9]]);
    expect(chunk([], 8)).toEqual([]);
    const cards = Array.from({ length: 9 }, (_, i) => ({
      userId: `u${i}`, displayName: `Ученик ${i}`, login: `u${i}.x.sch12`, password: 'лиса-дом-семь' }));
    const html = renderToStaticMarkup(createElement(CredentialSheet, { cards, site: 'https://school.example', groupTitle: '7А' }));
    expect(html.match(/class="cred-page"/g)).toHaveLength(2);
    expect(html.match(/class="cred-card"/g)).toHaveLength(9);
    expect(html).toContain('data-field="login">u0.x.sch12');
    expect(html).toContain('data-field="password">лиса-дом-семь');
    expect(html).toContain('https://school.example');
  });
});

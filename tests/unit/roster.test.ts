import { describe, it, expect } from 'vitest';
import {
  transliterate, slugify, parseRoster, rosterKey, splitName, candidateLogin, planLogins,
  displayNameOf, createStudentsLabel, MAX_ROSTER_LINES, ROSTER_ISSUE_LABELS,
} from '@/lib/org/roster';
import { isValidLogin } from '@/lib/auth/identifier';

describe('транслит', () => {
  it('русские и казахские буквы', () => {
    expect(transliterate('Щукина')).toBe('shchukina');
    expect(transliterate('Юлия')).toBe('yuliya');
    expect(transliterate('Әбенова Ұлжан')).toBe('abenova-ulzhan');
    expect(transliterate('Ёлкин')).toBe('elkin');
  });
  it('пробелы и дефисы схлопываются, прочее выпадает', () => {
    expect(transliterate('  Петрова—Водкина  ')).toBe('petrovavodkina');
    expect(transliterate('Петрова-Водкина')).toBe('petrova-vodkina');
    expect(transliterate('№ 12 !')).toBe('12');
  });
  it('слаг организации из названия', () => {
    expect(slugify('Школа №12')).toBe('shkola-12');
    expect(slugify('Колледж связи имени очень длинного названия')).toHaveLength(32);
    expect(slugify('Колледж связи имени очень длинного названия').endsWith('-')).toBe(false);
    expect(slugify('!!!')).toBe('');
  });
});

describe('разбор списка', () => {
  it('строки «Фамилия Имя», отчество отбрасывается', () => {
    const r = parseRoster('Иванов Иван Петрович\nПетрова Анна');
    expect(r).toEqual({ ok: true, lines: [
      { line: 1, lastName: 'Иванов', firstName: 'Иван', issue: null },
      { line: 2, lastName: 'Петрова', firstName: 'Анна', issue: null },
    ] });
  });
  it('CSV через точку с запятой или запятую, заголовок и BOM пропускаются', () => {
    const r = parseRoster('﻿Фамилия;Имя\r\nВан Дейк;Анна\r\nКим,Олег\r\n\r\n');
    expect(r).toEqual({ ok: true, lines: [
      { line: 2, lastName: 'Ван Дейк', firstName: 'Анна', issue: null },
      { line: 3, lastName: 'Ким', firstName: 'Олег', issue: null },
    ] });
  });
  it('пометки: пустая строка, неполная, дубль, уже в группе, слишком длинная', () => {
    const inGroup = new Set([rosterKey('Сидоров', 'Пётр')]);
    const r = parseRoster(`Иванов Иван\n\nИванов\nиванов  иван\nСидоров Петр\n${'Я'.repeat(61)} Иван`, inGroup);
    expect(r.ok && r.lines.map((l) => l.issue)).toEqual(
      [null, 'empty', 'incomplete', 'duplicate', 'in_group', 'too_long']);
    expect(ROSTER_ISSUE_LABELS.duplicate).toBe('дубль в списке');
    expect(ROSTER_ISSUE_LABELS.empty).toBe('пустая строка');
    expect(ROSTER_ISSUE_LABELS.in_group).toBe('уже есть в группе');
  });
  it('больше 300 строк — отказ с объяснением', () => {
    const text = Array.from({ length: MAX_ROSTER_LINES + 1 }, (_, i) => `Иванов Иван${i}`).join('\n');
    expect(parseRoster(text)).toEqual({
      ok: false, error: 'В списке больше 300 строк. Разделите его на части.',
    });
  });
  it('пустой ввод — пустой список', () => {
    expect(parseRoster('')).toEqual({ ok: true, lines: [] });
  });
  it('splitName и displayNameOf', () => {
    expect(splitName('  Иванов   Иван Петрович ')).toEqual(['Иванов', 'Иван']);
    expect(displayNameOf({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
  });
});

describe('логины', () => {
  it('фамилия.и.slug, при занятости — номер после инициала', () => {
    expect(candidateLogin('Иванов', 'Иван', 'sch12', 1)).toBe('ivanov.i.sch12');
    expect(candidateLogin('Иванов', 'Иван', 'sch12', 2)).toBe('ivanov.i2.sch12');
    expect(candidateLogin('Щукина', 'Юлия', 'sch12', 1)).toBe('shchukina.y.sch12');
    expect(candidateLogin('Әбенова', 'Әсем', 'sch12', 1)).toBe('abenova.a.sch12');
  });
  it('длинная фамилия и длинный слаг укладываются в правило логина', () => {
    const slug = 'a'.repeat(32);
    const login = candidateLogin('Константинопольский', 'Иван', slug, 12);
    expect(login.length).toBeLessThanOrEqual(40);
    expect(isValidLogin(login)).toBe(true);
    expect(isValidLogin(candidateLogin('!!!', '???', 'sch12', 1))).toBe(true);
  });
  it('planLogins обходит занятые и не выдаёт один логин дважды', () => {
    const r = parseRoster('Иванов Иван\nИванов Игорь\nПетров\nИванова Ирина');
    if (!r.ok) throw new Error(r.error);
    const logins = planLogins(r.lines, 'sch12', new Set(['ivanov.i.sch12']));
    expect([...logins.entries()]).toEqual([
      [1, 'ivanov.i2.sch12'],
      [2, 'ivanov.i3.sch12'],
      [4, 'ivanova.i.sch12'],
    ]);
  });
  it('подпись кнопки создания', () => {
    expect(createStudentsLabel(1)).toBe('Создать 1 ученика');
    expect(createStudentsLabel(2)).toBe('Создать 2 учеников');
    expect(createStudentsLabel(21)).toBe('Создать 21 ученика');
    expect(createStudentsLabel(11)).toBe('Создать 11 учеников');
  });
});

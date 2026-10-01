import { describe, expect, it } from 'vitest';
import { buildSlides, doiCitation, doiHref, keyAction, stepSlide, visibleSlides, webCitation } from '@/lib/research/present';
import type { ZenodoInfo } from '@/lib/research/zenodo';

const items = [
  { id: 'a', kind: 'plot' as const, title: 'Разряд', caption: 'Экспонента' },
  { id: 'b', kind: 'model' as const, title: 'Модель RC', caption: '' },
  { id: 'c', kind: 'sim' as const, title: 'Тренажёр', caption: 'Двигайте R' },
];

describe('buildSlides', () => {
  it('титул → рисунки с номерами → «Спасибо»; подпись — заметка', () => {
    const s = buildSlides({ title: 'RC-цепь', description: 'О работе', graphical: null }, items);
    expect(s.map((x) => x.kind)).toEqual(['title', 'plot', 'model', 'sim', 'end']);
    expect(s[0]).toMatchObject({ title: 'RC-цепь', notes: 'О работе' });
    expect(s[1]).toMatchObject({ itemId: 'a', figNo: 1, notes: 'Экспонента' });
    expect(s[3]).toMatchObject({ figNo: 3, title: 'Тренажёр' });
    expect(new Set(s.map((x) => x.key)).size).toBe(s.length);
  });

  it('абстракт — вторым слайдом, пустой абстракт пропускается', () => {
    const ga = { headline: 'Главное', steps: [{ label: 'Данные', detail: 'осциллограф' }], takeaway: 'τ = RC', figureId: null };
    const s = buildSlides({ title: 'T', description: '', graphical: ga }, items);
    expect(s[1].kind).toBe('graphical');
    expect(s[1].notes).toBe('Главное\n1. Данные — осциллограф\nτ = RC');
    const empty = buildSlides({ title: 'T', description: '', graphical: { headline: ' ', steps: [], takeaway: '', figureId: null } }, []);
    expect(empty.map((x) => x.kind)).toEqual(['title', 'end']);
  });
});

describe('навигация', () => {
  it('клавиши и кликеры', () => {
    expect(keyAction('ArrowRight')).toBe('next');
    expect(keyAction('PageDown')).toBe('next');
    expect(keyAction('PageUp')).toBe('prev');
    expect(keyAction(' ')).toBe('next');
    expect(keyAction(' ', true)).toBe('prev');
    expect(keyAction('Home')).toBe('first');
    expect(keyAction('End')).toBe('last');
    expect(keyAction('f')).toBe('fullscreen');
    expect(keyAction('а')).toBe('fullscreen'); // русская раскладка
    expect(keyAction('N')).toBe('notes');
    expect(keyAction('g')).toBe('overview');
    expect(keyAction('Escape')).toBe('exit');
    expect(keyAction('x')).toBeNull();
  });

  it('скрытые слайды пропускаются, на краях стоим', () => {
    const hidden = new Set([1, 2]);
    expect(stepSlide(0, 1, 5, hidden)).toBe(3);
    expect(stepSlide(3, -1, 5, hidden)).toBe(0);
    expect(stepSlide(4, 1, 5)).toBe(4);
    expect(stepSlide(0, -1, 5)).toBe(0);
    expect(stepSlide(2, Infinity, 5, new Set([4]))).toBe(3);
    expect(stepSlide(3, -Infinity, 5, new Set([0]))).toBe(1);
    expect(visibleSlides(5, hidden)).toEqual([0, 3, 4]);
  });
});

describe('цитирование', () => {
  it('веб-страница: ГОСТ с датой обращения, APA, BibTeX', () => {
    const c = webCitation({ title: 'RC-цепь', author: 'Иван Петров', url: 'https://t.kz/r/abc', accessed: new Date(2026, 8, 6), updated: '2026-05-01T00:00:00Z' });
    expect(c.gost).toContain('Петров И. RC-цепь');
    expect(c.gost).toContain('URL: https://t.kz/r/abc (дата обращения: 06.09.2026)');
    expect(c.gost).toContain('2026');
    expect(c.apa).toBe('Петров, И. (2026). RC-цепь [Interactive figures]. Tesseract. Retrieved September 6, 2026, from https://t.kz/r/abc');
    expect(c.bibtex).toContain('author       = {Петров, Иван}');
    expect(c.bibtex).toContain('urldate      = {2026-09-06}');
  });

  it('без автора — без пустых инициалов', () => {
    const c = webCitation({ title: '50% & $x_1$', author: '', url: 'https://t.kz/r/x', accessed: new Date(2026, 0, 2) });
    expect(c.gost.startsWith('50% & $x_1$ : ')).toBe(true);
    expect(c.bibtex).not.toContain('author');
    expect(c.bibtex).toContain('50\\% \\& \\$x\\_1\\$');
  });

  it('по DOI: авторы из записи, иначе со страницы; sandbox ведёт на запись', () => {
    const z: ZenodoInfo = { doi: '10.5281/zenodo.1', conceptDoi: null, recordId: 1, url: 'https://sandbox.zenodo.org/records/1', sandbox: true, version: '1', publishedAt: '2025-03-01T00:00:00Z' };
    const c = doiCitation(z, { title: 'Проект', author: 'Иван Петров' });
    expect(c.apa).toContain('Петров, И. (2025). Проект (Version 1)');
    expect(c.bibtex).toContain('doi          = {10.5281/zenodo.1}');
    expect(doiCitation({ ...z, creators: ['Сидоров, Пётр'], title: 'Запись' }, { title: 'Проект', author: 'X' }).gost).toContain('Сидоров П. Запись');
    expect(doiHref(z)).toBe('https://sandbox.zenodo.org/records/1');
    expect(doiHref({ ...z, sandbox: false })).toBe('https://doi.org/10.5281/zenodo.1');
  });
});

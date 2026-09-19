import { describe, expect, it } from 'vitest';
import {
  parseGaps, revealFor, sanitizeBlockBody, stableShuffle, toStudentBody, videoEmbed, type AssignmentPayload,
} from '@/lib/lms/block-schema';
import { autoScore, sanitizeAnswer } from '@/lib/lms/answers';
import { renderMarkup } from '@/lib/lms/markup';

function task(spec: unknown, extra: Record<string, unknown> = {}): AssignmentPayload {
  const body = sanitizeBlockBody('assignment', { prompt: 'Вопрос', points: 10, spec, ...extra });
  if (body.kind !== 'assignment') throw new Error('не задание');
  return body.payload;
}

describe('новые блоки урока', () => {
  it('видео: только поддерживаемые источники, YouTube — без cookies', () => {
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ?t=90')).toEqual({ kind: 'iframe', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90' });
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src).toContain('/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://example.com/a.mp4')).toEqual({ kind: 'file', src: 'https://example.com/a.mp4' });
    expect(videoEmbed('http://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(videoEmbed('javascript:alert(1)')).toBeNull();
    expect(() => sanitizeBlockBody('video', { url: 'https://evil.example/page' })).toThrow();
  });
  it('картинка: загруженный файл или https, остальное — отказ', () => {
    expect(() => sanitizeBlockBody('image', { src: 'javascript:alert(1)' })).toThrow();
    expect(() => sanitizeBlockBody('image', { src: 'http://a.example/x.png' })).toThrow();
    expect(sanitizeBlockBody('image', { src: '/api/lms/assets/3f2b1c9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f' }).kind).toBe('image');
  });
  it('врезка с неизвестным тоном становится заметкой', () => {
    expect(sanitizeBlockBody('callout', { tone: 'neon', body: 'x' })).toEqual({ kind: 'callout', payload: { tone: 'info', title: '', body: 'x' } });
  });
  it('формулы в тексте: TeX не ломает экранирование', () => {
    const html = renderMarkup('Период $a*b*c$ и <script>', (tex) => `[${tex}]`);
    expect(html).toContain('[a*b*c]');
    expect(html).toContain('&lt;script&gt;');
    expect(renderMarkup('$$x^2$$', (tex, display) => `${display}:${tex}`)).toContain('true:x^2');
    expect(renderMarkup('цена $5 и $6')).toContain('$5');
  });
});

describe('новые типы заданий', () => {
  it('пропуски: разбор, частичный балл, ученик не видит ответов', () => {
    const p = task({ type: 'gaps', text: 'Период {{растёт|увеличивается}}, масса {{не влияет}}.' });
    expect(parseGaps('a {{b}} c').parts).toEqual(['a ', ' c']);
    const student = toStudentBody({ kind: 'assignment', payload: p });
    expect(JSON.stringify(student)).not.toContain('растёт');
    expect(autoScore(p, { type: 'gaps', values: ['Увеличивается.', 'влияет'] })).toBe(5);
    expect(autoScore(p, { type: 'gaps', values: ['растет', 'НЕ  влияет'] })).toBe(10);
    expect(() => task({ type: 'gaps', text: 'без пропусков' })).toThrow();
  });
  it('сопоставление: правая колонка перемешана, id не выдают пару', () => {
    const p = task({ type: 'match', pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }, { left: 'C', right: '3' }] });
    if (p.spec.type !== 'match') throw new Error();
    const s = toStudentBody({ kind: 'assignment', payload: p });
    if (s.kind !== 'assignment' || s.payload.spec.type !== 'match') throw new Error();
    expect(s.payload.spec.right.map((r) => r.id)).not.toEqual(p.spec.pairs.map((x) => x.rightId));
    const pairs = Object.fromEntries(p.spec.pairs.map((x) => [x.id, x.rightId]));
    expect(autoScore(p, { type: 'match', pairs })).toBe(10);
    const [a, b, c] = p.spec.pairs;
    expect(autoScore(p, { type: 'match', pairs: { [a.id]: a.rightId, [b.id]: c.rightId, [c.id]: b.rightId } })).toBe(3.33);
    expect(() => sanitizeAnswer(p.spec, { type: 'match', pairs: { [a.id]: a.rightId, [b.id]: a.rightId } })).toThrow();
  });
  it('порядок: перемешан стабильно и не совпадает с верным', () => {
    const p = task({ type: 'order', items: [{ text: 'раз' }, { text: 'два' }, { text: 'три' }] });
    if (p.spec.type !== 'order') throw new Error();
    const shuffled = stableShuffle(p.spec.items);
    expect(shuffled).toEqual(stableShuffle(p.spec.items));
    expect(shuffled.map((i) => i.id)).not.toEqual(p.spec.items.map((i) => i.id));
    expect(autoScore(p, { type: 'order', order: p.spec.items.map((i) => i.id) })).toBe(10);
    expect(() => sanitizeAnswer(p.spec, { type: 'order', order: ['zzz'] })).toThrow();
  });
  it('короткий ответ: регистр и «ё» не важны', () => {
    const p = task({ type: 'short', accepted: ['Дифракция', 'огибание'] });
    expect(autoScore(p, { type: 'short', text: ' дифракция. ' })).toBe(10);
    expect(autoScore(p, { type: 'short', text: 'интерференция' })).toBe(0);
  });
  it('ключ и пояснение уходят ученику только после проверки без пересдачи', () => {
    const once = task({ type: 'short', accepted: ['да'] }, { explanation: 'потому что' });
    const retry = task({ type: 'short', accepted: ['да'] }, { explanation: 'потому что', allowRetry: true });
    expect(JSON.stringify(toStudentBody({ kind: 'assignment', payload: once }))).not.toContain('потому что');
    expect(revealFor(once, { status: 'submitted', score: null })).toBe(false);
    expect(revealFor(once, { status: 'graded', score: 0 })).toBe(true);
    expect(revealFor(retry, { status: 'graded', score: 0 })).toBe(false);
    expect(revealFor(retry, { status: 'graded', score: 10 })).toBe(true);
    expect(JSON.stringify(toStudentBody({ kind: 'assignment', payload: once }, true))).toContain('потому что');
  });
});

describe('волна 2: тренажёр, таблица, контрольная', () => {
  it('пресет тренажёра: только числа, закрытые параметры без повторов', () => {
    const b = sanitizeBlockBody('simulation', { simulationId: null, preset: { 'Длина': '0,6', bad: 'x' }, locked: ['Длина', 'Длина', 5] });
    expect(b).toEqual({ kind: 'simulation', payload: { simulationId: null, caption: '', preset: { 'Длина': 0.6 }, locked: ['Длина'] } });
  });
  it('таблица измерений проверяется учителем, ячейки обрезаются по числу столбцов', () => {
    const p = task({ type: 'table', columns: [{ label: 'x', unit: 'м' }, { label: 'y' }], minRows: 2 }, { rubric: [{ label: 'Вывод', points: 4 }] });
    expect(autoScore(p, { type: 'table', rows: [['1', '2']] })).toBeNull();
    expect(sanitizeAnswer(p.spec, { type: 'table', rows: [['1', '2', '3'], ['4']] })).toEqual({ type: 'table', rows: [['1', '2'], ['4', '']] });
    expect(p.rubric).toEqual([{ id: 'k1', label: 'Вывод', points: 4 }]);
    expect(() => task({ type: 'table', columns: [{ label: 'x' }] })).toThrow();
  });
  it('пока контрольная идёт, проверенная работа выглядит просто сданной', async () => {
    const { toStudentSubmission } = await import('@/lib/lms/answers');
    const sub = { status: 'graded' as const, answer: null, score: 7, comment: 'ок', submittedAt: null };
    expect(toStudentSubmission(sub, true)).toMatchObject({ status: 'submitted', score: null, comment: null });
    expect(toStudentSubmission(sub)).toMatchObject({ status: 'graded', score: 7 });
  });
});

describe('сроки сдачи', () => {
  it('подписи срока для ученика', async () => {
    const { dueLabel } = await import('@/lib/lms/learn');
    const now = new Date('2026-09-19T10:00:00');
    expect(dueLabel('2026-09-19T18:00:00', now)).toMatchObject({ tone: 'soon' });
    expect(dueLabel('2026-09-19T18:00:00', now).text).toContain('сегодня');
    expect(dueLabel('2026-09-20T09:00:00', now).text).toContain('завтра');
    expect(dueLabel('2026-09-18T09:00:00', now)).toMatchObject({ tone: 'late' });
    expect(dueLabel('2026-10-01T09:00:00', now)).toMatchObject({ tone: 'later' });
  });
});

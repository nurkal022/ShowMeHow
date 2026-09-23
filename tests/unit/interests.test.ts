import { describe, it, expect } from 'vitest';
import {
  interestsBrief, interestsEmpty, interestsFilled, INTERESTS_LIMITS, PRESET_TAGS, sanitizeInterests,
} from '@/lib/lms/interests';

describe('санация интересов', () => {
  it('оставляет известные поля и приводит теги к нижнему регистру', () => {
    expect(sanitizeInterests({ tags: [' Футбол ', 'Аниме'], about: '  играю  в  футбол ', dream: 'инженер', style: 'story', junk: 1 }))
      .toEqual({ tags: ['футбол', 'аниме'], about: 'играю в футбол', dream: 'инженер', style: 'story' });
  });

  it('не падает на не-объектах и мусоре внутри тегов', () => {
    for (const bad of [null, undefined, 42, 'футбол', ['футбол']]) {
      expect(sanitizeInterests(bad)).toEqual({ tags: [], about: '', dream: '', style: '' });
    }
    expect(sanitizeInterests({ tags: [1, null, {}, '  ', 'шахматы'] }).tags).toEqual(['шахматы']);
  });

  it('повторы отбрасываются без учёта регистра, лишние теги обрезаются', () => {
    expect(sanitizeInterests({ tags: ['Музыка', 'музыка', 'МУЗЫКА'] }).tags).toEqual(['музыка']);
    const many = sanitizeInterests({ tags: Array.from({ length: 30 }, (_, i) => `тег${i}`) });
    expect(many.tags).toHaveLength(INTERESTS_LIMITS.tags);
  });

  it('длина полей ограничена', () => {
    const long = sanitizeInterests({
      tags: ['я'.repeat(100)], about: 'a'.repeat(1000), dream: 'b'.repeat(500),
    });
    expect(long.tags[0]).toHaveLength(INTERESTS_LIMITS.tag);
    expect(long.about).toHaveLength(INTERESTS_LIMITS.about);
    expect(long.dream).toHaveLength(INTERESTS_LIMITS.dream);
  });

  it('стиль — только из перечисления', () => {
    expect(sanitizeInterests({ style: 'visual' }).style).toBe('visual');
    expect(sanitizeInterests({ style: 'мемами' }).style).toBe('');
  });

  it('пресет тегов достаточно велик и без повторов', () => {
    expect(PRESET_TAGS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(PRESET_TAGS).size).toBe(PRESET_TAGS.length);
  });
});

describe('заполненность профиля интересов', () => {
  const empty = sanitizeInterests({});

  it('пусто — 0, всё заполнено — 100', () => {
    expect(interestsFilled(empty)).toBe(0);
    expect(interestsEmpty(empty)).toBe(true);
    const full = sanitizeInterests({
      tags: ['футбол', 'аниме', 'космос', 'гитара'], about: 'о себе', dream: 'инженер', style: 'practice',
    });
    expect(interestsFilled(full)).toBe(100);
    expect(interestsEmpty(full)).toBe(false);
  });

  it('теги весят больше всего, но выше четырёх не растут', () => {
    expect(interestsFilled(sanitizeInterests({ tags: ['футбол', 'аниме'] }))).toBe(20);
    expect(interestsFilled(sanitizeInterests({ tags: ['футбол', 'аниме', 'космос', 'гитара'] }))).toBe(40);
    expect(interestsFilled(sanitizeInterests({ tags: PRESET_TAGS.slice(0, 10) }))).toBe(40);
  });
});

describe('интересы для промпта', () => {
  it('пустые интересы дают пустую строку', () => {
    expect(interestsBrief(sanitizeInterests({}))).toBe('');
  });

  it('собирает всё, что ученик рассказал', () => {
    const brief = interestsBrief(sanitizeInterests({ tags: ['футбол'], dream: 'врач', style: 'examples' }));
    expect(brief).toContain('увлечения: футбол');
    expect(brief).toContain('хочет стать: врач');
    expect(brief).toContain('на примерах');
  });
});

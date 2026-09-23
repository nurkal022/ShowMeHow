/**
 * Интересы ученика: чем увлекается, кем хочет стать и как ему понятнее объясняют.
 * По ним помощник собирает персональный разбор ошибок — примеры «про него», а не
 * про абстрактные тела на наклонной плоскости. Модуль чистый: форма в профиле
 * считает заполненность и чистит ввод теми же функциями, что и сервер.
 * Запись в базу — в interests-store.ts, туда клиенту нельзя.
 */

export type LearnStyle = 'examples' | 'story' | 'practice' | 'visual' | '';

export interface StudentInterests {
  /** Короткие теги-увлечения: из пресета или свои. */
  tags: string[];
  /** Чем увлекаюсь — свободный текст. */
  about: string;
  /** Кем хочу стать. */
  dream: string;
  /** Как лучше объясняют; пустая строка — не выбрано. */
  style: LearnStyle;
}

export const INTERESTS_LIMITS = { tags: 12, tag: 40, about: 600, dream: 200 } as const;

/** Живые теги на выбор: их достаточно, чтобы собрать профиль в пару кликов. */
export const PRESET_TAGS: readonly string[] = [
  'футбол', 'баскетбол', 'киберспорт', 'аниме', 'музыка', 'гитара', 'танцы', 'кулинария',
  'автомобили', 'космос', 'программирование', 'робототехника', 'дроны', 'животные',
  'рыбалка', 'шахматы', 'рисование', 'фотография', 'видеомонтаж', 'мода', 'путешествия',
  'история', 'медицина', 'бизнес', 'майнкрафт', 'настольные игры', 'велоспорт', 'плавание',
];

/** Подписи стилей объяснения: одни и те же в форме профиля и в промпте помощника. */
export const STYLE_OPTIONS: readonly { value: Exclude<LearnStyle, ''>; label: string; hint: string }[] = [
  { value: 'examples', label: 'На примерах', hint: 'Сначала пример из жизни, потом правило' },
  { value: 'story', label: 'Историей', hint: 'Объяснение как рассказ, с героем и сюжетом' },
  { value: 'practice', label: 'Через практику', hint: 'Сразу пробовать самому, разбор по ходу' },
  { value: 'visual', label: 'Схемами и картинками', hint: 'Рисунок, таблица, схема — и уже потом текст' },
];

const STYLES: readonly string[] = STYLE_OPTIONS.map((s) => s.value);

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Приводит произвольный JSON к интересам: лишнее отбрасывается, а не ломает сохранение. */
export function sanitizeInterests(raw: unknown): StudentInterests {
  const src = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const tags: string[] = [];
  // Теги сравниваем без регистра: «Футбол» и «футбол» — один и тот же интерес.
  const seen = new Set<string>();
  for (const item of Array.isArray(src.tags) ? src.tags : []) {
    const tag = text(item, INTERESTS_LIMITS.tag).toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === INTERESTS_LIMITS.tags) break;
  }
  return {
    tags,
    about: text(src.about, INTERESTS_LIMITS.about),
    dream: text(src.dream, INTERESTS_LIMITS.dream),
    style: typeof src.style === 'string' && STYLES.includes(src.style) ? src.style as LearnStyle : '',
  };
}

/** Есть ли вообще что рассказать помощнику. */
export function interestsEmpty(i: StudentInterests): boolean {
  return i.tags.length === 0 && !i.about && !i.dream && !i.style;
}

/**
 * Насколько заполнен профиль, 0..100. Теги весят больше всего: по ним строятся
 * сюжеты заданий. Четырёх тегов уже достаточно — дальше проценты не растут,
 * чтобы полоса не требовала собрать все двенадцать.
 */
export function interestsFilled(i: StudentInterests): number {
  const tags = (Math.min(i.tags.length, 4) / 4) * 40;
  return Math.round(tags + (i.about ? 25 : 0) + (i.dream ? 15 : 0) + (i.style ? 20 : 0));
}

/** Интересы одной строкой для промпта помощника; пусто — ученик ничего о себе не сказал. */
export function interestsBrief(i: StudentInterests): string {
  const parts: string[] = [];
  if (i.tags.length) parts.push(`увлечения: ${i.tags.join(', ')}`);
  if (i.about) parts.push(`о себе: ${i.about}`);
  if (i.dream) parts.push(`хочет стать: ${i.dream}`);
  const style = STYLE_OPTIONS.find((s) => s.value === i.style);
  if (style) parts.push(`понятнее всего объясняют так — ${style.label.toLowerCase()} (${style.hint.toLowerCase()})`);
  return parts.join('; ');
}

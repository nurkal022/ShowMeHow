import type { Theme } from '../theme';
import { isTheme } from '../theme';

/**
 * Настройки пользователя. Всё поле необязательное: пустой объект — валидные
 * настройки «всё по умолчанию», поэтому старые строки в базе читаются без миграции
 * значений. Неизвестные ключи при записи отбрасываются, чтобы в jsonb не копился мусор.
 */
export interface UserPrefs {
  theme?: Theme;
  /** Режим качества, подставляемый в композер по умолчанию. */
  quality?: 'fast' | 'standard' | 'max';
  /** Уровень объяснения по умолчанию в конструкторе. */
  level?: 'grade7to9' | 'grade10to11' | 'students';
  /** Стиль подачи по умолчанию в конструкторе. */
  style?: 'schematic' | 'realistic' | 'data';
  /** Показывать конструктор вместо пустого поля при открытии мастерской. */
  startWithConstructor?: boolean;
  /** Голосовой ввод в композере. */
  voiceInput?: boolean;
}

const QUALITY = ['fast', 'standard', 'max'];
const LEVEL = ['grade7to9', 'grade10to11', 'students'];
const STYLE = ['schematic', 'realistic', 'data'];

function pickEnum<T extends string>(value: unknown, allowed: string[]): T | undefined {
  return typeof value === 'string' && allowed.includes(value) ? (value as T) : undefined;
}

/**
 * Приводит произвольный JSON к настройкам: оставляет только известные ключи с
 * допустимыми значениями. Возвращает объект, который безопасно писать в базу.
 */
export function sanitizePrefs(raw: unknown): UserPrefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: UserPrefs = {};
  if (isTheme(src.theme)) out.theme = src.theme;
  const quality = pickEnum<'fast' | 'standard' | 'max'>(src.quality, QUALITY);
  if (quality) out.quality = quality;
  const level = pickEnum<'grade7to9' | 'grade10to11' | 'students'>(src.level, LEVEL);
  if (level) out.level = level;
  const style = pickEnum<'schematic' | 'realistic' | 'data'>(src.style, STYLE);
  if (style) out.style = style;
  if (typeof src.startWithConstructor === 'boolean') out.startWithConstructor = src.startWithConstructor;
  if (typeof src.voiceInput === 'boolean') out.voiceInput = src.voiceInput;
  return out;
}

/** Частичное обновление: пришедшие ключи перекрывают старые, остальные сохраняются. */
export function mergePrefs(current: UserPrefs, patch: unknown): UserPrefs {
  return { ...current, ...sanitizePrefs(patch) };
}

export const MAX_DISPLAY_NAME = 60;

/** Пустая строка означает «убрать имя» и превращается в null. */
export function sanitizeDisplayName(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_DISPLAY_NAME);
}

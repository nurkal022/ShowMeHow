/**
 * Настройки организации (organizations.settings). Белый список по образцу
 * sanitizePrefs: неизвестные ключи и неверные значения не попадают в базу.
 * Модуль чистый — без базы.
 */
export interface OrgSettings {
  /** Ученики этой организации могут генерировать. */
  studentsCanGenerate: boolean;
  /** Ученикам — обычные 30-дневные сессии вместо 12-часовых. */
  studentLongSessions: boolean;
  /** Лимит генераций учителя за всё время. */
  teacherGenerationLimit: number;
}

/** То, что хранится в jsonb: только явно заданные ключи. */
export type StoredOrgSettings = Partial<OrgSettings>;

export const DEFAULT_ORG_SETTINGS: Readonly<OrgSettings> = Object.freeze({
  studentsCanGenerate: false,
  studentLongSessions: false,
  teacherGenerationLimit: 100,
});

export const ORG_SETTING_KEYS = ['studentsCanGenerate', 'studentLongSessions', 'teacherGenerationLimit'] as const;
export type OrgSettingKey = (typeof ORG_SETTING_KEYS)[number];

export const MAX_TEACHER_GENERATION_LIMIT = 100000;

export function sanitizeOrgSettings(raw: unknown): StoredOrgSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: StoredOrgSettings = {};
  if (typeof src.studentsCanGenerate === 'boolean') out.studentsCanGenerate = src.studentsCanGenerate;
  if (typeof src.studentLongSessions === 'boolean') out.studentLongSessions = src.studentLongSessions;
  const limit = src.teacherGenerationLimit;
  if (typeof limit === 'number' && Number.isInteger(limit)
    && limit >= 0 && limit <= MAX_TEACHER_GENERATION_LIMIT) {
    out.teacherGenerationLimit = limit;
  }
  return out;
}

/** Частичное обновление: пришедшие ключи перекрывают старые, остальные сохраняются. */
export function mergeOrgSettings(current: unknown, patch: unknown): StoredOrgSettings {
  return { ...sanitizeOrgSettings(current), ...sanitizeOrgSettings(patch) };
}

/** Полные настройки для проверок прав: хранимое поверх значений по умолчанию. */
export function resolveOrgSettings(stored: unknown): OrgSettings {
  return { ...DEFAULT_ORG_SETTINGS, ...sanitizeOrgSettings(stored) };
}

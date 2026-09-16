import type { AuthUser } from '../auth/users';
import type { Membership } from './types';

/**
 * Кто что может — как чистые функции от пользователя и его членств.
 * Членства приходят из listMemberships (архивные организации туда не попадают).
 * Модуль без базы: его зовут роуты, layout и юнит-тесты.
 */

export const TRIAL_LIMIT = 10;

export const GENERATION_FORBIDDEN_MESSAGE = 'Генерация недоступна для учеников вашей организации.';

export type SessionKind = 'long' | 'short';

export type NavSectionKey = 'create' | 'library' | 'labs';

export interface NavSection {
  key: NavSectionKey;
  href: string;
  label: string;
}

/**
 * Только разделы, у которых уже есть страницы. Следующие циклы добавляют сюда
 * «Курсы», «Преподавание» и прочие вместе со своими страницами.
 */
export const ALL_NAV_SECTIONS: readonly NavSection[] = [
  { key: 'create', href: '/', label: 'Создать' },
  { key: 'library', href: '/library', label: 'Библиотека' },
  { key: 'labs', href: '/labs', label: 'Лаборатории' },
];

type PolicyUser = Pick<AuthUser, 'role'>;

export function isPlatformAdmin(user: PolicyUser): boolean {
  return user.role === 'admin';
}

function isStaff(m: Membership): boolean {
  return m.role === 'teacher' || m.role === 'org_admin';
}

/** Есть ли членство учителя или админа организации (org_admin включает права учителя). */
export function hasStaffRole(memberships: Membership[]): boolean {
  return memberships.some(isStaff);
}

export function canGenerate(user: PolicyUser, memberships: Membership[]): boolean {
  if (isPlatformAdmin(user)) return true;
  if (memberships.length === 0) return true;
  if (hasStaffRole(memberships)) return true;
  // Остались только ученические членства: разрешает любая организация.
  return memberships.some((m) => m.settings.studentsCanGenerate);
}

export function sessionKind(user: PolicyUser, memberships: Membership[]): SessionKind {
  if (isPlatformAdmin(user)) return 'long';
  if (hasStaffRole(memberships)) return 'long';
  if (!memberships.some((m) => m.role === 'student')) return 'long';
  if (memberships.some((m) => m.settings.studentLongSessions)) return 'long';
  return 'short';
}

/** null — без лимита. Учителю — наибольший лимит среди организаций, где он учитель или админ. */
export function generationLimit(user: PolicyUser, memberships: Membership[]): number | null {
  if (isPlatformAdmin(user)) return null;
  const staff = memberships.filter(isStaff);
  if (staff.length === 0) return TRIAL_LIMIT;
  return Math.max(...staff.map((m) => m.settings.teacherGenerationLimit));
}

export function navSections(user: PolicyUser, memberships: Membership[]): NavSection[] {
  const allowCreate = canGenerate(user, memberships);
  return ALL_NAV_SECTIONS.filter((s) => s.key !== 'create' || allowCreate);
}

/**
 * Куда отправить с «/» (там форма генерации). Ученик без права генерации
 * попадает в библиотеку: навигация раздел «Создать» ему уже не показывает.
 * null — остаться на «/». Библиотека сама никуда не переадресует, петли нет.
 */
export function homeRedirect(user: PolicyUser, memberships: Membership[]): string | null {
  return canGenerate(user, memberships) ? null : '/library';
}

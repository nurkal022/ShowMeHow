import type { AuthUser } from '../auth/users';
import type { Membership, OrgRole } from './types';

/**
 * Кто что может — как чистые функции от пользователя и его членств.
 * Членства приходят из listMemberships (архивные организации туда не попадают).
 * Модуль без базы: его зовут роуты, layout и юнит-тесты.
 */

export const TRIAL_LIMIT = 10;

export const GENERATION_FORBIDDEN_MESSAGE = 'Генерация недоступна для учеников вашей организации.';

export type SessionKind = 'long' | 'short';

export type NavSectionKey = 'teach' | 'create' | 'library' | 'labs' | 'org' | 'admin';

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
  { key: 'teach', href: '/teach', label: 'Преподавание' },
  { key: 'create', href: '/', label: 'Создать' },
  { key: 'library', href: '/library', label: 'Библиотека' },
  { key: 'labs', href: '/labs', label: 'Лаборатории' },
  { key: 'org', href: '/org', label: 'Организация' },
  { key: 'admin', href: '/admin', label: 'Админка' },
];

/**
 * Гостю (без сессии) видна только «Лаборатории» — их список открыт без входа.
 * «Создать» и «Библиотека» ведут на страницы, закрытые логином.
 */
export const GUEST_NAV_SECTIONS: readonly NavSection[] = ALL_NAV_SECTIONS.filter((s) => s.key === 'labs');

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
  // «Курсы» ученика появятся вместе со страницами /learn.
  const visible: Record<NavSectionKey, boolean> = {
    teach: hasStaffRole(memberships),
    create: canGenerate(user, memberships),
    library: true,
    labs: true,
    org: memberships.some((m) => m.role === 'org_admin'),
    admin: isPlatformAdmin(user),
  };
  return ALL_NAV_SECTIONS.filter((s) => visible[s.key]);
}

/**
 * Куда отправить с «/» (там форма генерации). Ученик без права генерации
 * попадает в библиотеку: навигация раздел «Создать» ему уже не показывает.
 * null — остаться на «/». Библиотека сама никуда не переадресует, петли нет.
 */
export function homeRedirect(user: PolicyUser, memberships: Membership[]): string | null {
  return canGenerate(user, memberships) ? null : '/library';
}

/** org_admin включает права учителя — то же правило, что в requireOrgRole. */
export function roleSatisfies(role: OrgRole, allowed: readonly OrgRole[]): boolean {
  return allowed.includes(role) || (role === 'org_admin' && allowed.includes('teacher'));
}

/**
 * Организация кабинета из членств: слаг из ?org=, без него — первая подходящая
 * (членства уже отсортированы по названию). Чужой слаг — null, страница ответит 404.
 */
export function pickMembership(
  memberships: Membership[], allowed: readonly OrgRole[], slug: string | undefined,
): Membership | null {
  const fit = memberships.filter((m) => roleSatisfies(m.role, allowed));
  if (slug) return fit.find((m) => m.orgSlug === slug) ?? null;
  return fit[0] ?? null;
}

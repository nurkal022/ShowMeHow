import type { AuthUser } from '../auth/users';
import { isPlatformAdmin, roleSatisfies } from '../org/policy';
import type { Membership, OrgRole } from '../org/types';

/**
 * Меню оболочки кабинетов — чистая функция от пользователя и его членств.
 * Меню ничего не разрешает: права по-прежнему проверяет каждая страница,
 * здесь решается только, какие пункты показать.
 */

/** Ключ localStorage: свёрнута ли боковая панель. */
export const SIDEBAR_KEY = 'tesseract-cabinet-sidebar';

export type CabinetIcon =
  | 'dashboard' | 'orgs' | 'users' | 'catalog' | 'log'
  | 'teachers' | 'groups' | 'settings' | 'courses' | 'plus' | 'review' | 'report' | 'risk' | 'ask';

export type CabinetGroupKey = 'platform' | 'org' | 'teach';

export interface CabinetMenuItem {
  href: string;
  label: string;
  icon: CabinetIcon;
  exact?: boolean;
  /** Действие, а не раздел: рисуется кнопкой и не подсвечивается как активное. */
  action?: boolean;
}

export interface CabinetMenuGroup {
  key: CabinetGroupKey;
  title: string;
  items: CabinetMenuItem[];
  /** Пункты живут внутри организации: в ссылки едет ?org=. */
  orgScoped: boolean;
  /**
   * Группа видна, только пока в адресе есть ?org=: так админ платформы, пришедший
   * по ссылке из админки в чужую организацию, получает её меню, а без выбора — нет.
   */
  needsOrgParam: boolean;
}

export interface CabinetOrgChoice { slug: string; name: string; role: OrgRole }

export interface CabinetMenu {
  groups: CabinetMenuGroup[];
  /** Организации, где человек учитель или админ: переключатель в боковой панели. */
  orgs: CabinetOrgChoice[];
}

const PLATFORM_ITEMS: CabinetMenuItem[] = [
  { href: '/admin', label: 'Обзор', icon: 'dashboard', exact: true },
  { href: '/admin/orgs', label: 'Организации', icon: 'orgs' },
  { href: '/admin/users', label: 'Пользователи', icon: 'users' },
  { href: '/admin/catalog', label: 'Каталог', icon: 'catalog' },
  { href: '/admin/log', label: 'Журнал', icon: 'log' },
  { href: '/admin/settings', label: 'Настройки', icon: 'settings' },
];

const ORG_ITEMS: CabinetMenuItem[] = [
  { href: '/org', label: 'Обзор', icon: 'dashboard', exact: true },
  { href: '/org/reports', label: 'Отчёт недели', icon: 'report' },
  { href: '/org/risk', label: 'Риски', icon: 'risk' },
  { href: '/org/ask', label: 'Спросить ИИ', icon: 'ask' },
  { href: '/org/teachers', label: 'Учителя', icon: 'teachers' },
  { href: '/org/groups', label: 'Группы', icon: 'groups' },
  { href: '/org/settings', label: 'Настройки', icon: 'settings' },
];

const TEACH_ITEMS: CabinetMenuItem[] = [
  { href: '/teach', label: 'Сегодня', icon: 'dashboard', exact: true },
  { href: '/teach/courses', label: 'Курсы', icon: 'courses' },
  { href: '/teach/groups', label: 'Группы', icon: 'groups' },
  { href: '/teach/review', label: 'Проверка', icon: 'review' },
];

export function buildCabinetMenu(user: Pick<AuthUser, 'role'>, memberships: Membership[]): CabinetMenu {
  const admin = isPlatformAdmin(user);
  const orgAdmin = memberships.some((m) => m.role === 'org_admin');
  const staff = memberships.some((m) => roleSatisfies(m.role, ['teacher']));
  const groups: CabinetMenuGroup[] = [];
  if (admin) groups.push({ key: 'platform', title: 'Платформа', items: PLATFORM_ITEMS, orgScoped: false, needsOrgParam: false });
  if (orgAdmin || admin) groups.push({ key: 'org', title: 'Организация', items: ORG_ITEMS, orgScoped: true, needsOrgParam: !orgAdmin });
  if (staff || admin) groups.push({ key: 'teach', title: 'Преподавание', items: TEACH_ITEMS, orgScoped: true, needsOrgParam: !staff });
  const orgs = memberships
    .filter((m) => roleSatisfies(m.role, ['teacher']))
    .map((m) => ({ slug: m.orgSlug, name: m.orgName, role: m.role }));
  return { groups, orgs };
}

/** Какая роль нужна разделу: в «Организацию» учителя не пускают. */
export function groupAllows(key: CabinetGroupKey, role: OrgRole): boolean {
  if (key === 'org') return role === 'org_admin';
  if (key === 'teach') return roleSatisfies(role, ['teacher']);
  return true;
}

/* ------------------------------ хлебные крошки ----------------------------- */

export interface Crumb { href: string; label: string }

const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Платформа', orgs: 'Организации', users: 'Пользователи', catalog: 'Каталог', log: 'Журнал',
  org: 'Организация', teachers: 'Учителя', groups: 'Группы', settings: 'Настройки', credentials: 'Лист паролей',
  teach: 'Преподавание', account: 'Профиль', courses: 'Курсы', review: 'Проверка', generate: 'Курс из программы', debrief: 'Разбор', reports: 'Отчёт недели', risk: 'Риски', ask: 'Спросить ИИ', journal: 'Журнал', progress: 'Прогресс', answers: 'Ответы', analytics: 'Аналитика',
};

/** Подпись сегмента-идентификатора — по тому, что стоит перед ним. */
const ID_LABELS: Record<string, string> = {
  orgs: 'Организация', users: 'Пользователь', groups: 'Группа', courses: 'Курс', answers: 'Задание', students: 'Ученик',
};

/** Сегменты без собственной страницы: в крошки не попадают. */
const SKIPPED = new Set(['students']);

export function breadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  parts.forEach((part, i) => {
    if (SKIPPED.has(part) && i > 0) return;
    const href = `/${parts.slice(0, i + 1).join('/')}`;
    // «settings» внутри курса — страница «О курсе», у организации — её настройки.
    const label = part === 'settings' && parts[i - 2] === 'courses' ? 'О курсе'
      : SEGMENT_LABELS[part] ?? ID_LABELS[parts[i - 1] ?? ''] ?? part;
    crumbs.push({ href, label });
  });
  return crumbs;
}

import type { AuthUser } from './auth/users';
import type { Membership } from './org/types';
import { withOrgParam } from './lms/links';

export interface PaletteAction { id: string; title: string; subtitle: string; href: string; keywords: string }

/** Быстрые действия ⌘K — только то, что человеку доступно по его ролям. */
export function paletteActions(user: AuthUser, memberships: Membership[]): PaletteAction[] {
  const out: PaletteAction[] = [];
  const staff = memberships.filter((m) => m.role !== 'student');
  const admin = memberships.find((m) => m.role === 'org_admin');
  const student = memberships.some((m) => m.role === 'student');
  if (staff[0]) {
    const org = staff[0].orgSlug;
    out.push({ id: 'new-course', title: 'Создать курс', subtitle: 'Преподавание', href: withOrgParam('/teach?new=1', org), keywords: 'новый курс урок' });
    out.push({ id: 'teach', title: 'Мои курсы', subtitle: 'Преподавание', href: withOrgParam('/teach', org), keywords: 'курсы преподавание журнал' });
  }
  if (admin) {
    out.push({ id: 'groups', title: 'Группы и ученики', subtitle: admin.orgName, href: withOrgParam('/org/groups', admin.orgSlug), keywords: 'классы ученики пароли' });
    out.push({ id: 'add-teacher', title: 'Добавить учителя', subtitle: admin.orgName, href: withOrgParam('/org/teachers?add=1', admin.orgSlug), keywords: 'учитель пригласить' });
  }
  if (student) {
    out.push({ id: 'learn', title: 'Сегодня', subtitle: 'Мои курсы и сроки', href: '/learn', keywords: 'курсы сдать сроки главная' });
    out.push({ id: 'grades', title: 'Мои оценки', subtitle: 'Все курсы', href: '/learn/grades', keywords: 'баллы оценки журнал' });
  }
  if (!student || memberships.some((m) => m.settings.studentsCanGenerate)) {
    out.push({ id: 'create', title: 'Новая симуляция', subtitle: 'Сгенерировать по описанию', href: '/', keywords: 'создать генерация тренажёр' });
    out.push({ id: 'library', title: 'Библиотека', subtitle: 'Мои симуляции', href: '/library', keywords: 'симуляции тренажёры' });
  }
  out.push({ id: 'labs', title: 'Лаборатории', subtitle: 'VR-сцены', href: '/labs', keywords: 'vr очки лаборатория' });
  out.push({ id: 'profile', title: 'Профиль и настройки', subtitle: 'Пароль, тема, предпочтения', href: '/profile', keywords: 'пароль тема настройки' });
  if (user.role === 'admin') {
    out.push({ id: 'admin', title: 'Админка', subtitle: 'Платформа', href: '/admin', keywords: 'админ организации пользователи' });
    out.push({ id: 'admin-settings', title: 'Настройки платформы', subtitle: 'Регистрация и расход', href: '/admin/settings', keywords: 'регистрация токены расход' });
  }
  return out;
}

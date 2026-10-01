import type { AuthUser } from './auth/users';
import type { Membership } from './org/types';
import { withOrgParam } from './lms/links';
import { translator } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import { app } from '@/i18n/messages/app';

export interface PaletteAction { id: string; title: string; subtitle: string; href: string; keywords: string }

/** Быстрые действия ⌘K — только то, что человеку доступно по его ролям. Подписи — на языке интерфейса. */
export function paletteActions(user: AuthUser, memberships: Membership[], locale: Locale = 'ru'): PaletteAction[] {
  const t = translator(app, locale);
  const out: PaletteAction[] = [];
  const staff = memberships.filter((m) => m.role !== 'student');
  const admin = memberships.find((m) => m.role === 'org_admin');
  const student = memberships.some((m) => m.role === 'student');
  if (staff[0]) {
    const org = staff[0].orgSlug;
    out.push({ id: 'new-course', title: t('aNewCourse'), subtitle: t('aTeaching'), href: withOrgParam('/teach/courses?new=1', org), keywords: t('aNewCourseKw') });
    out.push({ id: 'teach', title: t('aMyCourses'), subtitle: t('aTeaching'), href: withOrgParam('/teach/courses', org), keywords: t('aMyCoursesKw') });
    out.push({ id: 'teach-groups', title: t('aMyGroups'), subtitle: t('aTeaching'), href: withOrgParam('/teach/groups', org), keywords: t('aMyGroupsKw') });
    out.push({ id: 'teach-review', title: t('aReview'), subtitle: t('aTeaching'), href: withOrgParam('/teach/review', org), keywords: t('aReviewKw') });
  }
  if (admin) {
    out.push({ id: 'groups', title: t('aGroups'), subtitle: admin.orgName, href: withOrgParam('/org/groups', admin.orgSlug), keywords: t('aGroupsKw') });
    out.push({ id: 'add-teacher', title: t('aAddTeacher'), subtitle: admin.orgName, href: withOrgParam('/org/teachers?add=1', admin.orgSlug), keywords: t('aAddTeacherKw') });
  }
  if (student) {
    out.push({ id: 'learn', title: t('aToday'), subtitle: t('aTodaySub'), href: '/learn', keywords: t('aTodayKw') });
    out.push({ id: 'grades', title: t('aGrades'), subtitle: t('aGradesSub'), href: '/learn/grades', keywords: t('aGradesKw') });
  }
  if (!student || memberships.some((m) => m.settings.studentsCanGenerate)) {
    out.push({ id: 'create', title: t('aNewSim'), subtitle: t('aNewSimSub'), href: '/', keywords: t('aNewSimKw') });
    out.push({ id: 'research', title: t('aResearch'), subtitle: t('aResearchSub'), href: '/research', keywords: t('aResearchKw') });
    out.push({ id: 'library', title: t('aLibrary'), subtitle: t('aLibrarySub'), href: '/library', keywords: t('aLibraryKw') });
  }
  out.push({ id: 'labs', title: t('aLabs'), subtitle: t('aLabsSub'), href: '/labs', keywords: t('aLabsKw') });
  out.push({ id: 'profile', title: t('aProfile'), subtitle: t('aProfileSub'), href: '/profile', keywords: t('aProfileKw') });
  if (user.role === 'admin') {
    out.push({ id: 'admin', title: t('aAdmin'), subtitle: t('aAdminSub'), href: '/admin', keywords: t('aAdminKw') });
    out.push({ id: 'admin-settings', title: t('aAdminSettings'), subtitle: t('aAdminSettingsSub'), href: '/admin/settings', keywords: t('aAdminSettingsKw') });
  }
  return out;
}

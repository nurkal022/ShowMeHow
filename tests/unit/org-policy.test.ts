import { describe, it, expect } from 'vitest';
import {
  navSections, homeRedirect, canGenerate, sessionKind, generationLimit, hasStaffRole, isPlatformAdmin,
  ALL_NAV_SECTIONS, TRIAL_LIMIT,
} from '@/lib/org/policy';
import { resolveOrgSettings, type OrgSettings } from '@/lib/org/settings';
import type { Membership, OrgRole } from '@/lib/org/types';

const USER = { role: 'user' as const };
const ADMIN = { role: 'admin' as const };

function member(role: OrgRole, settings: Partial<OrgSettings> = {}, orgId = 'o1'): Membership {
  return {
    orgId, orgSlug: orgId, orgName: `Организация ${orgId}`, orgKind: 'school',
    role, settings: resolveOrgSettings(settings),
  };
}

describe('право на генерацию', () => {
  it('платформенный админ — да, даже если он только ученик', () => {
    expect(canGenerate(ADMIN, [member('student')])).toBe(true);
  });
  it('без членств — да', () => {
    expect(canGenerate(USER, [])).toBe(true);
  });
  it('учитель или админ организации — да', () => {
    expect(canGenerate(USER, [member('teacher')])).toBe(true);
    expect(canGenerate(USER, [member('org_admin')])).toBe(true);
    expect(canGenerate(USER, [member('student', {}, 'o1'), member('teacher', {}, 'o2')])).toBe(true);
  });
  it('только ученик — нет, пока ни одна организация не разрешила', () => {
    expect(canGenerate(USER, [member('student')])).toBe(false);
    expect(canGenerate(USER, [member('student', {}, 'o1'), member('student', {}, 'o2')])).toBe(false);
  });
  it('ученик двух организаций с разными настройками — разрешает любая', () => {
    expect(canGenerate(USER, [
      member('student', { studentsCanGenerate: false }, 'o1'),
      member('student', { studentsCanGenerate: true }, 'o2'),
    ])).toBe(true);
  });
});

describe('лимит генераций', () => {
  it('платформенный админ — без лимита', () => {
    expect(generationLimit(ADMIN, [member('teacher')])).toBeNull();
  });
  it('без членств и ученик — пробные 10', () => {
    expect(TRIAL_LIMIT).toBe(10);
    expect(generationLimit(USER, [])).toBe(10);
    expect(generationLimit(USER, [member('student', { studentsCanGenerate: true })])).toBe(10);
  });
  it('учитель — лимит организации, по умолчанию 100', () => {
    expect(generationLimit(USER, [member('teacher')])).toBe(100);
    expect(generationLimit(USER, [member('org_admin', { teacherGenerationLimit: 7 })])).toBe(7);
  });
  it('учитель нескольких организаций — наибольший лимит среди них', () => {
    expect(generationLimit(USER, [
      member('teacher', { teacherGenerationLimit: 20 }, 'o1'),
      member('org_admin', { teacherGenerationLimit: 300 }, 'o2'),
      member('student', { teacherGenerationLimit: 5000 }, 'o3'),
    ])).toBe(300);
  });
});

describe('тип сессии', () => {
  it('платформенный админ — всегда обычная', () => {
    expect(sessionKind(ADMIN, [member('student')])).toBe('long');
  });
  it('без членств — обычная', () => {
    expect(sessionKind(USER, [])).toBe('long');
  });
  it('только ученик — короткая', () => {
    expect(sessionKind(USER, [member('student')])).toBe('short');
  });
  it('ученик и учитель одновременно — обычная', () => {
    expect(sessionKind(USER, [member('student', {}, 'o1'), member('teacher', {}, 'o2')])).toBe('long');
    expect(sessionKind(USER, [member('student', {}, 'o1'), member('org_admin', {}, 'o2')])).toBe('long');
  });
  it('организация включила длинные сессии ученикам — обычная', () => {
    expect(sessionKind(USER, [
      member('student', {}, 'o1'), member('student', { studentLongSessions: true }, 'o2'),
    ])).toBe('long');
  });
});

describe('разделы навигации', () => {
  const keys = (s: { key: string }[]) => s.map((x) => x.key);

  it('полный список — Создать, Библиотека, Лаборатории', () => {
    expect(ALL_NAV_SECTIONS.map((s) => [s.key, s.href, s.label])).toEqual([
      ['create', '/', 'Создать'],
      ['library', '/library', 'Библиотека'],
      ['labs', '/labs', 'Лаборатории'],
    ]);
  });
  it('без членств, учитель и админ видят все три', () => {
    expect(keys(navSections(USER, []))).toEqual(['create', 'library', 'labs']);
    expect(keys(navSections(USER, [member('teacher')]))).toEqual(['create', 'library', 'labs']);
    expect(keys(navSections(ADMIN, [member('student')]))).toEqual(['create', 'library', 'labs']);
  });
  it('ученик без права генерации не видит «Создать»', () => {
    expect(keys(navSections(USER, [member('student')]))).toEqual(['library', 'labs']);
    expect(keys(navSections(USER, [member('student', { studentsCanGenerate: true })])))
      .toEqual(['create', 'library', 'labs']);
  });
});

describe('посадочная страница «/»', () => {
  it('без права генерации — в библиотеку', () => {
    expect(homeRedirect(USER, [member('student')])).toBe('/library');
  });
  it('с правом генерации — остаёмся на «/»', () => {
    expect(homeRedirect(USER, [])).toBeNull();
    expect(homeRedirect(USER, [member('teacher')])).toBeNull();
    expect(homeRedirect(ADMIN, [member('student')])).toBeNull();
    expect(homeRedirect(USER, [member('student', { studentsCanGenerate: true })])).toBeNull();
  });
  it('цель переадресации — видимый раздел, отличный от «/», петли нет', () => {
    const memberships = [member('student')];
    const target = homeRedirect(USER, memberships);
    expect(target).not.toBe('/');
    expect(navSections(USER, memberships).map((s) => s.href)).toContain(target);
  });
});

describe('вспомогательные', () => {
  it('hasStaffRole и isPlatformAdmin', () => {
    expect(hasStaffRole([])).toBe(false);
    expect(hasStaffRole([member('student')])).toBe(false);
    expect(hasStaffRole([member('teacher')])).toBe(true);
    expect(isPlatformAdmin(ADMIN)).toBe(true);
    expect(isPlatformAdmin(USER)).toBe(false);
  });
});

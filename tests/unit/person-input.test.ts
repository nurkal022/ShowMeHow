import { describe, it, expect } from 'vitest';
import { parsePersonInput } from '@/lib/org/person-input';
import { pickMembership, roleSatisfies } from '@/lib/org/policy';
import { resolveOrgSettings } from '@/lib/org/settings';
import { ORG_KIND_LABELS, ORG_ROLE_LABELS, type Membership, type OrgRole } from '@/lib/org/types';

describe('почта или логин и имя', () => {
  it('почта нормализуется, имя необязательно', () => {
    expect(parsePersonInput({ email: ' Teacher@Example.com ', displayName: ' Анна  Петровна ' }))
      .toEqual({ kind: 'email', email: 'teacher@example.com', displayName: 'Анна Петровна' });
    expect(parsePersonInput({ email: 'a@b.cd' })).toEqual({ kind: 'email', email: 'a@b.cd', displayName: null });
    expect(parsePersonInput({ email: 'не почта' })).toEqual({ error: 'Почта указана неверно.' });
  });
  it('логин требует имя и проходит правило логина', () => {
    expect(parsePersonInput({ login: 'Director.Sch12', displayName: 'Директор' }))
      .toEqual({ kind: 'login', login: 'director.sch12', displayName: 'Директор' });
    expect(parsePersonInput({ login: 'director.sch12' }))
      .toEqual({ error: 'Для входа по логину укажите имя человека.' });
    expect(parsePersonInput({ login: 'ab', displayName: 'x' })).toEqual({ error:
      'Логин может содержать только строчные латинские буквы, цифры, точку, дефис и подчёркивание, от 3 до 40 символов.' });
  });
  it('пустой ввод и длинное имя', () => {
    expect(parsePersonInput({})).toEqual({ error: 'Укажите почту или логин.' });
    expect(parsePersonInput(null)).toEqual({ error: 'Укажите почту или логин.' });
    expect(parsePersonInput({ email: 'a@b.cd', displayName: 'я'.repeat(121) }))
      .toEqual({ error: 'Имя — не длиннее 120 символов.' });
  });
});

describe('выбор организации кабинета', () => {
  const m = (role: OrgRole, slug: string): Membership => ({
    orgId: slug, orgSlug: slug, orgName: slug, orgKind: 'school', role, settings: resolveOrgSettings({}),
  });
  const all = [m('student', 'a'), m('teacher', 'b'), m('org_admin', 'c')];

  it('org_admin включает права учителя', () => {
    expect(roleSatisfies('org_admin', ['teacher'])).toBe(true);
    expect(roleSatisfies('teacher', ['org_admin'])).toBe(false);
    expect(roleSatisfies('student', ['teacher'])).toBe(false);
  });
  it('без слага — первая подходящая, со слагом — только она', () => {
    expect(pickMembership(all, ['teacher'], undefined)?.orgSlug).toBe('b');
    expect(pickMembership(all, ['teacher'], 'c')?.orgSlug).toBe('c');
    expect(pickMembership(all, ['teacher'], 'a')).toBeNull();
    expect(pickMembership(all, ['org_admin'], 'zzz')).toBeNull();
    expect(pickMembership([], ['teacher'], undefined)).toBeNull();
  });
  it('подписи ролей и типов', () => {
    expect(ORG_ROLE_LABELS.teacher).toBe('учитель');
    expect(ORG_KIND_LABELS.school).toBe('Школа');
  });
});

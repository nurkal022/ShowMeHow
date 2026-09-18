import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markup from '@/components/lms/Markup';
import { Stat, StatGrid } from '@/components/cabinet/Stat';
import StatusPill, { personStatus } from '@/components/cabinet/StatusPill';
import { isCabinetItemActive } from '@/components/cabinet/CabinetNav';
import { personPayload, EMPTY_PERSON } from '@/components/cabinet/PersonFields';
import { siteFromHeaders } from '@/lib/http/site';

describe('общие кусочки кабинетов', () => {
  it('Markup экранирует ввод', () => {
    const html = renderToStaticMarkup(createElement(Markup, { text: '**жирный** <script>alert(1)</script>' }));
    expect(html).toContain('<strong>жирный</strong>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('class="markup"');
  });
  it('Stat и StatusPill', () => {
    const html = renderToStaticMarkup(createElement(StatGrid, null, createElement(Stat, { value: 12, label: 'учеников' })));
    expect(html).toBe('<div class="stat-grid"><div class="stat"><strong>12</strong><span>учеников</span></div></div>');
    expect(renderToStaticMarkup(createElement(StatusPill, { tone: 'ok', children: 'активен' })))
      .toBe('<span class="status-pill ok">активен</span>');
    expect(personStatus({ disabled: true, mustChangePassword: true })).toEqual({ tone: 'danger', label: 'заблокирован' });
    expect(personStatus({ disabled: false, mustChangePassword: true })).toEqual({ tone: 'warn', label: 'ждёт смены пароля' });
    expect(personStatus({ disabled: false, mustChangePassword: false })).toEqual({ tone: 'ok', label: 'активен' });
  });
  it('активный пункт подменю', () => {
    expect(isCabinetItemActive({ href: '/org', label: 'Обзор', exact: true }, '/org')).toBe(true);
    expect(isCabinetItemActive({ href: '/org', label: 'Обзор', exact: true }, '/org/groups')).toBe(false);
    expect(isCabinetItemActive({ href: '/org/groups', label: 'Группы' }, '/org/groups/1')).toBe(true);
    expect(isCabinetItemActive({ href: '/org/groups', label: 'Группы' }, '/org/groupsx')).toBe(false);
  });
  it('тело «почта или логин»', () => {
    expect(personPayload({ ...EMPTY_PERSON, email: 'a@b.cd', login: 'x', displayName: 'Анна' }))
      .toEqual({ email: 'a@b.cd', displayName: 'Анна' });
    expect(personPayload({ ...EMPTY_PERSON, by: 'login', email: 'a@b.cd', login: 'zavuch', displayName: 'Завуч' }))
      .toEqual({ login: 'zavuch', displayName: 'Завуч' });
  });
  it('адрес сайта для листа паролей', () => {
    const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;
    expect(siteFromHeaders(headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
    expect(siteFromHeaders(headers({ host: 'x', 'x-forwarded-host': 'school.example, proxy', 'x-forwarded-proto': 'https,http' })))
      .toBe('https://school.example');
  });
});

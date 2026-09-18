import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionsTable, CatalogTable, OrgsTable, PeopleTable, UsersTable } from '@/components/admin/AdminTables';
import { resolveOrgSettings } from '@/lib/org/settings';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('таблицы админки', () => {
  it('организации: ссылка на карточку, тип словом, архив', () => {
    const html = render(createElement(OrgsTable, { orgs: [{
      id: 'o1', slug: 'sch12', name: 'Школа №12', kind: 'school', settings: resolveOrgSettings({}),
      archivedAt: '2026-09-01T00:00:00.000Z', memberCount: 3, createdAt: '2026-09-01T00:00:00.000Z',
    }] }));
    expect(html).toContain('href="/admin/orgs/o1"');
    expect(html).toContain('Школа');
    expect(html).toContain('data-label="Слаг"');
    expect(html).toContain('в архиве');
  });
  it('пользователи: вход, роль и статус', () => {
    const html = render(createElement(UsersTable, { users: [{
      id: 'u1', email: null, login: 'ivanov.i.sch12', displayName: 'Иванов Иван', role: 'admin',
      disabled: true, mustChangePassword: false, createdAt: '2026-09-01T00:00:00.000Z',
    }] }));
    expect(html).toContain('href="/admin/users/u1"');
    expect(html).toContain('ivanov.i.sch12');
    expect(html).toContain('админ платформы');
    expect(html).toContain('заблокирован');
  });
  it('журнал и каталог; пустые списки объясняют, что дальше', () => {
    const log = render(createElement(ActionsTable, { actions: [{
      id: '1', actorLabel: 'boss@example.com', action: 'org.create', target: 'sch12', payload: {}, at: '2026-09-01T00:00:00.000Z',
    }] }));
    expect(log).toContain('создал организацию');
    expect(render(createElement(ActionsTable, { actions: [] }))).toContain('Действий пока не было.');
    expect(render(createElement(CatalogTable, { items: [] }))).toContain('Симуляций не нашлось.');
    const cat = render(createElement(CatalogTable, { items: [{
      id: 's1', title: 'Маятник', subject: 'Физика', ownerId: 'u1', ownerLabel: 'teacher@example.com',
      visibility: 'catalog', updatedAt: '2026-09-01T00:00:00.000Z',
    }] }));
    expect(cat).toContain('checked');
    expect(cat).toContain('В общем каталоге');
  });
  it('люди организации с кнопками действий', () => {
    const html = render(createElement(PeopleTable, {
      people: [{ userId: 'u1', displayName: null, email: 't@example.com', login: null, role: 'teacher',
        disabled: false, mustChangePassword: true, groups: ['7А', '7Б'] }],
      actions: () => createElement('button', null, 'Сбросить пароль'),
    }));
    expect(html).toContain('t@example.com');
    expect(html).toContain('учитель');
    expect(html).toContain('7А, 7Б');
    expect(html).toContain('ждёт смены пароля');
    expect(html).toContain('Сбросить пароль');
    expect(render(createElement(PeopleTable, { people: [] }))).toContain('Пока никого нет.');
  });
});

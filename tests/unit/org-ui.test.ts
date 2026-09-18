import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GroupsTable from '@/components/org/GroupsTable';

describe('таблица групп', () => {
  it('ссылка на карточку сохраняет организацию, учителя и счётчик', () => {
    const html = renderToStaticMarkup(createElement(GroupsTable, {
      org: 'sch12',
      groups: [{ id: 'g1', orgId: 'o1', title: '7А', teacherNames: ['Анна Петровна'], studentCount: 25 }],
    }));
    expect(html).toContain('href="/org/groups/g1?org=sch12"');
    expect(html).toContain('Анна Петровна');
    expect(html).toContain('class="center">25</td>');
  });
  it('пустой список подсказывает, что сделать', () => {
    const html = renderToStaticMarkup(createElement(GroupsTable, { org: 'sch12', groups: [] }));
    expect(html).toContain('Пока нет групп. Создайте первую — например, «7А».');
  });
});

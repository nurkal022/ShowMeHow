import Link from 'next/link';
import type { OrgAdminRow } from '@/lib/org/orgs';
import type { UserListItem } from '@/lib/admin/users';
import type { AdminActionRow } from '@/lib/admin/actions';
import type { CatalogItem } from '@/lib/admin/catalog';
import type { OrgPerson } from '@/lib/org/people';
import { adminActionLabel } from '@/lib/admin/labels';
import { ORG_KIND_LABELS, ORG_ROLE_LABELS } from '@/lib/org/types';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { formatDate, formatDateTime } from '@/lib/lms/format';
import StatusPill, { personStatus } from '@/components/cabinet/StatusPill';
import CatalogToggle from './CatalogToggle';

/** Таблицы админки и кабинета: без хуков, поэтому рендерятся на сервере и в тестах. */

export function OrgsTable({ orgs }: { orgs: OrgAdminRow[] }) {
  if (orgs.length === 0) {
    return <p className="empty-state">Организаций пока нет. Создайте первую — например, школу, с которой начинаете пилот.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>Название</th><th>Тип</th><th>Слаг</th><th>Участников</th><th>Создана</th><th>Статус</th><th><span className="visually-hidden">Действия</span></th></tr></thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td data-label="Название"><Link href={`/admin/orgs/${o.id}`}><strong>{o.name}</strong></Link></td>
              <td data-label="Тип">{ORG_KIND_LABELS[o.kind]}</td>
              <td data-label="Слаг"><span className="num">{o.slug}</span></td>
              <td data-label="Участников">{o.memberCount}</td>
              <td data-label="Создана">{formatDate(o.createdAt)}</td>
              <td data-label="Статус">
                {o.archivedAt
                  ? <StatusPill tone="neutral">в архиве</StatusPill>
                  : <StatusPill tone="ok">активна</StatusPill>}
              </td>
              <td className="actions"><Link className="btn btn-sm btn-ghost" href={`/admin/orgs/${o.id}`}>Открыть</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsersTable({ users }: { users: UserListItem[] }) {
  if (users.length === 0) return <p className="empty-state">Никого не нашлось. Попробуйте часть почты, логина или имени.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>Имя</th><th>Вход</th><th>Роль</th><th>Статус</th><th>Создан</th><th><span className="visually-hidden">Действия</span></th></tr></thead>
        <tbody>
          {users.map((u) => {
            const status = personStatus(u);
            return (
              <tr key={u.id}>
                <td data-label="Имя"><Link href={`/admin/users/${u.id}`}><strong>{userLabel(u)}</strong></Link></td>
                <td data-label="Вход"><span className="num">{userContact(u)}</span></td>
                <td data-label="Роль">
                  {u.role === 'admin' ? <StatusPill tone="accent">админ платформы</StatusPill> : <span className="muted">пользователь</span>}
                </td>
                <td data-label="Статус"><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                <td data-label="Создан">{formatDate(u.createdAt)}</td>
                <td className="actions"><Link className="btn btn-sm btn-ghost" href={`/admin/users/${u.id}`}>Открыть</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ActionsTable({ actions }: { actions: AdminActionRow[] }) {
  if (actions.length === 0) return <p className="empty-state">Действий пока не было.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>Когда</th><th>Кто</th><th>Что</th><th>Над чем</th></tr></thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id}>
              <td data-label="Когда">{formatDateTime(a.at)}</td>
              <td data-label="Кто">{a.actorLabel}</td>
              <td data-label="Что">{adminActionLabel(a.action)}</td>
              <td data-label="Над чем">{a.target ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CatalogTable({ items }: { items: CatalogItem[] }) {
  if (items.length === 0) return <p className="empty-state">Симуляций не нашлось.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>Название</th><th>Автор</th><th>Предмет</th><th>Обновлена</th><th>В общем каталоге</th></tr></thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td data-label="Название">
                <a href={`/present/${s.id}`} target="_blank" rel="noopener noreferrer">{s.title}</a>
              </td>
              <td data-label="Автор">{s.ownerLabel}</td>
              <td data-label="Предмет">{s.subject}</td>
              <td data-label="Обновлена">{formatDate(s.updatedAt)}</td>
              <td data-label="В общем каталоге">
                <CatalogToggle id={s.id} title={s.title} initial={s.visibility === 'catalog'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PeopleTable({ people, actions }: {
  people: OrgPerson[];
  actions?: (p: OrgPerson) => React.ReactNode;
}) {
  if (people.length === 0) return <p className="empty-state">Пока никого нет.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>Имя</th><th>Вход</th><th>Роль</th><th>Группы</th><th>Статус</th>{actions && <th><span className="visually-hidden">Действия</span></th>}</tr></thead>
        <tbody>
          {people.map((p) => {
            const status = personStatus(p);
            return (
              <tr key={p.userId}>
                <td data-label="Имя"><strong>{userLabel(p)}</strong></td>
                <td data-label="Вход"><span className="num">{userContact(p)}</span></td>
                <td data-label="Роль">{ORG_ROLE_LABELS[p.role]}</td>
                <td data-label="Группы">
                  {p.groups.length
                    ? <span className="cf-tags">{p.groups.map((g) => <span key={g} className="cf-tag">{g}</span>)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td data-label="Статус"><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                {actions && <td className="actions">{actions(p)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

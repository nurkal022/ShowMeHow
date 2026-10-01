import Link from 'next/link';
import type { OrgAdminRow } from '@/lib/org/orgs';
import type { UserListItem } from '@/lib/admin/users';
import type { AdminActionRow } from '@/lib/admin/actions';
import type { CatalogItem } from '@/lib/admin/catalog';
import type { OrgPerson } from '@/lib/org/people';
import { userContact, userLabel } from '@/lib/auth/identifier';
import { formatDate, formatDateTime } from '@/lib/lms/format';
import StatusPill, { personStatus, personStatusKey } from '@/components/cabinet/StatusPill';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { localizeMessage } from '@/i18n/catalog';
import { admin, type AdminKey } from '@/i18n/messages/admin';
import { cabinet } from '@/i18n/messages/cabinet';
import CatalogToggle from './CatalogToggle';

/** Таблицы админки и кабинета: без хуков, поэтому рендерятся на сервере и в тестах. Язык — свойством locale. */

function dicts(locale: Locale) {
  return { t: translator(admin, locale), tk: translator(cabinet, locale) };
}

/** Действие журнала на языке интерфейса; неизвестное — как записано. */
function actionLabel(t: ReturnType<typeof dicts>['t'], action: string): string {
  const key = `act_${action}`;
  return key in admin.ru ? t(key as AdminKey) : action;
}

export function OrgsTable({ orgs, locale = 'ru' }: { orgs: OrgAdminRow[]; locale?: Locale }) {
  const { t, tk } = dicts(locale);
  if (orgs.length === 0) {
    return <p className="empty-state">{t('orgsEmpty')}</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>{t('colName')}</th><th>{t('colKind')}</th><th>{t('colSlug')}</th><th>{t('colMembers')}</th><th>{t('colCreatedF')}</th><th>{t('colStatus')}</th><th><span className="visually-hidden">{t('actions')}</span></th></tr></thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td data-label={t('colName')}><Link href={`/admin/orgs/${o.id}`}><strong>{o.name}</strong></Link></td>
              <td data-label={t('colKind')}>{tk(`kind_${o.kind}`)}</td>
              <td data-label={t('colSlug')}><span className="num">{o.slug}</span></td>
              <td data-label={t('colMembers')}>{o.memberCount}</td>
              <td data-label={t('colCreatedF')}>{formatDate(o.createdAt, locale)}</td>
              <td data-label={t('colStatus')}>
                {o.archivedAt
                  ? <StatusPill tone="neutral">{t('archived')}</StatusPill>
                  : <StatusPill tone="ok">{t('active')}</StatusPill>}
              </td>
              <td className="actions"><Link className="btn btn-sm btn-ghost" href={`/admin/orgs/${o.id}`}>{t('open')}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsersTable({ users, locale = 'ru' }: { users: UserListItem[]; locale?: Locale }) {
  const { t, tk } = dicts(locale);
  if (users.length === 0) return <p className="empty-state">{t('usersEmpty')}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>{t('colPerson')}</th><th>{t('colLogin')}</th><th>{t('colRole')}</th><th>{t('colStatus')}</th><th>{t('colCreatedM')}</th><th><span className="visually-hidden">{t('actions')}</span></th></tr></thead>
        <tbody>
          {users.map((u) => {
            const status = { ...personStatus(u), label: tk(personStatusKey(u)) };
            return (
              <tr key={u.id}>
                <td data-label={t('colPerson')}><Link href={`/admin/users/${u.id}`}><strong>{userLabel(u)}</strong></Link></td>
                <td data-label={t('colLogin')}><span className="num">{userContact(u)}</span></td>
                <td data-label={t('colRole')}>
                  {u.role === 'admin' ? <StatusPill tone="accent">{t('platformAdmin')}</StatusPill> : <span className="muted">{t('user')}</span>}
                </td>
                <td data-label={t('colStatus')}><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                <td data-label={t('colCreatedM')}>{formatDate(u.createdAt, locale)}</td>
                <td className="actions"><Link className="btn btn-sm btn-ghost" href={`/admin/users/${u.id}`}>{t('open')}</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ActionsTable({ actions, locale = 'ru' }: { actions: AdminActionRow[]; locale?: Locale }) {
  const { t } = dicts(locale);
  if (actions.length === 0) return <p className="empty-state">{t('logNone')}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>{t('colWhen')}</th><th>{t('colWho')}</th><th>{t('colWhat')}</th><th>{t('colTarget')}</th></tr></thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id}>
              <td data-label={t('colWhen')}>{formatDateTime(a.at, locale)}</td>
              <td data-label={t('colWho')}>{localizeMessage(a.actorLabel, locale)}</td>
              <td data-label={t('colWhat')}>{actionLabel(t, a.action)}</td>
              <td data-label={t('colTarget')}>{a.target ? localizeMessage(a.target, locale) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CatalogTable({ items, locale = 'ru' }: { items: CatalogItem[]; locale?: Locale }) {
  const { t } = dicts(locale);
  if (items.length === 0) return <p className="empty-state">{t('catalogNone')}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>{t('colTitle')}</th><th>{t('colAuthor')}</th><th>{t('colSubject')}</th><th>{t('colUpdated')}</th><th>{t('colInCatalog')}</th></tr></thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td data-label={t('colTitle')}>
                <a href={`/present/${s.id}`} target="_blank" rel="noopener noreferrer">{s.title}</a>
              </td>
              <td data-label={t('colAuthor')}>{s.ownerLabel}</td>
              <td data-label={t('colSubject')}>{s.subject}</td>
              <td data-label={t('colUpdated')}>{formatDate(s.updatedAt, locale)}</td>
              <td data-label={t('colInCatalog')}>
                <CatalogToggle id={s.id} title={s.title} initial={s.visibility === 'catalog'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PeopleTable({ people, actions, locale = 'ru' }: {
  people: OrgPerson[];
  actions?: (p: OrgPerson) => React.ReactNode;
  locale?: Locale;
}) {
  const { t, tk } = dicts(locale);
  if (people.length === 0) return <p className="empty-state">{t('peopleNone')}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead><tr><th>{t('colPerson')}</th><th>{t('colLogin')}</th><th>{t('colRole')}</th><th>{t('colGroups')}</th><th>{t('colStatus')}</th>{actions && <th><span className="visually-hidden">{t('actions')}</span></th>}</tr></thead>
        <tbody>
          {people.map((p) => {
            const status = { ...personStatus(p), label: tk(personStatusKey(p)) };
            return (
              <tr key={p.userId}>
                <td data-label={t('colPerson')}><strong>{userLabel(p)}</strong></td>
                <td data-label={t('colLogin')}><span className="num">{userContact(p)}</span></td>
                <td data-label={t('colRole')}>{tk(`role_${p.role}`)}</td>
                <td data-label={t('colGroups')}>
                  {p.groups.length
                    ? <span className="cf-tags">{p.groups.map((g) => <span key={g} className="cf-tag">{g}</span>)}</span>
                    : <span className="muted">—</span>}
                </td>
                <td data-label={t('colStatus')}><StatusPill tone={status.tone}>{status.label}</StatusPill></td>
                {actions && <td className="actions">{actions(p)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

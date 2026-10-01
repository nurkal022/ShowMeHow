import { requireAdminPage } from '@/lib/http/page-guards';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { searchUsers } from '@/lib/admin/users';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import SearchForm from '@/components/cabinet/SearchForm';
import { UsersTable } from '@/components/admin/AdminTables';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { admin } from '@/i18n/messages/admin';

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdminPage('/admin/users');
  if (!user) return null;
  const q = firstParam((await searchParams).q) ?? '';
  const users = await searchUsers(q);
  const locale = await getLocale();
  const t = translator(admin, locale);
  return (
    <>
      <CabinetHeader title={t('usersTitle')}>
        <SearchForm action="/admin/users" query={q} placeholder={t('usersPh')} label={t('usersSearch')} />
      </CabinetHeader>
      {!q && <p className="muted">{t('usersRecent')}</p>}
      <UsersTable users={users} locale={locale} />
    </>
  );
}

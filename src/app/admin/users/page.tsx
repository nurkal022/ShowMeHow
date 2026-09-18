import { requireAdminPage } from '@/lib/http/page-guards';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { searchUsers } from '@/lib/admin/users';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import SearchForm from '@/components/cabinet/SearchForm';
import { UsersTable } from '@/components/admin/AdminTables';

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdminPage('/admin/users');
  if (!user) return null;
  const q = firstParam((await searchParams).q) ?? '';
  const users = await searchUsers(q);
  return (
    <>
      <CabinetHeader title="Пользователи">
        <SearchForm action="/admin/users" query={q} placeholder="Почта, логин или имя" label="Поиск пользователей" />
      </CabinetHeader>
      {!q && <p className="muted">Последние 50 зарегистрированных. Введите запрос, чтобы найти конкретного человека.</p>}
      <UsersTable users={users} />
    </>
  );
}

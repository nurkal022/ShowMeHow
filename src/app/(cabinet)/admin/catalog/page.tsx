import { requireAdminPage } from '@/lib/http/page-guards';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { listAllSimulations } from '@/lib/admin/catalog';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import SearchForm from '@/components/cabinet/SearchForm';
import { CatalogTable } from '@/components/admin/AdminTables';

export default async function AdminCatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdminPage('/admin/catalog');
  if (!user) return null;
  const q = firstParam((await searchParams).q) ?? '';
  const items = await listAllSimulations(q);
  return (
    <>
      <CabinetHeader title="Каталог">
        <SearchForm action="/admin/catalog" query={q} placeholder="Название или автор" label="Поиск симуляций" />
      </CabinetHeader>
      <p className="muted">Отмеченные симуляции видят все учителя, когда вставляют тренажёр в курс.</p>
      <CatalogTable items={items} />
    </>
  );
}

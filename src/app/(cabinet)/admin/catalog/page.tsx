import { requireAdminPage } from '@/lib/http/page-guards';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { listAllSimulations } from '@/lib/admin/catalog';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import SearchForm from '@/components/cabinet/SearchForm';
import { CatalogTable } from '@/components/admin/AdminTables';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { admin } from '@/i18n/messages/admin';

export default async function AdminCatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdminPage('/admin/catalog');
  if (!user) return null;
  const q = firstParam((await searchParams).q) ?? '';
  const items = await listAllSimulations(q);
  const locale = await getLocale();
  const t = translator(admin, locale);
  return (
    <>
      <CabinetHeader title={t('catalogTitle')}>
        <SearchForm action="/admin/catalog" query={q} placeholder={t('catalogPh')} label={t('catalogSearch')} />
      </CabinetHeader>
      <p className="muted">{t('catalogNote')}</p>
      <CatalogTable items={items} locale={locale} />
    </>
  );
}

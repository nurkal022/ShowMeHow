import { requireAdminPage } from '@/lib/http/page-guards';
import { listOrganizationsForAdmin } from '@/lib/org/orgs';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import CreateOrgButton from '@/components/admin/CreateOrgButton';
import { OrgsTable } from '@/components/admin/AdminTables';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { admin } from '@/i18n/messages/admin';

export default async function AdminOrgsPage() {
  const user = await requireAdminPage('/admin/orgs');
  if (!user) return null;
  const orgs = await listOrganizationsForAdmin();
  const locale = await getLocale();
  const t = translator(admin, locale);
  return (
    <>
      <CabinetHeader title={t('orgsTitle')}><CreateOrgButton /></CabinetHeader>
      <OrgsTable orgs={orgs} locale={locale} />
    </>
  );
}

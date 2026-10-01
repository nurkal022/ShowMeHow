import { requireAdminPage } from '@/lib/http/page-guards';
import { listAdminActions } from '@/lib/admin/actions';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { ActionsTable } from '@/components/admin/AdminTables';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { admin } from '@/i18n/messages/admin';

export default async function AdminLogPage() {
  const user = await requireAdminPage('/admin/log');
  if (!user) return null;
  const locale = await getLocale();
  const t = translator(admin, locale);
  return (
    <>
      <CabinetHeader title={t('logTitle')} subtitle={t('logSub')} />
      <ActionsTable actions={await listAdminActions(200)} locale={locale} />
    </>
  );
}

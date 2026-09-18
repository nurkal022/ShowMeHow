import { requireAdminPage } from '@/lib/http/page-guards';
import { listAdminActions } from '@/lib/admin/actions';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { ActionsTable } from '@/components/admin/AdminTables';

export default async function AdminLogPage() {
  const user = await requireAdminPage('/admin/log');
  if (!user) return null;
  return (
    <>
      <CabinetHeader title="Журнал" subtitle="Последние 200 действий администраторов платформы" />
      <ActionsTable actions={await listAdminActions(200)} />
    </>
  );
}

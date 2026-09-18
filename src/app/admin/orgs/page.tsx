import { requireAdminPage } from '@/lib/http/page-guards';
import { listOrganizationsForAdmin } from '@/lib/org/orgs';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import CreateOrgButton from '@/components/admin/CreateOrgButton';
import { OrgsTable } from '@/components/admin/AdminTables';

export default async function AdminOrgsPage() {
  const user = await requireAdminPage('/admin/orgs');
  if (!user) return null;
  const orgs = await listOrganizationsForAdmin();
  return (
    <>
      <CabinetHeader title="Организации"><CreateOrgButton /></CabinetHeader>
      <OrgsTable orgs={orgs} />
    </>
  );
}

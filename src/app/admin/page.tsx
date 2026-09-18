import { requireAdminPage } from '@/lib/http/page-guards';
import { platformOverview } from '@/lib/admin/overview';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { Stat, StatGrid } from '@/components/cabinet/Stat';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const user = await requireAdminPage('/admin');
  if (!user) return null;
  const o = await platformOverview();
  return (
    <>
      <CabinetHeader title="Админка" subtitle="Состояние платформы" />
      <StatGrid>
        <Stat value={o.organizations} label="организаций" />
        <Stat value={o.users} label="пользователей" />
        <Stat value={o.generations7d} label="генераций за 7 дней" />
        <Stat value={o.queue.queued} label="заданий в очереди" />
        <Stat value={o.queue.running} label="выполняется сейчас" />
        <Stat value={o.queue.workersAlive} label="воркеров в сети" />
      </StatGrid>
      {o.queue.queued > 0 && o.queue.workersAlive === 0 && (
        <p className="error-box">Очередь стоит: нет ни одного живого воркера. Запустите npm run worker.</p>
      )}
    </>
  );
}

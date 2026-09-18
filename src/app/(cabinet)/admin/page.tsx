import Link from 'next/link';
import { requireAdminPage } from '@/lib/http/page-guards';
import { platformDashboard } from '@/lib/admin/overview';
import { adminActionLabel } from '@/lib/admin/labels';
import { ORG_KIND_LABELS } from '@/lib/org/types';
import { formatDate, formatDateTime, ruPlural } from '@/lib/lms/format';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatCard, { StatCards } from '@/components/cabinet/StatCard';
import StatusPill from '@/components/cabinet/StatusPill';
import EmptyState from '@/components/cabinet/EmptyState';
import ChartCard from '@/components/cabinet/charts/ChartCard';
import { IconAlert, IconOrg, IconSpark } from '@/components/icons';
import { IconList, IconPeople } from '@/components/cabinet/icons';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const user = await requireAdminPage('/admin');
  if (!user) return null;
  const d = await platformDashboard();
  const q = d.queue;
  return (
    <>
      <CabinetHeader title="Обзор платформы" subtitle="Люди, организации и генерации — что происходит сейчас">
        <Link href="/admin/orgs" className="btn btn-primary">Организации</Link>
      </CabinetHeader>

      {q.queued > 0 && q.workersAlive === 0 && (
        <p className="error-box">Очередь стоит: нет ни одного живого воркера. Запустите npm run worker.</p>
      )}

      <StatCards>
        <StatCard tone="indigo" value={d.users.total} label={ruPlural(d.users.total, 'пользователь', 'пользователя', 'пользователей')}
          hint={`+${d.users.new7d} за 7 дней`} spark={d.users.spark.values} sparkLabel="Новые пользователи за 14 дней"
          href="/admin/users" icon={<IconPeople size={20} />} />
        <StatCard tone="blue" value={d.organizations.total} label={ruPlural(d.organizations.total, 'организация', 'организации', 'организаций')}
          hint={`+${d.organizations.new30d} за 30 дней`} spark={d.organizations.spark.values} sparkLabel="Новые организации за 14 дней"
          href="/admin/orgs" icon={<IconOrg size={20} />} />
        <StatCard tone="amber" value={d.generations.done30d} label={`${ruPlural(d.generations.done30d, 'генерация', 'генерации', 'генераций')} за 30 дней`}
          hint="завершены успешно" spark={d.generations.spark.values} sparkLabel="Успешные генерации за 14 дней"
          icon={<IconSpark size={20} />} />
        <StatCard tone="rose" value={`${q.queued} / ${q.running}`} label="в очереди / выполняется"
          hint={`ошибок за 7 дней: ${d.errors.count7d} · воркеров в сети: ${q.workersAlive}`}
          spark={d.errors.spark.values} sparkLabel="Ошибки генерации за 14 дней" icon={<IconAlert size={20} />} />
      </StatCards>

      <ChartCard title="Генерации по дням" days={d.chart.days} periods={[7, 30, 90]} initialPeriod={30}
        emptyHint="За этот период генераций не было."
        series={[
          { key: 'done', label: 'Успешно', values: d.chart.done, color: 1, area: true },
          { key: 'error', label: 'С ошибкой', values: d.chart.error, color: 2, dashed: true },
        ]} />

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head">
            <h2>Последние организации</h2>
            <Link href="/admin/orgs" className="btn btn-sm btn-ghost">Все</Link>
          </header>
          {d.recentOrgs.length === 0 ? (
            <EmptyState icon={<IconOrg size={24} />} text="Организаций пока нет — создайте первую школу или колледж.">
              <Link href="/admin/orgs" className="btn btn-primary">Создать организацию</Link>
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Организация</th><th>Тип</th><th className="center">Людей</th><th>Создана</th></tr></thead>
                <tbody>
                  {d.recentOrgs.map((o) => (
                    <tr key={o.id}>
                      <td data-label="Организация">
                        <Link href={`/admin/orgs/${o.id}`}>{o.name}</Link>
                        {o.archived && <> <StatusPill tone="neutral">в архиве</StatusPill></>}
                      </td>
                      <td data-label="Тип">{ORG_KIND_LABELS[o.kind]}</td>
                      <td data-label="Людей" className="center num">{o.memberCount}</td>
                      <td data-label="Создана">{formatDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cab-card">
          <header className="cab-card-head">
            <h2>Последние действия</h2>
            <Link href="/admin/log" className="btn btn-sm btn-ghost">Журнал</Link>
          </header>
          {d.recentActions.length === 0 ? (
            <EmptyState icon={<IconList size={24} />} text="Журнал пуст: действия админов появятся здесь." />
          ) : (
            <ul className="cab-feed">
              {d.recentActions.map((a) => (
                <li key={a.id}>
                  <span className="cab-feed-dot" aria-hidden="true" />
                  <div>
                    <p><strong>{a.actorLabel}</strong> {adminActionLabel(a.action)}{a.target ? <> — <span className="cab-feed-target">{a.target}</span></> : null}</p>
                    <span className="muted">{formatDateTime(a.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

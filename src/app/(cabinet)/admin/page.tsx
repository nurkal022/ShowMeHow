import Link from 'next/link';
import { requireAdminPage } from '@/lib/http/page-guards';
import { platformDashboard } from '@/lib/admin/overview';
import { formatDate, formatDateTime } from '@/lib/lms/format';
import { localizeMessage } from '@/i18n/catalog';
import { cabinet } from '@/i18n/messages/cabinet';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatCard, { StatCards } from '@/components/cabinet/StatCard';
import StatusPill from '@/components/cabinet/StatusPill';
import EmptyState from '@/components/cabinet/EmptyState';
import ChartCard from '@/components/cabinet/charts/ChartCard';
import { IconAlert, IconOrg, IconSpark } from '@/components/icons';
import { IconList, IconPeople } from '@/components/cabinet/icons';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { admin } from '@/i18n/messages/admin';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const user = await requireAdminPage('/admin');
  if (!user) return null;
  const d = await platformDashboard();
  const q = d.queue;
  const locale = await getLocale();
  const t = translator(admin, locale);
  const tk = translator(cabinet, locale);
  const act = (a: string) => (`act_${a}` in admin.ru ? t(`act_${a}` as keyof typeof admin.ru) : a);
  return (
    <>
      <CabinetHeader title={t('overviewTitle')} subtitle={t('overviewSub')}>
        <Link href="/admin/orgs" className="btn btn-primary">{t('orgs')}</Link>
      </CabinetHeader>

      {q.queued > 0 && q.workersAlive === 0 && (
        <p className="error-box">{t('queueStuck')}</p>
      )}

      <StatCards>
        <StatCard tone="indigo" value={d.users.total} label={t('statUsers', { n: d.users.total })} locale={locale}
          hint={t('hint7', { n: d.users.new7d })} spark={d.users.spark.values} sparkLabel={t('sparkUsers')}
          href="/admin/users" icon={<IconPeople size={20} />} />
        <StatCard tone="blue" value={d.organizations.total} label={t('statOrgs', { n: d.organizations.total })} locale={locale}
          hint={t('hint30', { n: d.organizations.new30d })} spark={d.organizations.spark.values} sparkLabel={t('sparkOrgs')}
          href="/admin/orgs" icon={<IconOrg size={20} />} />
        <StatCard tone="amber" value={d.generations.done30d} label={t('statGens', { n: d.generations.done30d })} locale={locale}
          hint={t('hintDone')} spark={d.generations.spark.values} sparkLabel={t('sparkGens')}
          icon={<IconSpark size={20} />} />
        <StatCard tone="rose" value={`${q.queued} / ${q.running}`} label={t('statQueue')} locale={locale}
          hint={t('hintErrors', { errors: d.errors.count7d, workers: q.workersAlive })}
          spark={d.errors.spark.values} sparkLabel={t('sparkErrors')} icon={<IconAlert size={20} />} />
      </StatCards>

      <ChartCard title={t('chartTitle')} days={d.chart.days} periods={[7, 30, 90]} initialPeriod={30}
        emptyHint={t('chartEmpty')}
        series={[
          { key: 'done', label: t('chartDone'), values: d.chart.done, color: 1, area: true },
          { key: 'error', label: t('chartError'), values: d.chart.error, color: 2, dashed: true },
        ]} />

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head">
            <h2>{t('recentOrgs')}</h2>
            <Link href="/admin/orgs" className="btn btn-sm btn-ghost">{t('all')}</Link>
          </header>
          {d.recentOrgs.length === 0 ? (
            <EmptyState icon={<IconOrg size={24} />} text={t('noOrgsYet')}>
              <Link href="/admin/orgs" className="btn btn-primary">{t('createOrg')}</Link>
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>{t('colOrg')}</th><th>{t('colKind')}</th><th className="center">{t('colPeople')}</th><th>{t('colCreatedF')}</th></tr></thead>
                <tbody>
                  {d.recentOrgs.map((o) => (
                    <tr key={o.id}>
                      <td data-label={t('colOrg')}>
                        <Link href={`/admin/orgs/${o.id}`}>{o.name}</Link>
                        {o.archived && <> <StatusPill tone="neutral">{t('archived')}</StatusPill></>}
                      </td>
                      <td data-label={t('colKind')}>{tk(`kind_${o.kind}`)}</td>
                      <td data-label={t('colPeople')} className="center num">{o.memberCount}</td>
                      <td data-label={t('colCreatedF')}>{formatDate(o.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cab-card">
          <header className="cab-card-head">
            <h2>{t('recentActions')}</h2>
            <Link href="/admin/log" className="btn btn-sm btn-ghost">{t('log')}</Link>
          </header>
          {d.recentActions.length === 0 ? (
            <EmptyState icon={<IconList size={24} />} text={t('logEmpty')} />
          ) : (
            <ul className="cab-feed">
              {d.recentActions.map((a) => (
                <li key={a.id}>
                  <span className="cab-feed-dot" aria-hidden="true" />
                  <div>
                    <p><strong>{localizeMessage(a.actorLabel, locale)}</strong> {act(a.action)}{a.target ? <> — <span className="cab-feed-target">{localizeMessage(a.target, locale)}</span></> : null}</p>
                    <span className="muted">{formatDateTime(a.at, locale)}</span>
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

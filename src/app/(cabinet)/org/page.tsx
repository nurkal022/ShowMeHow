import Link from 'next/link';
import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { orgDashboard } from '@/lib/org/orgs';
import { listGroups } from '@/lib/org/groups';
import { ORG_KIND_LABELS } from '@/lib/org/types';
import { withOrgParam } from '@/lib/lms/links';
import { formatDate, ruPlural } from '@/lib/lms/format';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatCard, { StatCards } from '@/components/cabinet/StatCard';
import StatusPill from '@/components/cabinet/StatusPill';
import EmptyState from '@/components/cabinet/EmptyState';
import ChartCard from '@/components/cabinet/charts/ChartCard';
import { IconCheck, IconCourses, IconKey, IconPlus, IconPrint, IconTeach } from '@/components/icons';
import { IconGroup, IconPeople } from '@/components/cabinet/icons';

export default async function OrgOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const [d, groups] = await Promise.all([orgDashboard(m.orgId), listGroups(m.orgId)]);
  const link = (href: string) => withOrgParam(href, m.orgSlug);
  return (
    <>
      <CabinetHeader title={m.orgName} subtitle={`${ORG_KIND_LABELS[m.orgKind]} · обзор организации`}>
        <Link href={link('/org/teachers')} className="btn">Добавить учителя</Link>
        <Link href={link('/org/groups')} className="btn btn-primary"><IconPlus size={16} />Новая группа</Link>
      </CabinetHeader>

      <StatCards>
        <StatCard tone="indigo" value={d.teachers.total} label={ruPlural(d.teachers.total, 'учитель', 'учителя', 'учителей')}
          hint="ведут группы и курсы" spark={d.teachers.spark.values} sparkLabel="Новые учителя за 14 дней"
          href={link('/org/teachers')} icon={<IconTeach size={20} />} />
        <StatCard tone="blue" value={d.students.total} label={ruPlural(d.students.total, 'ученик', 'ученика', 'учеников')}
          hint={`+${d.students.new7d} за 7 дней`} spark={d.students.spark.values} sparkLabel="Новые ученики за 14 дней"
          href={link('/org/groups')} icon={<IconPeople size={20} />} />
        <StatCard tone="amber" value={d.groups.total} label={ruPlural(d.groups.total, 'группа', 'группы', 'групп')}
          hint="классы и потоки" spark={d.groups.spark.values} sparkLabel="Новые группы за 14 дней"
          href={link('/org/groups')} icon={<IconGroup size={20} />} />
        <StatCard tone="rose" value={`${d.courses.published} / ${d.courses.total}`} label="курсов опубликовано / всего"
          hint="черновики ученикам не видны" spark={d.courses.spark.values} sparkLabel="Новые курсы за 14 дней"
          href={link('/teach')} icon={<IconCourses size={20} />} />
      </StatCards>

      <ChartCard title="Сданные ответы по дням" days={d.chart.days}
        emptyHint="За 30 дней ученики ещё ничего не сдавали."
        series={[
          { key: 'submitted', label: 'Сдано', values: d.chart.submitted, color: 1, area: true },
          { key: 'graded', label: 'Проверено', values: d.chart.graded, color: 3, dashed: true },
        ]} />

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head">
            <h2>Группы</h2>
            <Link href={link('/org/groups')} className="btn btn-sm btn-ghost">Все группы</Link>
          </header>
          {groups.length === 0 ? (
            <EmptyState icon={<IconGroup size={24} />} text="Пока нет групп — создайте первую, например «7А».">
              <Link href={link('/org/groups')} className="btn btn-primary">Создать группу</Link>
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Группа</th><th>Учителя</th><th className="center">Учеников</th><th className="actions">Действия</th></tr></thead>
                <tbody>
                  {groups.slice(0, 8).map((g) => (
                    <tr key={g.id}>
                      <td data-label="Группа"><Link href={`/org/groups/${g.id}`}>{g.title}</Link></td>
                      <td data-label="Учителя">{g.teacherNames.length ? g.teacherNames.join(', ') : <span className="muted">не назначен</span>}</td>
                      <td data-label="Учеников" className="center num">{g.studentCount}</td>
                      <td className="actions">
                        <Link className="btn btn-sm btn-ghost" href={`/org/groups/${g.id}/credentials`}><IconPrint size={15} />Пароли</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cab-card">
          <header className="cab-card-head">
            <div>
              <h2>Ещё с временным паролем</h2>
              <span className="muted">Эти ученики ни разу не вошли{d.tempPasswords.total > d.tempPasswords.rows.length ? ` · всего ${d.tempPasswords.total}` : ''}</span>
            </div>
            {d.tempPasswords.total > 0 && <StatusPill tone="warn">{d.tempPasswords.total}</StatusPill>}
          </header>
          {d.tempPasswords.rows.length === 0 ? (
            <EmptyState icon={<IconCheck size={24} />} text="Все ученики уже вошли и сменили временный пароль." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Ученик</th><th>Группа</th><th>Добавлен</th></tr></thead>
                <tbody>
                  {d.tempPasswords.rows.map((s) => (
                    <tr key={s.userId}>
                      <td data-label="Ученик"><span className="cab-cell-icon"><IconKey size={15} />{s.label}</span></td>
                      <td data-label="Группа">{s.groups.join(', ') || '—'}</td>
                      <td data-label="Добавлен">{formatDate(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {d.teachers.total === 0 && (
        <p className="warn-banner">
          Учителей пока нет. <Link href={link('/org/teachers')}>Добавьте учителя</Link> — по почте или логину.
        </p>
      )}
    </>
  );
}

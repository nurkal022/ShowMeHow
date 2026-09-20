import Link from 'next/link';
import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { allowedGroupIds } from '@/lib/lms/access';
import { teachGroups } from '@/lib/lms/teach-home';
import { ruPlural } from '@/lib/lms/format';
import { withOrgParam } from '@/lib/lms/links';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import EmptyState from '@/components/cabinet/EmptyState';
import Sparkline from '@/components/cabinet/charts/Sparkline';
import { Ring } from '@/components/cabinet/viz';
import { IconPrint } from '@/components/icons';
import { IconGroup } from '@/components/cabinet/icons';

export default async function TeachGroupsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach/groups', ['teacher'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const isAdmin = m.role === 'org_admin';
  const groups = await teachGroups(m.orgId, await allowedGroupIds(ctx.user, m));
  const link = (href: string) => withOrgParam(href, m.orgSlug);
  const students = groups.reduce((a, g) => a + g.students, 0);

  return (
    <>
      <CabinetHeader title={isAdmin ? 'Группы организации' : 'Мои группы'}
        subtitle={`${groups.length} ${ruPlural(groups.length, 'группа', 'группы', 'групп')} · ${students} ${ruPlural(students, 'ученик', 'ученика', 'учеников')}`}>
        {isAdmin && <Link className="btn" href={link('/org/groups')}>Управление группами</Link>}
      </CabinetHeader>
      {groups.length === 0 ? (
        <div className="cab-card">
          <EmptyState icon={<IconGroup size={24} />} text="Вам пока не назначены группы — их назначает администратор организации." />
        </div>
      ) : (
        <div className="group-grid">
          {groups.map((g) => {
            const active = g.students ? Math.round((g.activeWeek / g.students) * 100) : 0;
            return (
              <article key={g.id} className="group-tile">
                <Link href={link(`/teach/groups/${g.id}`)} className="group-tile-main">
                  <div className="group-tile-head">
                    <span className="group-tile-badge">{g.title}</span>
                    <div>
                      <h3>Группа {g.title}</h3>
                      <span className="muted">{g.teachers.length ? g.teachers.join(', ') : 'учитель не назначен'}</span>
                    </div>
                    <Ring value={g.avgPercent} size={52} stroke={5} label={`Средний балл: ${g.avgPercent ?? '—'}%`} />
                  </div>
                  <dl className="group-tile-facts">
                    <div><dt>{ruPlural(g.students, 'ученик', 'ученика', 'учеников')}</dt><dd>{g.students}</dd></div>
                    <div><dt>{ruPlural(g.courses, 'курс', 'курса', 'курсов')}</dt><dd>{g.courses}</dd></div>
                    <div><dt>активны за неделю</dt><dd>{active}%</dd></div>
                    <div className={g.pending ? 'hot' : ''}><dt>на проверку</dt><dd>{g.pending}</dd></div>
                  </dl>
                  <div className="group-tile-spark">
                    {g.spark.some((v) => v > 0)
                      ? <Sparkline values={g.spark} label={`Активность группы ${g.title} за 14 дней`} />
                      : <span className="muted">За две недели активности не было</span>}
                  </div>
                </Link>
                <footer>
                  {g.tempPasswords > 0 && <span className="status-pill warn">{g.tempPasswords} не вошли</span>}
                  <span className="spacer" />
                  <Link className="btn btn-sm btn-ghost" href={`/org/groups/${g.id}/credentials`}><IconPrint size={15} />Пароли</Link>
                  <Link className="btn btn-sm btn-secondary" href={link(`/teach/groups/${g.id}`)}>Открыть</Link>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

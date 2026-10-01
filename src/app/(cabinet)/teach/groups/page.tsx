import Link from 'next/link';
import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { allowedGroupIds } from '@/lib/lms/access';
import { teachGroups } from '@/lib/lms/teach-home';
import { getT } from '@/i18n/server';
import { teachHome } from '@/i18n/messages/teach-home';
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
  const t = await getT(teachHome);
  const m = ctx.cabinet.membership;
  const isAdmin = m.role === 'org_admin';
  const groups = await teachGroups(m.orgId, await allowedGroupIds(ctx.user, m));
  const link = (href: string) => withOrgParam(href, m.orgSlug);
  const students = groups.reduce((a, g) => a + g.students, 0);

  return (
    <>
      <CabinetHeader title={isAdmin ? t('orgGroups') : t('myGroups')}
        subtitle={t('groupsSubtitle', { g: groups.length, s: students })}>
        {isAdmin && <Link className="btn" href={link('/org/groups')}>{t('manageGroups')}</Link>}
      </CabinetHeader>
      {groups.length === 0 ? (
        <div className="cab-card">
          <EmptyState icon={<IconGroup size={24} />} text={t('noGroups')} />
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
                      <h3>{t('groupTitle', { title: g.title })}</h3>
                      <span className="muted">{g.teachers.length ? g.teachers.join(', ') : t('noTeacher')}</span>
                    </div>
                    <Ring value={g.avgPercent} size={52} stroke={5} label={t('avgRing', { n: g.avgPercent ?? '—' })} />
                  </div>
                  <dl className="group-tile-facts">
                    <div><dt>{t('factStudents', { n: g.students })}</dt><dd>{g.students}</dd></div>
                    <div><dt>{t('factCourses', { n: g.courses })}</dt><dd>{g.courses}</dd></div>
                    <div><dt>{t('activeWeek')}</dt><dd>{active}%</dd></div>
                    <div className={g.pending ? 'hot' : ''}><dt>{t('toReview')}</dt><dd>{g.pending}</dd></div>
                  </dl>
                  <div className="group-tile-spark">
                    {g.spark.some((v) => v > 0)
                      ? <Sparkline values={g.spark} label={t('groupSpark', { title: g.title })} />
                      : <span className="muted">{t('noActivity2w')}</span>}
                  </div>
                </Link>
                <footer>
                  {g.tempPasswords > 0 && <span className="status-pill warn">{t('notLoggedIn', { n: g.tempPasswords })}</span>}
                  <span className="spacer" />
                  <Link className="btn btn-sm btn-ghost" href={`/org/groups/${g.id}/credentials`}><IconPrint size={15} />{t('passwords')}</Link>
                  <Link className="btn btn-sm btn-secondary" href={link(`/teach/groups/${g.id}`)}>{t('open')}</Link>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

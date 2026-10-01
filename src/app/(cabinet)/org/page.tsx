import Link from 'next/link';
import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { orgDashboard } from '@/lib/org/orgs';
import { orgFeed, orgFunnel, teacherActivity, type OrgEventKind } from '@/lib/org/insights';
import { withOrgParam } from '@/lib/lms/links';
import { formatAgo } from '@/lib/lms/format';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { org } from '@/i18n/messages/org';
import { cabinet } from '@/i18n/messages/cabinet';
import StatCard, { StatCards } from '@/components/cabinet/StatCard';
import StatusPill from '@/components/cabinet/StatusPill';
import EmptyState from '@/components/cabinet/EmptyState';
import ChartCard from '@/components/cabinet/charts/ChartCard';
import CountUp from '@/components/motion/CountUp';
import { FunnelBars, FunnelByGroup } from '@/components/org/Funnel';
import TeacherCards from '@/components/org/TeacherCards';
import { Avatar, Ring, Timeline, type TimelineItem } from '@/components/cabinet/viz';
import { IconCheck, IconCourses, IconPlus, IconTask, IconTeach, IconUser } from '@/components/icons';
import { IconGroup, IconPeople } from '@/components/cabinet/icons';

const EVENTS: Record<OrgEventKind, { icon: React.ReactNode; tone: TimelineItem['tone'] }> = {
  student: { icon: <IconUser size={14} />, tone: 'violet' },
  teacher: { icon: <IconTeach size={14} />, tone: 'rose' },
  group: { icon: <IconGroup size={14} />, tone: 'amber' },
  course: { icon: <IconCourses size={14} />, tone: 'blue' },
  submitted: { icon: <IconTask size={14} />, tone: 'blue' },
  graded: { icon: <IconCheck size={14} />, tone: 'green' },
};

export default async function OrgOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const locale = await getLocale();
  const t = translator(org, locale);
  const tk = translator(cabinet, locale);
  const [d, funnel, teachers, feed] = await Promise.all([
    orgDashboard(m.orgId), orgFunnel(m.orgId), teacherActivity(m.orgId), orgFeed(m.orgId),
  ]);
  const link = (href: string) => withOrgParam(href, m.orgSlug);
  const f = funnel.total;
  const pct = (n: number) => (f.added ? Math.round((n / f.added) * 100) : null);
  const stuck = f.added - f.submitted;
  const pendingAll = teachers.reduce((a, t) => a + t.pending, 0);

  const summary: string[] = [];
  if (f.added) summary.push(t('sumSubmitting', { n: f.added, done: f.submitted }));
  if (d.tempPasswords.total) summary.push(t('sumNotIn', { n: d.tempPasswords.total }));
  if (pendingAll) summary.push(t('sumPending', { n: pendingAll }));
  const eventText = (e: (typeof feed)[number]): string => {
    const task = e.task ?? t('task');
    switch (e.kind) {
      case 'student': return e.groups ? t('ev_studentIn', { groups: e.groups }) : t('ev_student');
      case 'teacher': return t('ev_teacher');
      case 'group': return t('ev_group');
      case 'course': return t('ev_course', { course: e.course });
      case 'submitted': return t('ev_submitted', { task, course: e.course });
      case 'graded': return t('ev_graded', { task, course: e.course });
      default: return e.what;
    }
  };

  return (
    <>
      <section className="hero-band hero-org">
        <div className="hero-band-text">
          <span className="hero-band-date">{t('overview', { kind: tk(`kind_${m.orgKind}`) })}</span>
          <h1>{m.orgName}</h1>
          <p>{summary.length ? `${summary.join(' · ')}.` : t('emptySchool')}</p>
          <div className="hero-band-actions">
            <Link href={link('/org/groups')} className="btn btn-light"><IconPlus size={16} />{t('newGroup')}</Link>
            <Link href={link('/org/teachers?add=1')} className="btn btn-glass">{t('addTeacher')}</Link>
          </div>
        </div>
        <div className="hero-band-rings">
          <div><Ring value={pct(f.loggedIn)} size={84} stroke={8} tone="#fff" label={t('ringIn', { n: pct(f.loggedIn) ?? 0 })} /><span>{t('ringInShort')}</span></div>
          <div><Ring value={pct(f.opened)} size={84} stroke={8} tone="#fff" label={t('ringActive', { n: pct(f.opened) ?? 0 })} /><span>{t('ringActiveShort')}</span></div>
          <div><Ring value={pct(f.submitted)} size={84} stroke={8} tone="#fff" label={t('ringSubmit', { n: pct(f.submitted) ?? 0 })} /><span>{t('ringSubmitShort')}</span></div>
        </div>
      </section>

      <StatCards>
        <StatCard tone="indigo" value={d.teachers.total} label={t('statTeachers', { n: d.teachers.total })} locale={locale}
          hint={t('hintTeachers')} spark={d.teachers.spark.values} sparkLabel={t('sparkTeachers')}
          href={link('/org/teachers')} icon={<IconTeach size={20} />} />
        <StatCard tone="blue" value={d.students.total} label={t('statStudents', { n: d.students.total })} locale={locale}
          hint={t('hintStudents', { n: d.students.new7d })} spark={d.students.spark.values} sparkLabel={t('sparkStudents')}
          href={link('/org/groups')} icon={<IconPeople size={20} />} />
        <StatCard tone="amber" value={d.groups.total} label={t('statGroups', { n: d.groups.total })} locale={locale}
          hint={t('hintGroups')} spark={d.groups.spark.values} sparkLabel={t('sparkGroups')}
          href={link('/org/groups')} icon={<IconGroup size={20} />} />
        <StatCard tone="rose" value={`${d.courses.published} / ${d.courses.total}`} label={t('statCourses')} locale={locale}
          hint={t('hintCourses')} spark={d.courses.spark.values} sparkLabel={t('sparkCourses')}
          href={link('/teach/courses')} icon={<IconCourses size={20} />} />
      </StatCards>

      <div className="today-grid">
        <div className="today-main">
          <section className="cab-card">
            <header className="cab-card-head">
              <div><h2>{t('pathTitle')}</h2><span className="muted">{t('pathHint')}</span></div>
              {stuck > 0 && <StatusPill tone="warn">{t('stuck', { n: stuck })}</StatusPill>}
            </header>
            {f.added === 0 ? (
              <EmptyState icon={<IconPeople size={24} />} text={t('noStudents')}>
                <Link href={link('/org/groups')} className="btn btn-primary">{t('createGroup')}</Link>
              </EmptyState>
            ) : (
              <>
                <div className="cab-card-pad"><FunnelBars total={f} locale={locale} /></div>
                {funnel.groups.length > 0 && <FunnelByGroup groups={funnel.groups} hrefOf={(id) => `/org/groups/${id}`} locale={locale} />}
              </>
            )}
          </section>

          <section className="cab-section">
            <header className="cab-section-head">
              <h2>{t('teachers')}</h2>
              <Link href={link('/org/teachers')} className="btn btn-sm btn-ghost">{t('allTeachers')}</Link>
            </header>
            {teachers.length === 0 ? (
              <div className="cab-card">
                <EmptyState icon={<IconTeach size={24} />} text={t('noTeachers')}>
                  <Link href={link('/org/teachers?add=1')} className="btn btn-primary">{t('addTeacher')}</Link>
                </EmptyState>
              </div>
            ) : <TeacherCards teachers={teachers} locale={locale} />}
          </section>

          <ChartCard title={t('chartTitle')} days={d.chart.days} periods={[7, 30]} initialPeriod={30}
            emptyHint={t('chartEmpty')}
            series={[
              { key: 'submitted', label: t('chartSubmitted'), values: d.chart.submitted, color: 1, area: true },
              { key: 'graded', label: t('chartGraded'), values: d.chart.graded, color: 3, dashed: true },
            ]} />
        </div>

        <aside className="today-side">
          <section className="cab-card">
            <header className="cab-card-head"><div><h2>{t('lifeTitle')}</h2><span className="muted">{t('lifeHint')}</span></div><span className="live-dot" aria-hidden="true" /></header>
            {feed.length === 0
              ? <EmptyState icon={<IconCheck size={24} />} text={t('noEvents')} />
              : <Timeline items={feed.map((e, i) => ({
                  key: `${e.kind}-${e.at}-${i}`, icon: EVENTS[e.kind].icon, tone: EVENTS[e.kind].tone,
                  who: e.who, text: eventText(e), at: e.at, href: e.href ? link(e.href) : null,
                }))} locale={locale} />}
          </section>

          <section className="cab-card">
            <header className="cab-card-head">
              <div><h2>{t('notInTitle')}</h2><span className="muted">{t('notInHint')}{d.tempPasswords.total > d.tempPasswords.rows.length ? t('notInTotal', { n: d.tempPasswords.total }) : ''}</span></div>
              {d.tempPasswords.total > 0 && <b className="side-count"><CountUp value={d.tempPasswords.total} /></b>}
            </header>
            {d.tempPasswords.rows.length === 0 ? (
              <EmptyState icon={<IconCheck size={24} />} text={t('allIn')} />
            ) : (
              <ul className="people-list">
                {d.tempPasswords.rows.map((s) => (
                  <li key={s.userId}>
                    <Avatar name={s.label} size={32} />
                    <div><strong>{s.label}</strong><span className="muted">{s.groups.join(', ') || t('noGroup')} · {t('addedAgo', { ago: formatAgo(s.createdAt, locale) })}</span></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

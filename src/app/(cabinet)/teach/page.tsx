import Link from 'next/link';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { allowedGroupIds } from '@/lib/lms/access';
import { teachDashboard } from '@/lib/lms/overview';
import { teachGroups, teachToday, type FeedKind } from '@/lib/lms/teach-home';
import { formatAgo } from '@/lib/lms/format';
import { getLocale, getT } from '@/i18n/server';
import { formatDate } from '@/i18n/core';
import { teachHome } from '@/i18n/messages/teach-home';
import { withOrgParam } from '@/lib/lms/links';
import NewCourseDialog from '@/components/cabinet/NewCourseDialog';
import ChartCard from '@/components/cabinet/charts/ChartCard';
import EmptyState from '@/components/cabinet/EmptyState';
import CountUp from '@/components/motion/CountUp';
import { Avatar, Bar, Heatmap, Ring, Timeline, type TimelineItem } from '@/components/cabinet/viz';
import { IconCheck, IconCourses, IconEye, IconFlame, IconSpark, IconTask, IconUndo } from '@/components/icons';
import { IconChevronRight, IconGroup, IconInbox } from '@/components/cabinet/icons';

const FEED: Record<FeedKind, { icon: React.ReactNode; tone: TimelineItem['tone']; verb: 'feedSubmitted' | 'feedGraded' | 'feedReturned' | 'feedOpened' }> = {
  submitted: { icon: <IconTask size={14} />, tone: 'blue', verb: 'feedSubmitted' },
  graded: { icon: <IconCheck size={14} />, tone: 'green', verb: 'feedGraded' },
  returned: { icon: <IconUndo size={14} />, tone: 'amber', verb: 'feedReturned' },
  opened: { icon: <IconEye size={14} />, tone: 'violet', verb: 'feedOpened' },
};

export default async function TeachTodayPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach', ['teacher'], searchParams);
  if (!ctx) return null;
  const { user } = ctx;
  const tr = await getT(teachHome);
  const locale = await getLocale();
  const m = ctx.cabinet.membership;
  const isAdmin = m.role === 'org_admin';
  const ownerId = isAdmin ? null : user.id;
  const allowed = await allowedGroupIds(user, m);
  const [d, t, groups] = await Promise.all([
    teachDashboard(m.orgId, ownerId, allowed, locale),
    teachToday(m.orgId, ownerId, allowed, locale),
    teachGroups(m.orgId, allowed),
  ]);
  const link = (href: string) => withOrgParam(href, m.orgSlug);
  const firstName = (user.displayName ?? '').trim().split(/\s+/)[0] || '';
  const today = formatDate(new Date(), locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const checkedShare = d.gradedTotal + d.pending ? Math.round((d.gradedTotal / (d.gradedTotal + d.pending)) * 100) : null;
  const activeShare = t.studentsTotal ? Math.round((t.activeWeek / t.studentsTotal) * 100) : null;
  const newCourse = firstParam((await searchParams).new) === '1';

  const summary: string[] = [];
  if (d.pending) summary.push(tr('sumPending', { n: d.pending }));
  if (t.due.length) summary.push(tr('sumDue', { n: t.due.length }));
  if (t.attentionTotal) summary.push(tr('sumAttention', { n: t.attentionTotal }));

  const tasks: { key: string; icon: React.ReactNode; tone: string; title: string; hint: string; href: string; cta: string }[] = [];
  if (d.pending) tasks.push({
    key: 'review', icon: <IconInbox size={18} />, tone: 'amber', title: tr('taskReview', { n: d.pending }),
    hint: d.pendingBlocks.slice(0, 2).map((b) => b.title).join(', ') + (d.pendingBlocks.length > 2 ? tr('andOthers') : ''),
    href: link('/teach/review'), cta: tr('start'),
  });
  if (t.drafts) tasks.push({
    key: 'drafts', icon: <IconCourses size={18} />, tone: 'indigo', title: tr('taskDrafts', { n: t.drafts }),
    hint: tr('taskDraftsHint'), href: link('/teach/courses?status=draft'), cta: tr('open'),
  });
  if (t.unassigned) tasks.push({
    key: 'unassigned', icon: <IconGroup size={18} />, tone: 'rose', title: tr('taskUnassigned', { n: t.unassigned }),
    hint: tr('taskUnassignedHint'), href: link('/teach/courses?status=unassigned'), cta: tr('choose'),
  });
  const temp = groups.reduce((a, g) => a + g.tempPasswords, 0);
  if (temp) tasks.push({
    key: 'temp', icon: <IconFlame size={18} />, tone: 'teal', title: tr('taskTemp', { n: temp }),
    hint: tr('taskTempHint'), href: link('/teach/groups'), cta: tr('toGroups'),
  });

  return (
    <>
      <section className="hero-band">
        <div className="hero-band-text">
          <span className="hero-band-date">{today}</span>
          <h1>{firstName ? tr('helloName', { name: firstName }) : tr('hello')}</h1>
          <p>{summary.length ? `${summary.join(' · ')}.` : tr('allCalm')}</p>
          <div className="hero-band-actions">
            {d.pending > 0 && <Link className="btn btn-light" href={link('/teach/review')}><IconInbox size={16} />{tr('reviewWorks')}</Link>}
            <Link className="btn btn-glass" href={link('/teach/courses/generate')}><IconSpark size={16} />{tr('fromProgram')}</Link>
            <NewCourseDialog org={m.orgSlug} openInitially={newCourse} groups={groups.map((g) => ({ id: g.id, title: g.title }))} />
          </div>
        </div>
        <div className="hero-band-rings">
          <div><Ring value={checkedShare} size={84} stroke={8} tone="#fff" label={tr('ringChecked', { n: checkedShare ?? 0 })} />
            <span>{tr('checked')}</span></div>
          <div><Ring value={activeShare} size={84} stroke={8} tone="#fff" label={tr('ringActive', { n: activeShare ?? 0 })}>
            <b><CountUp value={t.activeWeek} /></b><small>{tr('ofTotal', { n: t.studentsTotal })}</small></Ring>
            <span>{tr('activeWeek')}</span></div>
          <div><Ring value={d.averagePercent} size={84} stroke={8} tone="#fff" label={tr('ringAvg', { n: d.averagePercent ?? 0 })} />
            <span>{tr('avgScore')}</span></div>
        </div>
      </section>

      <div className="today-grid">
        <div className="today-main">
          <section className="cab-card">
            <header className="cab-card-head"><div><h2>{tr('todayTitle')}</h2><span className="muted">{tr('todaySub')}</span></div></header>
            {tasks.length === 0 && t.due.length === 0 ? (
              <EmptyState icon={<IconCheck size={24} />} text={tr('todayEmpty')} />
            ) : (
              <ul className="task-list">
                {tasks.map((k) => (
                  <li key={k.key} className={`task tone-${k.tone}`}>
                    <span className="task-icon">{k.icon}</span>
                    <div><strong>{k.title}</strong><span className="muted">{k.hint}</span></div>
                    <Link className="btn btn-sm" href={k.href}>{k.cta}<IconChevronRight size={14} /></Link>
                  </li>
                ))}
                {t.due.map((x) => {
                  const share = x.students ? Math.round((x.done / x.students) * 100) : 0;
                  const overdue = new Date(x.dueAt).getTime() < Date.now();
                  return (
                    <li key={x.topicId} className={`task tone-${overdue ? 'rose' : 'blue'}`}>
                      <span className="task-icon"><IconTask size={18} /></span>
                      <div>
                        <strong>{x.title}</strong>
                        <span className="muted">{tr('dueLine', { course: x.course, date: formatDate(x.dueAt, locale, { weekday: 'short', day: 'numeric', month: 'short' }) })}{overdue ? tr('duePassed') : ''}</span>
                        <span className="task-progress"><Bar value={share} label={tr('handedShare', { n: share })} tone={overdue ? 'var(--cab-rose)' : 'var(--accent)'} /><small>{tr('doneOf', { done: x.done, total: x.students })}</small></span>
                      </div>
                      <Link className="btn btn-sm btn-ghost" href={link(`/teach/courses/${x.courseId}/journal`)}>{tr('journal')}</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <ChartCard title={tr('chartTitle')} days={d.chart.days} periods={[7, 30]} initialPeriod={30}
            emptyHint={tr('chartEmpty')}
            series={[
              { key: 'submitted', label: tr('seriesSubmitted'), values: d.chart.submitted, color: 1, area: true },
              { key: 'graded', label: tr('seriesGraded'), values: d.chart.graded, color: 3, dashed: true },
            ]} />

          <section className="cab-card">
            <header className="cab-card-head"><div><h2>{tr('feedTitle')}</h2><span className="muted">{tr('feedSub')}</span></div></header>
            {t.feed.length === 0
              ? <EmptyState icon={<IconEye size={24} />} text={tr('feedEmpty')} />
              : <Timeline locale={locale} items={t.feed.map((e, i) => ({
                  key: `${e.kind}-${e.at}-${i}`, icon: FEED[e.kind].icon, tone: FEED[e.kind].tone, who: e.who, at: e.at, href: link(e.href),
                  text: <>{tr(FEED[e.kind].verb)} <em>{e.what}</em> <span className="muted">· {e.where}</span></>,
                }))} />}
          </section>
        </div>

        <aside className="today-side">
          <section className="cab-card">
            <header className="cab-card-head">
              <div><h2>{tr('attentionTitle')}</h2><span className="muted">{t.attentionTotal ? tr('students', { n: t.attentionTotal }) : tr('allOk')}</span></div>
            </header>
            {t.attention.length === 0 ? (
              <EmptyState icon={<IconCheck size={24} />} text={tr('attentionEmpty')} />
            ) : (
              <ul className="people-list">
                {t.attention.map((s) => (
                  <li key={s.id}>
                    <Avatar name={s.name} size={34} />
                    <div><strong>{s.name}</strong><span className="muted">{s.reason}</span></div>
                    <span className={`sev sev-${s.severity}`} title={s.lastActive ? tr('wasActive', { ago: formatAgo(s.lastActive, locale) }) : tr('neverVisited')} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cab-card">
            <header className="cab-card-head"><div><h2>{tr('heatTitle')}</h2><span className="muted">{tr('heatSub')}</span></div></header>
            <div className="cab-card-pad"><Heatmap locale={locale} days={t.heat.days} values={t.heat.values} label={tr('heatLabel')} /></div>
          </section>

          <section className="cab-card">
            <header className="cab-card-head">
              <h2>{isAdmin ? tr('groupsTitle') : tr('myGroups')}</h2>
              <Link className="btn btn-sm btn-ghost" href={link('/teach/groups')}>{tr('all')}</Link>
            </header>
            {groups.length === 0 ? (
              <EmptyState icon={<IconGroup size={24} />} text={tr('noGroups')} />
            ) : (
              <ul className="mini-groups">
                {groups.slice(0, 6).map((g) => (
                  <li key={g.id}>
                    <Link href={link(`/teach/groups/${g.id}`)}>
                      <span className="mini-group-badge">{g.title.slice(0, 3)}</span>
                      <div><strong>{g.title}</strong><span className="muted">{tr('miniGroupLine', { students: tr('students', { n: g.students }), active: g.activeWeek })}</span></div>
                      <Ring value={g.avgPercent} size={44} stroke={4} label={tr('groupAvgRing', { title: g.title, n: g.avgPercent ?? '—' })} />
                    </Link>
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

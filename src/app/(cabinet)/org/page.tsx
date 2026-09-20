import Link from 'next/link';
import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { orgDashboard } from '@/lib/org/orgs';
import { orgFeed, orgFunnel, teacherActivity, type OrgEventKind } from '@/lib/org/insights';
import { ORG_KIND_LABELS } from '@/lib/org/types';
import { withOrgParam } from '@/lib/lms/links';
import { formatAgo, ruPlural } from '@/lib/lms/format';
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
  const [d, funnel, teachers, feed] = await Promise.all([
    orgDashboard(m.orgId), orgFunnel(m.orgId), teacherActivity(m.orgId), orgFeed(m.orgId),
  ]);
  const link = (href: string) => withOrgParam(href, m.orgSlug);
  const f = funnel.total;
  const pct = (n: number) => (f.added ? Math.round((n / f.added) * 100) : null);
  const stuck = f.added - f.submitted;
  const pendingAll = teachers.reduce((a, t) => a + t.pending, 0);

  const summary: string[] = [];
  if (f.added) summary.push(`${f.submitted} из ${f.added} ${ruPlural(f.added, 'ученика', 'учеников', 'учеников')} уже сдают работы`);
  if (d.tempPasswords.total) summary.push(`${d.tempPasswords.total} ещё не вошли`);
  if (pendingAll) summary.push(`${pendingAll} ${ruPlural(pendingAll, 'работа ждёт', 'работы ждут', 'работ ждут')} проверки у учителей`);

  return (
    <>
      <section className="hero-band hero-org">
        <div className="hero-band-text">
          <span className="hero-band-date">{ORG_KIND_LABELS[m.orgKind]} · обзор</span>
          <h1>{m.orgName}</h1>
          <p>{summary.length ? `${summary.join(' · ')}.` : 'Добавьте учителей и группы — здесь появится жизнь школы.'}</p>
          <div className="hero-band-actions">
            <Link href={link('/org/groups')} className="btn btn-light"><IconPlus size={16} />Новая группа</Link>
            <Link href={link('/org/teachers?add=1')} className="btn btn-glass">Добавить учителя</Link>
          </div>
        </div>
        <div className="hero-band-rings">
          <div><Ring value={pct(f.loggedIn)} size={84} stroke={8} tone="#fff" label={`Вошли ${pct(f.loggedIn) ?? 0}% учеников`} /><span>вошли</span></div>
          <div><Ring value={pct(f.opened)} size={84} stroke={8} tone="#fff" label={`Занимаются ${pct(f.opened) ?? 0}% учеников`} /><span>занимаются</span></div>
          <div><Ring value={pct(f.submitted)} size={84} stroke={8} tone="#fff" label={`Сдают работы ${pct(f.submitted) ?? 0}% учеников`} /><span>сдают работы</span></div>
        </div>
      </section>

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
          href={link('/teach/courses')} icon={<IconCourses size={20} />} />
      </StatCards>

      <div className="today-grid">
        <div className="today-main">
          <section className="cab-card">
            <header className="cab-card-head">
              <div><h2>Путь ученика</h2><span className="muted">От выданного пароля до первой сданной работы</span></div>
              {stuck > 0 && <StatusPill tone="warn">застряли: {stuck}</StatusPill>}
            </header>
            {f.added === 0 ? (
              <EmptyState icon={<IconPeople size={24} />} text="Учеников пока нет — создайте группу и вставьте список класса.">
                <Link href={link('/org/groups')} className="btn btn-primary">Создать группу</Link>
              </EmptyState>
            ) : (
              <>
                <div className="cab-card-pad"><FunnelBars total={f} /></div>
                {funnel.groups.length > 0 && <FunnelByGroup groups={funnel.groups} hrefOf={(id) => `/org/groups/${id}`} />}
              </>
            )}
          </section>

          <section className="cab-section">
            <header className="cab-section-head">
              <h2>Учителя</h2>
              <Link href={link('/org/teachers')} className="btn btn-sm btn-ghost">Все учителя</Link>
            </header>
            {teachers.length === 0 ? (
              <div className="cab-card">
                <EmptyState icon={<IconTeach size={24} />} text="Учителей пока нет — добавьте первого по почте или логину.">
                  <Link href={link('/org/teachers?add=1')} className="btn btn-primary">Добавить учителя</Link>
                </EmptyState>
              </div>
            ) : <TeacherCards teachers={teachers} />}
          </section>

          <ChartCard title="Сданные ответы по дням" days={d.chart.days} periods={[7, 30]} initialPeriod={30}
            emptyHint="За 30 дней ученики ещё ничего не сдавали."
            series={[
              { key: 'submitted', label: 'Сдано', values: d.chart.submitted, color: 1, area: true },
              { key: 'graded', label: 'Проверено', values: d.chart.graded, color: 3, dashed: true },
            ]} />
        </div>

        <aside className="today-side">
          <section className="cab-card">
            <header className="cab-card-head"><div><h2>Жизнь школы</h2><span className="muted">Последние события</span></div><span className="live-dot" aria-hidden="true" /></header>
            {feed.length === 0
              ? <EmptyState icon={<IconCheck size={24} />} text="Событий пока нет." />
              : <Timeline items={feed.map((e, i) => ({
                  key: `${e.kind}-${e.at}-${i}`, icon: EVENTS[e.kind].icon, tone: EVENTS[e.kind].tone,
                  who: e.who, text: e.what, at: e.at, href: e.href ? link(e.href) : null,
                }))} />}
          </section>

          <section className="cab-card">
            <header className="cab-card-head">
              <div><h2>Ещё не вошли</h2><span className="muted">С временным паролем{d.tempPasswords.total > d.tempPasswords.rows.length ? ` · всего ${d.tempPasswords.total}` : ''}</span></div>
              {d.tempPasswords.total > 0 && <b className="side-count"><CountUp value={d.tempPasswords.total} /></b>}
            </header>
            {d.tempPasswords.rows.length === 0 ? (
              <EmptyState icon={<IconCheck size={24} />} text="Все ученики уже вошли и сменили временный пароль." />
            ) : (
              <ul className="people-list">
                {d.tempPasswords.rows.map((s) => (
                  <li key={s.userId}>
                    <Avatar name={s.label} size={32} />
                    <div><strong>{s.label}</strong><span className="muted">{s.groups.join(', ') || 'без группы'} · добавлен {formatAgo(s.createdAt)}</span></div>
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

import Link from 'next/link';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { listStaffCourses } from '@/lib/lms/courses';
import { allowedGroupIds } from '@/lib/lms/access';
import { progressPercent, teachDashboard } from '@/lib/lms/overview';
import { COURSE_STATUS_LABELS } from '@/lib/lms/types';
import { answersHref, learnCourseHref } from '@/lib/lms/links';
import { ruPlural } from '@/lib/lms/format';
import { listGroups } from '@/lib/org/groups';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatCard, { StatCards } from '@/components/cabinet/StatCard';
import StatusPill from '@/components/cabinet/StatusPill';
import EmptyState from '@/components/cabinet/EmptyState';
import NewCourseDialog from '@/components/cabinet/NewCourseDialog';
import ChartCard from '@/components/cabinet/charts/ChartCard';
import { IconCheck, IconCourses, IconPrint } from '@/components/icons';
import { IconGroup, IconInbox, IconPeople, IconStar, IconView } from '@/components/cabinet/icons';

export default async function TeachPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach', ['teacher'], searchParams);
  if (!ctx) return null;
  const { user } = ctx;
  const m = ctx.cabinet.membership;
  const isAdmin = m.role === 'org_admin';
  const ownerId = isAdmin ? null : user.id;
  const [courses, allowed, groups] = await Promise.all([
    listStaffCourses(m.orgId, ownerId),
    allowedGroupIds(user, m),
    listGroups(m.orgId),
  ]);
  const d = await teachDashboard(m.orgId, ownerId, allowed);
  const mine = groups.filter((g) => allowed.includes(g.id));
  const live = courses.filter((c) => c.status !== 'archived');
  const published = live.filter((c) => c.status === 'published').length;
  const firstPending = d.pendingBlocks[0];
  const pendingOf = (courseId: string) => d.pendingBlocks.find((b) => b.courseId === courseId);

  return (
    <>
      <CabinetHeader title="Преподавание" subtitle={isAdmin ? `${m.orgName} · все курсы организации` : m.orgName}>
        <NewCourseDialog org={m.orgSlug} openInitially={firstParam((await searchParams).new) === '1'} />
      </CabinetHeader>

      <StatCards>
        <StatCard tone="indigo" value={live.length} label={isAdmin ? ruPlural(live.length, 'курс', 'курса', 'курсов') : ruPlural(live.length, 'мой курс', 'моих курса', 'моих курсов')}
          hint={`опубликовано: ${published}`} icon={<IconCourses size={20} />} />
        <StatCard tone="blue" value={d.students} label={ruPlural(d.students, 'ученик', 'ученика', 'учеников')}
          hint={`в ${mine.length} ${ruPlural(mine.length, 'группе', 'группах', 'группах')} и курсах`} icon={<IconPeople size={20} />} />
        <StatCard tone="amber" value={d.pending} label={ruPlural(d.pending, 'ответ ждёт проверки', 'ответа ждут проверки', 'ответов ждут проверки')}
          hint={firstPending ? 'открыть непроверенные →' : 'всё проверено'}
          href={firstPending ? answersHref(firstPending.courseId, firstPending.blockId, { pending: true }) : undefined}
          spark={d.chart.submitted.slice(-14)} sparkLabel="Сданные ответы за 14 дней" icon={<IconInbox size={20} />} />
        <StatCard tone="rose" value={d.averagePercent === null ? '—' : `${d.averagePercent}%`} label="средний балл"
          hint={d.gradedTotal ? `по ${d.gradedTotal} ${ruPlural(d.gradedTotal, 'проверенной работе', 'проверенным работам', 'проверенным работам')}` : 'проверенных работ пока нет'}
          spark={d.chart.graded.slice(-14)} sparkLabel="Проверенные работы за 14 дней" icon={<IconStar size={20} />} />
      </StatCards>

      <section className="cab-section">
        <header className="cab-section-head">
          <h2>{isAdmin ? 'Курсы организации' : 'Мои курсы'}</h2>
        </header>
        {courses.length === 0 ? (
          <div className="cab-card">
            <EmptyState icon={<IconCourses size={24} />} text="Курсов пока нет — создайте первый, например «Физика 7: механика».">
              <NewCourseDialog org={m.orgSlug} />
            </EmptyState>
          </div>
        ) : (
          <div className="course-cards">
            {courses.map((c) => {
              const p = d.progress[c.id];
              const percent = progressPercent(p);
              const pending = pendingOf(c.id);
              return (
                <article key={c.id} className={c.status === 'archived' ? 'course-card archived' : 'course-card'}>
                  <header>
                    <StatusPill tone={c.status === 'published' ? 'ok' : 'neutral'}>{COURSE_STATUS_LABELS[c.status]}</StatusPill>
                    {c.subject && <span className="muted">{c.subject}</span>}
                  </header>
                  <h3><Link href={`/teach/courses/${c.id}`}>{c.title}</Link></h3>
                  <p className="muted">
                    {c.groupTitles.length ? c.groupTitles.join(', ') : 'никому не открыт'}
                    {isAdmin && ` · ${c.ownerLabel}`}
                  </p>
                  <dl className="course-card-facts">
                    <div><dt>Тем</dt><dd>{c.topicCount}</dd></div>
                    <div><dt>Учеников</dt><dd>{p?.students ?? 0}</dd></div>
                    <div><dt>Проверено</dt><dd>{p?.graded ?? 0}</dd></div>
                  </dl>
                  <div className="course-card-progress">
                    <span className="muted">Открыто тем</span><span className="num">{percent}%</span>
                    <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
                      aria-label={`Ученики открыли ${percent}% тем`}><i style={{ width: `${percent}%` }} /></div>
                  </div>
                  <footer>
                    {c.ungraded > 0 && pending
                      ? <Link className="btn btn-sm btn-warn" href={answersHref(c.id, pending.blockId, { pending: true })}>Проверить: {c.ungraded}</Link>
                      : <Link className="btn btn-sm btn-secondary" href={`/teach/courses/${c.id}`}>Редактор</Link>}
                    <Link className="btn btn-sm btn-ghost" href={`/teach/courses/${c.id}/journal`}>Журнал</Link>
                    <Link className="btn btn-sm btn-ghost" href={`/teach/courses/${c.id}/progress`}>Прогресс</Link>
                    <a className="cab-icon-btn course-card-view" href={learnCourseHref(c.id, true)} target="_blank" rel="noopener noreferrer"
                      title="Как видит ученик" aria-label={`Открыть курс «${c.title}» так, как его видит ученик`}><IconView size={18} /></a>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head">
            <h2>Ждут проверки</h2>
            {d.pending > 0 && <StatusPill tone="warn">{d.pending}</StatusPill>}
          </header>
          {d.pendingBlocks.length === 0 ? (
            <EmptyState icon={<IconCheck size={24} />} text="Непроверенных ответов нет." />
          ) : (
            <ul className="cab-list">
              {d.pendingBlocks.slice(0, 6).map((b) => (
                <li key={b.blockId}>
                  <div>
                    <Link href={answersHref(b.courseId, b.blockId, { pending: true })}>{b.title}</Link>
                    <span className="muted">{b.courseTitle} · {b.topicTitle}</span>
                  </div>
                  <StatusPill tone="warn">{b.pending}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cab-card">
          <header className="cab-card-head"><h2>{isAdmin ? 'Группы организации' : 'Мои группы'}</h2></header>
          {mine.length === 0 ? (
            <EmptyState icon={<IconGroup size={24} />} text="Вам пока не назначены группы — их назначает администратор организации." />
          ) : (
            <ul className="cab-list">
              {mine.slice(0, 8).map((g) => (
                <li key={g.id}>
                  <div>
                    <Link href={`/org/groups/${g.id}`}>{g.title}</Link>
                    <span className="muted">{g.studentCount} {ruPlural(g.studentCount, 'ученик', 'ученика', 'учеников')}</span>
                  </div>
                  <Link className="btn btn-sm btn-ghost" href={`/org/groups/${g.id}/credentials`}><IconPrint size={15} />Лист паролей</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ChartCard title="Ответы по дням" days={d.chart.days}
        emptyHint="За 30 дней ответов не было: опубликуйте курс с заданиями и откройте его группе."
        series={[
          { key: 'submitted', label: 'Сдано', values: d.chart.submitted, color: 1, area: true },
          { key: 'graded', label: 'Проверено', values: d.chart.graded, color: 3, dashed: true },
        ]} />
    </>
  );
}

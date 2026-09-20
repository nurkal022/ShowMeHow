import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { canManageGroup, requireOrgRole } from '@/lib/org/access';
import { getGroup, listGroupTeachers } from '@/lib/org/groups';
import { getOrgById } from '@/lib/org/orgs';
import { teachGroupDetail } from '@/lib/lms/teach-home';
import { ruPlural } from '@/lib/lms/format';
import { learnCourseHref, withOrgParam } from '@/lib/lms/links';
import { COURSE_STATUS_LABELS, type CourseStatus } from '@/lib/lms/types';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import EmptyState from '@/components/cabinet/EmptyState';
import StatusPill from '@/components/cabinet/StatusPill';
import Sparkline from '@/components/cabinet/charts/Sparkline';
import CountUp from '@/components/motion/CountUp';
import GroupStudents from '@/components/teach/GroupStudents';
import { Ring } from '@/components/cabinet/viz';
import { IconCourses, IconPrint } from '@/components/icons';
import { IconSettings, IconView } from '@/components/cabinet/icons';

export default async function TeachGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/groups/${id}`);
  if (!user) return null;
  if (!(await canManageGroup(user, id))) notFound();
  const group = await getGroup(id);
  const org = group ? await getOrgById(group.orgId) : null;
  if (!group || !org) notFound();
  const isAdmin = (await requireOrgRole(user, org.id, ['org_admin'])) !== null;
  const [detail, teachers] = await Promise.all([teachGroupDetail(group.id, user.id), listGroupTeachers(group.id)]);
  const link = (href: string) => withOrgParam(href, org.slug);

  const s = detail.students.filter((x) => !x.disabled);
  const week = Date.now() - 7 * 86_400_000;
  const active = s.filter((x) => x.lastActive && new Date(x.lastActive).getTime() >= week).length;
  const graded = s.filter((x) => x.avgPercent !== null);
  const avg = graded.length ? Math.round(graded.reduce((a, x) => a + (x.avgPercent ?? 0), 0) / graded.length) : null;
  const opened = s.reduce((a, x) => a + x.opened, 0);
  const topics = s.reduce((a, x) => a + x.topics, 0);
  const progress = topics ? Math.round((opened / topics) * 100) : null;
  const pending = s.reduce((a, x) => a + x.pending, 0);

  return (
    <>
      <CabinetHeader title={`Группа ${group.title}`}
        subtitle={`${org.name} · ${teachers.map((t) => t.label).join(', ') || 'учитель не назначен'}`}>
        <Link className="btn" href={`/org/groups/${group.id}/credentials`}><IconPrint size={16} />Лист паролей</Link>
        <Link className="btn btn-ghost" href={`/org/groups/${group.id}`}><IconSettings size={16} />{isAdmin ? 'Управление' : 'Пароли и доступ'}</Link>
      </CabinetHeader>

      <section className="group-hero">
        <div className="group-hero-stat">
          <Ring value={progress} size={72} stroke={7} label={`Группа прошла ${progress ?? 0}% тем`} />
          <div><strong>Прогресс</strong><span className="muted">открыто тем из опубликованных курсов</span></div>
        </div>
        <div className="group-hero-stat">
          <Ring value={avg} size={72} stroke={7} tone="var(--cab-teal)" label={`Средний балл ${avg ?? 0}%`} />
          <div><strong>Средний балл</strong><span className="muted">{graded.length ? `по ${graded.length} ${ruPlural(graded.length, 'ученику', 'ученикам', 'ученикам')}` : 'проверенных работ нет'}</span></div>
        </div>
        <div className="group-hero-num">
          <b><CountUp value={active} /><small>/{s.length}</small></b>
          <span className="muted">активны за неделю</span>
        </div>
        <div className="group-hero-num">
          <b className={pending ? 'hot' : ''}><CountUp value={pending} /></b>
          <span className="muted">{ruPlural(pending, 'работа ждёт', 'работы ждут', 'работ ждут')} проверки</span>
        </div>
        <div className="group-hero-chart">
          <span className="muted">Активность за 30 дней</span>
          {detail.spark.some((v) => v > 0)
            ? <Sparkline values={detail.spark} label="Активность учеников группы за 30 дней" />
            : <span className="muted">пока нет</span>}
        </div>
      </section>

      <div className="group-layout">
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>Ученики</h2><span className="muted">Прогресс по всем опубликованным курсам группы</span></div></header>
          <GroupStudents students={detail.students} />
        </section>

        <section className="cab-card">
          <header className="cab-card-head"><div><h2>Курсы группы</h2><span className="muted">{detail.courses.length} {ruPlural(detail.courses.length, 'курс', 'курса', 'курсов')}</span></div></header>
          {detail.courses.length === 0 ? (
            <EmptyState icon={<IconCourses size={24} />} text="Группе ещё не открыт ни один курс — откройте его в настройках курса.">
              <Link className="btn btn-primary" href={link('/teach/courses')}>К курсам</Link>
            </EmptyState>
          ) : (
            <ul className="group-courses">
              {detail.courses.map((c) => (
                <li key={c.id}>
                  <Ring value={c.progress} size={44} stroke={4} label={`Прошли ${c.progress}% тем`} />
                  <div>
                    {c.mine || isAdmin ? <Link href={link(`/teach/courses/${c.id}/progress`)}>{c.title}</Link> : <strong>{c.title}</strong>}
                    <span className="muted">{c.topics} {ruPlural(c.topics, 'тема', 'темы', 'тем')}{c.mine ? '' : ` · ${c.owner}`}</span>
                    <span className="chip-row">
                      <StatusPill tone={c.status === 'published' ? 'ok' : 'neutral'}>{COURSE_STATUS_LABELS[c.status as CourseStatus]}</StatusPill>
                      {c.pending > 0 && <StatusPill tone="warn">{c.pending} на проверку</StatusPill>}
                    </span>
                  </div>
                  {(c.mine || isAdmin) && (
                    <a className="cab-icon-btn" href={learnCourseHref(c.id, true)} target="_blank" rel="noopener noreferrer"
                      title="Как видит ученик" aria-label={`Открыть «${c.title}» как ученик`}><IconView size={17} /></a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

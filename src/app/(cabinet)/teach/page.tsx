import Link from 'next/link';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { allowedGroupIds } from '@/lib/lms/access';
import { teachDashboard } from '@/lib/lms/overview';
import { teachGroups, teachToday, type FeedKind } from '@/lib/lms/teach-home';
import { formatAgo, ruPlural } from '@/lib/lms/format';
import { withOrgParam } from '@/lib/lms/links';
import NewCourseDialog from '@/components/cabinet/NewCourseDialog';
import ChartCard from '@/components/cabinet/charts/ChartCard';
import EmptyState from '@/components/cabinet/EmptyState';
import CountUp from '@/components/motion/CountUp';
import { Avatar, Bar, Heatmap, Ring, Timeline, type TimelineItem } from '@/components/cabinet/viz';
import { IconCheck, IconCourses, IconEye, IconFlame, IconSpark, IconTask, IconUndo } from '@/components/icons';
import { IconChevronRight, IconGroup, IconInbox } from '@/components/cabinet/icons';

const FEED: Record<FeedKind, { icon: React.ReactNode; tone: TimelineItem['tone']; verb: string }> = {
  submitted: { icon: <IconTask size={14} />, tone: 'blue', verb: 'сдал работу' },
  graded: { icon: <IconCheck size={14} />, tone: 'green', verb: 'получил оценку за' },
  returned: { icon: <IconUndo size={14} />, tone: 'amber', verb: 'получил на доработку' },
  opened: { icon: <IconEye size={14} />, tone: 'violet', verb: 'открыл урок' },
};

export default async function TeachTodayPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/teach', ['teacher'], searchParams);
  if (!ctx) return null;
  const { user } = ctx;
  const m = ctx.cabinet.membership;
  const isAdmin = m.role === 'org_admin';
  const ownerId = isAdmin ? null : user.id;
  const allowed = await allowedGroupIds(user, m);
  const [d, t, groups] = await Promise.all([
    teachDashboard(m.orgId, ownerId, allowed),
    teachToday(m.orgId, ownerId, allowed),
    teachGroups(m.orgId, allowed),
  ]);
  const link = (href: string) => withOrgParam(href, m.orgSlug);
  const firstName = (user.displayName ?? '').trim().split(/\s+/)[0] || '';
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const checkedShare = d.gradedTotal + d.pending ? Math.round((d.gradedTotal / (d.gradedTotal + d.pending)) * 100) : null;
  const activeShare = t.studentsTotal ? Math.round((t.activeWeek / t.studentsTotal) * 100) : null;
  const newCourse = firstParam((await searchParams).new) === '1';

  const summary: string[] = [];
  if (d.pending) summary.push(`${d.pending} ${ruPlural(d.pending, 'работа ждёт', 'работы ждут', 'работ ждут')} проверки`);
  if (t.due.length) summary.push(`${t.due.length} ${ruPlural(t.due.length, 'срок', 'срока', 'сроков')} на этой неделе`);
  if (t.attentionTotal) summary.push(`${t.attentionTotal} ${ruPlural(t.attentionTotal, 'ученику', 'ученикам', 'ученикам')} нужно внимание`);

  const tasks: { key: string; icon: React.ReactNode; tone: string; title: string; hint: string; href: string; cta: string }[] = [];
  if (d.pending) tasks.push({
    key: 'review', icon: <IconInbox size={18} />, tone: 'amber', title: `Проверить ${d.pending} ${ruPlural(d.pending, 'работу', 'работы', 'работ')}`,
    hint: d.pendingBlocks.slice(0, 2).map((b) => b.title).join(', ') + (d.pendingBlocks.length > 2 ? ' и другие' : ''),
    href: link('/teach/review'), cta: 'Начать',
  });
  if (t.drafts) tasks.push({
    key: 'drafts', icon: <IconCourses size={18} />, tone: 'indigo', title: `${t.drafts} ${ruPlural(t.drafts, 'курс', 'курса', 'курсов')} в черновике`,
    hint: 'Ученики не видят черновики — опубликуйте, когда будет готово.', href: link('/teach/courses?status=draft'), cta: 'Открыть',
  });
  if (t.unassigned) tasks.push({
    key: 'unassigned', icon: <IconGroup size={18} />, tone: 'rose', title: `${t.unassigned} ${ruPlural(t.unassigned, 'курс никому не открыт', 'курса никому не открыты', 'курсов никому не открыты')}`,
    hint: 'Выберите группы в настройках курса.', href: link('/teach/courses?status=unassigned'), cta: 'Выбрать',
  });
  const temp = groups.reduce((a, g) => a + g.tempPasswords, 0);
  if (temp) tasks.push({
    key: 'temp', icon: <IconFlame size={18} />, tone: 'teal', title: `${temp} ${ruPlural(temp, 'ученик ещё не вошёл', 'ученика ещё не вошли', 'учеников ещё не вошли')}`,
    hint: 'Раздайте листы с логинами и паролями.', href: link('/teach/groups'), cta: 'К группам',
  });

  return (
    <>
      <section className="hero-band">
        <div className="hero-band-text">
          <span className="hero-band-date">{today}</span>
          <h1>{firstName ? `Здравствуйте, ${firstName}` : 'Здравствуйте'}</h1>
          <p>{summary.length ? `${summary.join(' · ')}.` : 'Всё спокойно: непроверенных работ нет, ученики занимаются.'}</p>
          <div className="hero-band-actions">
            {d.pending > 0 && <Link className="btn btn-light" href={link('/teach/review')}><IconInbox size={16} />Проверить работы</Link>}
            <Link className="btn btn-glass" href={link('/teach/courses/generate')}><IconSpark size={16} />Курс из программы</Link>
            <NewCourseDialog org={m.orgSlug} openInitially={newCourse} groups={groups.map((g) => ({ id: g.id, title: g.title }))} />
          </div>
        </div>
        <div className="hero-band-rings">
          <div><Ring value={checkedShare} size={84} stroke={8} tone="#fff" label={`Проверено ${checkedShare ?? 0}% сданных работ`} />
            <span>проверено</span></div>
          <div><Ring value={activeShare} size={84} stroke={8} tone="#fff" label={`Активны за неделю ${activeShare ?? 0}% учеников`}>
            <b><CountUp value={t.activeWeek} /></b><small>из {t.studentsTotal}</small></Ring>
            <span>активны за неделю</span></div>
          <div><Ring value={d.averagePercent} size={84} stroke={8} tone="#fff" label={`Средний балл ${d.averagePercent ?? 0}%`} />
            <span>средний балл</span></div>
        </div>
      </section>

      <div className="today-grid">
        <div className="today-main">
          <section className="cab-card">
            <header className="cab-card-head"><div><h2>Дела на сегодня</h2><span className="muted">Что стоит сделать в первую очередь</span></div></header>
            {tasks.length === 0 && t.due.length === 0 ? (
              <EmptyState icon={<IconCheck size={24} />} text="Всё сделано: работы проверены, курсы открыты группам." />
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
                        <span className="muted">{x.course} · срок {new Date(x.dueAt).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}{overdue ? ' — прошёл' : ''}</span>
                        <span className="task-progress"><Bar value={share} label={`Сдали ${share}%`} tone={overdue ? 'var(--cab-rose)' : 'var(--accent)'} /><small>{x.done} из {x.students}</small></span>
                      </div>
                      <Link className="btn btn-sm btn-ghost" href={link(`/teach/courses/${x.courseId}/journal`)}>Журнал</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <ChartCard title="Ответы по дням" days={d.chart.days} periods={[7, 30]} initialPeriod={30}
            emptyHint="За 30 дней ответов не было: опубликуйте курс с заданиями и откройте его группе."
            series={[
              { key: 'submitted', label: 'Сдано', values: d.chart.submitted, color: 1, area: true },
              { key: 'graded', label: 'Проверено', values: d.chart.graded, color: 3, dashed: true },
            ]} />

          <section className="cab-card">
            <header className="cab-card-head"><div><h2>Что происходит</h2><span className="muted">Последние действия учеников в ваших курсах</span></div></header>
            {t.feed.length === 0
              ? <EmptyState icon={<IconEye size={24} />} text="Пока тихо — события появятся, когда ученики откроют уроки." />
              : <Timeline items={t.feed.map((e, i) => ({
                  key: `${e.kind}-${e.at}-${i}`, icon: FEED[e.kind].icon, tone: FEED[e.kind].tone, who: e.who, at: e.at, href: link(e.href),
                  text: <>{FEED[e.kind].verb} <em>{e.what}</em> <span className="muted">· {e.where}</span></>,
                }))} />}
          </section>
        </div>

        <aside className="today-side">
          <section className="cab-card">
            <header className="cab-card-head">
              <div><h2>Нужно внимание</h2><span className="muted">{t.attentionTotal ? `${t.attentionTotal} ${ruPlural(t.attentionTotal, 'ученик', 'ученика', 'учеников')}` : 'все в порядке'}</span></div>
            </header>
            {t.attention.length === 0 ? (
              <EmptyState icon={<IconCheck size={24} />} text="Все ученики занимаются и справляются." />
            ) : (
              <ul className="people-list">
                {t.attention.map((s) => (
                  <li key={s.id}>
                    <Avatar name={s.name} size={34} />
                    <div><strong>{s.name}</strong><span className="muted">{s.reason}</span></div>
                    <span className={`sev sev-${s.severity}`} title={s.lastActive ? `Был ${formatAgo(s.lastActive)}` : 'Не заходил'} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cab-card">
            <header className="cab-card-head"><div><h2>Активность учеников</h2><span className="muted">12 недель: уроки и сдачи</span></div></header>
            <div className="cab-card-pad"><Heatmap days={t.heat.days} values={t.heat.values} label="Активность учеников по дням за 12 недель" /></div>
          </section>

          <section className="cab-card">
            <header className="cab-card-head">
              <h2>{isAdmin ? 'Группы' : 'Мои группы'}</h2>
              <Link className="btn btn-sm btn-ghost" href={link('/teach/groups')}>Все</Link>
            </header>
            {groups.length === 0 ? (
              <EmptyState icon={<IconGroup size={24} />} text="Вам пока не назначены группы — их назначает администратор организации." />
            ) : (
              <ul className="mini-groups">
                {groups.slice(0, 6).map((g) => (
                  <li key={g.id}>
                    <Link href={link(`/teach/groups/${g.id}`)}>
                      <span className="mini-group-badge">{g.title.slice(0, 3)}</span>
                      <div><strong>{g.title}</strong><span className="muted">{g.students} {ruPlural(g.students, 'ученик', 'ученика', 'учеников')} · активны {g.activeWeek}</span></div>
                      <Ring value={g.avgPercent} size={44} stroke={4} label={`Средний балл группы ${g.title}: ${g.avgPercent ?? '—'}%`} />
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

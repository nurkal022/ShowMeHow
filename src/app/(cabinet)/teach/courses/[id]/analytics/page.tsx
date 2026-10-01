import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { courseAnalytics } from '@/lib/lms/analytics';
import { answersHref } from '@/lib/lms/links';
import { formatDate } from '@/i18n/core';
import { getLocale, getT } from '@/i18n/server';
import { teachReview } from '@/i18n/messages/teach-review';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import StatCard, { StatCards } from '@/components/cabinet/StatCard';
import { IconAlert, IconCheck, IconCourses, IconTask } from '@/components/icons';
import { IconPeople } from '@/components/cabinet/icons';

function tone(p: number | null): string {
  if (p === null) return 'none';
  return p >= 80 ? 'good' : p >= 55 ? 'mid' : 'bad';
}

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/analytics`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const tr = await getT(teachReview);
  const locale = await getLocale();
  const a = await courseAnalytics(id, locale);
  const scored = a.tasks.filter((t) => t.avgPercent !== null);
  const avg = scored.length ? Math.round(scored.reduce((s, t) => s + (t.avgPercent ?? 0), 0) / scored.length) : null;
  const hardest = [...scored].sort((x, y) => (x.avgPercent ?? 0) - (y.avgPercent ?? 0)).slice(0, 5);
  const funnelMax = Math.max(1, a.students);
  const done = a.funnel.length ? a.funnel[a.funnel.length - 1].finished : 0;

  return (
    <>
      <CabinetHeader title={tr('analyticsTitle', { title: staff.course.title })} subtitle={tr('analyticsSub')} />
      <StatCards>
        <StatCard locale={locale} tone="blue" value={a.students} label={tr('statStudents')} icon={<IconPeople size={20} />} />
        <StatCard locale={locale} tone="indigo" value={a.tasks.length} label={tr('statTasks')} hint={tr('statPending', { n: a.tasks.reduce((s, t) => s + t.pending, 0) })} icon={<IconTask size={20} />} />
        <StatCard locale={locale} tone="teal" value={avg === null ? '—' : `${avg}%`} label={tr('statAvg')} hint={tr('statAvgHint')} icon={<IconCheck size={20} />} />
        <StatCard locale={locale} tone="rose" value={a.risk.length} label={tr('statRisk')} hint={a.risk.length ? tr('listBelow') : tr('allOk')} icon={<IconAlert size={20} />} />
      </StatCards>

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>{tr('hardest')}</h2><span className="muted">{tr('hardestSub')}</span></div></header>
          {hardest.length === 0 ? <p className="muted cab-empty">{tr('noGraded')}</p> : (
            <ul className="an-bars">
              {hardest.map((t) => (
                <li key={t.blockId}>
                  <Link href={answersHref(id, t.blockId)}>
                    <span className="an-bar-label"><strong>{t.title}</strong><small>{`${t.typeLabel} · ${t.topicTitle}`}</small></span>
                    <span className={`an-bar ${tone(t.avgPercent)}`}><i style={{ width: `${t.avgPercent}%` }} /></span>
                    <span className="an-bar-num">{`${t.avgPercent}%`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cab-card">
          <header className="cab-card-head"><div><h2>{tr('funnel')}</h2><span className="muted">{tr('funnelSub', { n: done })}</span></div></header>
          <ul className="an-funnel">
            {a.funnel.map((f, i) => (
              <li key={f.topicId}>
                <span className="an-funnel-title"><span className="an-funnel-n">{i + 1}</span>{f.title}</span>
                <span className="an-funnel-bars" aria-label={tr('funnelBars', { o: f.opened, s: f.started, f: f.finished, total: a.students })}>
                  <i className="o" style={{ width: `${(f.opened / funnelMax) * 100}%` }} />
                  <i className="s" style={{ width: `${(f.started / funnelMax) * 100}%` }} />
                  <i className="f" style={{ width: `${(f.finished / funnelMax) * 100}%` }} />
                </span>
                <span className="an-funnel-nums">{`${f.opened} · ${f.started} · ${f.finished}`}</span>
              </li>
            ))}
          </ul>
          <p className="an-legend"><i className="o" />{tr('lgOpened')} <i className="s" />{tr('lgStarted')} <i className="f" />{tr('lgFinished')}</p>
        </section>
      </div>

      <section className="cab-card">
        <header className="cab-card-head"><div><h2>{tr('risk')}</h2><span className="muted">{tr('riskSub')}</span></div></header>
        {a.risk.length === 0 ? <p className="muted cab-empty">{tr('riskEmpty')}</p> : (
          <ul className="cab-list">
            {a.risk.map((r) => (
              <li key={r.id}>
                <div>
                  <Link href={`/teach/courses/${id}/students/${r.id}`}>{r.name}</Link>
                  <span className="muted">{`${r.groups.join(', ')} · ${r.reason}`}</span>
                </div>
                <span className="muted">{r.lastActive ? tr('wasOn', { date: formatDate(r.lastActive, locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) }) : tr('never')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cab-card">
        <header className="cab-card-head"><div><h2>{tr('allTasks')}</h2><span className="muted">{tr('allTasksSub')}</span></div></header>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{tr('assignment')}</th><th>{tr('topic')}</th><th>{tr('answered')}</th><th>{tr('average')}</th><th>{tr('fullScore')}</th><th>{tr('waiting')}</th></tr></thead>
            <tbody>
              {a.tasks.map((t) => (
                <tr key={t.blockId}>
                  <td data-label={tr('assignment')}><Link href={answersHref(id, t.blockId)}>{t.title}</Link><br /><span className="muted">{t.typeLabel}</span></td>
                  <td data-label={tr('topic')}>{t.topicTitle}</td>
                  <td data-label={tr('answered')}>{tr('answeredOf', { n: t.answered, total: a.students })}</td>
                  <td data-label={tr('average')}><span className={`an-chip ${tone(t.avgPercent)}`}>{t.avgPercent === null ? '—' : `${t.avgPercent}%`}</span></td>
                  <td data-label={tr('fullScore')}>{t.fullShare === null ? '—' : `${t.fullShare}%`}</td>
                  <td data-label={tr('waiting')}>{t.pending || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted"><IconCourses size={14} /> {tr('countedNote')}</p>
    </>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { staffCourse } from '@/lib/lms/access';
import { listTopics } from '@/lib/lms/courses';
import { latestDebriefs, topicDebriefStats } from '@/lib/lms/debrief';
import { answersHref } from '@/lib/lms/links';
import { formatAgo } from '@/lib/lms/format';
import { db } from '@/lib/db/client';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import EmptyState from '@/components/cabinet/EmptyState';
import DebriefActions from '@/components/teach/DebriefActions';
import { Bar, Ring } from '@/components/cabinet/viz';
import { IconAlert, IconBulb, IconCheck, IconSpark, IconTask } from '@/components/icons';
import { getLocale, getT } from '@/i18n/server';
import { teachReview } from '@/i18n/messages/teach-review';

/** Разбор урока: по какой теме класс справился, какие ошибки массовые и что делать дальше. */
export default async function DebriefPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const user = await requirePageUser(`/teach/courses/${id}/debrief`);
  if (!user) return null;
  const staff = await staffCourse(user, id);
  if (!staff) notFound();
  const [topics, saved, counts] = await Promise.all([
    listTopics(id), latestDebriefs(id),
    db().query<{ topic_id: string; tasks: number; answers: number }>(
      `SELECT t.id AS topic_id, count(DISTINCT b.id)::int AS tasks, count(s.id)::int AS answers
       FROM topics t LEFT JOIN blocks b ON b.topic_id = t.id AND b.kind = 'assignment'
       LEFT JOIN submissions s ON s.block_id = b.id AND s.status <> 'draft'
       WHERE t.course_id = $1 GROUP BY t.id`, [id]),
  ]);
  const count = new Map(counts.rows.map((r) => [r.topic_id, r]));
  const withTasks = topics.filter((t) => (count.get(t.id)?.tasks ?? 0) > 0);
  const picked = firstParam((await searchParams).topic);
  const topic = withTasks.find((t) => t.id === picked)
    ?? withTasks.find((t) => (count.get(t.id)?.answers ?? 0) > 0 && !saved.has(t.id))
    ?? withTasks[0];
  const debrief = topic ? saved.get(topic.id) ?? null : null;
  const stats = topic ? debrief?.stats ?? await topicDebriefStats(id, topic.id) : null;
  const tr = await getT(teachReview);
  const locale = await getLocale();
  const href = (t: string) => `/teach/courses/${id}/debrief?topic=${t}`;

  return (
    <>
      <CabinetHeader title={tr('debriefTitle', { title: staff.course.title })} subtitle={tr('debriefSub')} />
      {withTasks.length === 0 ? (
        <div className="cab-card"><EmptyState icon={<IconTask size={24} />} text={tr('debriefEmpty')} /></div>
      ) : (
        <div className="debrief">
          <nav className="cab-card debrief-topics" aria-label={tr('topics')}>
            {withTasks.map((t) => {
              const c = count.get(t.id);
              const d = saved.get(t.id);
              return (
                <Link key={t.id} href={href(t.id)} className={t.id === topic?.id ? 'active' : ''} aria-current={t.id === topic?.id ? 'page' : undefined} scroll={false}>
                  <span className={d ? 'debrief-dot done' : c?.answers ? 'debrief-dot ready' : 'debrief-dot'} aria-hidden="true" />
                  <span><b>{t.title}</b><small className="muted">{d ? tr('debriefAgo', { ago: formatAgo(d.createdAt, locale) }) : c?.answers ? tr('answersReady', { n: c.answers }) : tr('noAnswersYet')}</small></span>
                </Link>
              );
            })}
          </nav>

          {topic && stats && (
            <section className="debrief-main" key={topic.id}>
              <div className="cab-card debrief-head">
                <Ring value={stats.avgPercent} size={76} stroke={7} label={tr('avgResult', { n: stats.avgPercent ?? 0 })} />
                <div>
                  <h2>{topic.title}</h2>
                  <span className="muted">{tr('debriefStats', { n: stats.students, opened: stats.opened, finished: stats.finished })}</span>
                  {debrief && <p className="debrief-headline"><IconSpark size={16} />{debrief.summary.headline}</p>}
                </div>
                <DebriefActions topicId={topic.id} hasDebrief={!!debrief} canRun={stats.tasks.some((t) => t.answered > 0)} />
              </div>

              {debrief && (
                <div className="debrief-grid">
                  <section className="cab-card debrief-block tone-green">
                    <h3><IconCheck size={17} />{tr('understood')}</h3>
                    {debrief.summary.understood.length ? <ul>{debrief.summary.understood.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">{tr('noStrengths')}</p>}
                  </section>
                  <section className="cab-card debrief-block tone-blue">
                    <h3><IconBulb size={17} />{tr('nextSteps')}</h3>
                    <ol>{debrief.summary.nextSteps.map((x) => <li key={x}>{x}</li>)}</ol>
                  </section>
                  <section className="cab-card debrief-block tone-rose debrief-wide">
                    <h3><IconAlert size={17} />{tr('misconceptions')}</h3>
                    {debrief.summary.misconceptions.length === 0 ? <p className="muted">{tr('noMisconceptions')}</p> : (
                      <ul className="misconceptions">
                        {debrief.summary.misconceptions.map((m) => (
                          <li key={m.title}>
                            <div className="misc-head"><b>{m.title}</b><span className="misc-share">{tr('ofClass', { n: m.share })}</span></div>
                            <Bar value={m.share} tone="var(--cab-rose)" label={tr('ofClass', { n: m.share })} />
                            <p>{m.detail}</p>
                            {m.tasks.length > 0 && <div className="chip-row">{m.tasks.map((t) => <span key={t} className="chip-sm">{t}</span>)}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {debrief.summary.remedial && <p className="debrief-remedial"><b>{tr('miniLesson')}</b> {debrief.summary.remedial}</p>}
                  </section>
                </div>
              )}

              <section className="cab-card">
                <header className="cab-card-head"><div><h2>{tr('topicTasks')}</h2><span className="muted">{tr('topicTasksSub')}</span></div></header>
                <div className="table-wrap">
                  <table className="data-table debrief-table">
                    <thead><tr><th>{tr('assignment')}</th><th className="center">{tr('handed')}</th><th>{tr('result')}</th><th>{tr('wrongAnswers')}</th></tr></thead>
                    <tbody>
                      {stats.tasks.map((t) => (
                        <tr key={t.blockId}>
                          <td data-label={tr('assignment')}><Link href={answersHref(id, t.blockId)}>{t.title}</Link><small className="muted"> · {t.type}</small></td>
                          <td data-label={tr('handed')} className="center num">{t.answered}/{stats.students}</td>
                          <td data-label={tr('result')}>{t.avgPercent === null ? <span className="muted">{t.pending ? tr('awaitingOne') : '—'}</span>
                            : <span className="inline-meter"><span className="meter"><i style={{ width: `${t.avgPercent}%`, background: t.avgPercent < 55 ? 'var(--cab-rose)' : t.avgPercent < 80 ? 'var(--cab-amber)' : 'var(--success)' }} /></span><span className="num">{t.avgPercent}%</span></span>}</td>
                          <td data-label={tr('wrongShort')}>
                            {t.wrong.length === 0 ? <span className="muted">—</span> : (
                              <ul className="wrong-list">{t.wrong.slice(0, 3).map((w) => <li key={w.answer}><span>{w.answer.length > 90 ? `${w.answer.slice(0, 88)}…` : w.answer}</span><b>×{w.count}</b></li>)}</ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          )}
        </div>
      )}
    </>
  );
}

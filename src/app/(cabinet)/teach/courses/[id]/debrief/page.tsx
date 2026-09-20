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
  const href = (t: string) => `/teach/courses/${id}/debrief?topic=${t}`;

  return (
    <>
      <CabinetHeader title={`Разбор: ${staff.course.title}`} subtitle="Помощник читает ответы класса и объясняет, что понято, а где массовые ошибки" />
      {withTasks.length === 0 ? (
        <div className="cab-card"><EmptyState icon={<IconTask size={24} />} text="В курсе пока нет тем с заданиями — разбирать нечего." /></div>
      ) : (
        <div className="debrief">
          <nav className="cab-card debrief-topics" aria-label="Темы">
            {withTasks.map((t) => {
              const c = count.get(t.id);
              const d = saved.get(t.id);
              return (
                <Link key={t.id} href={href(t.id)} className={t.id === topic?.id ? 'active' : ''} aria-current={t.id === topic?.id ? 'page' : undefined} scroll={false}>
                  <span className={d ? 'debrief-dot done' : c?.answers ? 'debrief-dot ready' : 'debrief-dot'} aria-hidden="true" />
                  <span><b>{t.title}</b><small className="muted">{d ? `разбор ${formatAgo(d.createdAt)}` : c?.answers ? `${c.answers} ответов · можно разобрать` : 'ответов пока нет'}</small></span>
                </Link>
              );
            })}
          </nav>

          {topic && stats && (
            <section className="debrief-main" key={topic.id}>
              <div className="cab-card debrief-head">
                <Ring value={stats.avgPercent} size={76} stroke={7} label={`Средний результат ${stats.avgPercent ?? 0}%`} />
                <div>
                  <h2>{topic.title}</h2>
                  <span className="muted">{stats.students} учеников · открыли {stats.opened} · сдали всё {stats.finished}</span>
                  {debrief && <p className="debrief-headline"><IconSpark size={16} />{debrief.summary.headline}</p>}
                </div>
                <DebriefActions topicId={topic.id} hasDebrief={!!debrief} canRun={stats.tasks.some((t) => t.answered > 0)} />
              </div>

              {debrief && (
                <div className="debrief-grid">
                  <section className="cab-card debrief-block tone-green">
                    <h3><IconCheck size={17} />Что класс понял</h3>
                    {debrief.summary.understood.length ? <ul>{debrief.summary.understood.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">Помощник не выделил сильных сторон.</p>}
                  </section>
                  <section className="cab-card debrief-block tone-blue">
                    <h3><IconBulb size={17} />Что сделать дальше</h3>
                    <ol>{debrief.summary.nextSteps.map((x) => <li key={x}>{x}</li>)}</ol>
                  </section>
                  <section className="cab-card debrief-block tone-rose debrief-wide">
                    <h3><IconAlert size={17} />Массовые ошибки</h3>
                    {debrief.summary.misconceptions.length === 0 ? <p className="muted">Массовых ошибок нет — ошибки единичные.</p> : (
                      <ul className="misconceptions">
                        {debrief.summary.misconceptions.map((m) => (
                          <li key={m.title}>
                            <div className="misc-head"><b>{m.title}</b><span className="misc-share">{m.share}% класса</span></div>
                            <Bar value={m.share} tone="var(--cab-rose)" label={`${m.share}% класса`} />
                            <p>{m.detail}</p>
                            {m.tasks.length > 0 && <div className="chip-row">{m.tasks.map((t) => <span key={t} className="chip-sm">{t}</span>)}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {debrief.summary.remedial && <p className="debrief-remedial"><b>Мини-урок:</b> {debrief.summary.remedial}</p>}
                  </section>
                </div>
              )}

              <section className="cab-card">
                <header className="cab-card-head"><div><h2>Задания темы</h2><span className="muted">Частые неверные ответы — то, на чём спотыкается класс</span></div></header>
                <div className="table-wrap">
                  <table className="data-table debrief-table">
                    <thead><tr><th>Задание</th><th className="center">Сдали</th><th>Результат</th><th>Частые неверные ответы</th></tr></thead>
                    <tbody>
                      {stats.tasks.map((t) => (
                        <tr key={t.blockId}>
                          <td data-label="Задание"><Link href={answersHref(id, t.blockId)}>{t.title}</Link><small className="muted"> · {t.type}</small></td>
                          <td data-label="Сдали" className="center num">{t.answered}/{stats.students}</td>
                          <td data-label="Результат">{t.avgPercent === null ? <span className="muted">{t.pending ? 'ждёт проверки' : '—'}</span>
                            : <span className="inline-meter"><span className="meter"><i style={{ width: `${t.avgPercent}%`, background: t.avgPercent < 55 ? 'var(--cab-rose)' : t.avgPercent < 80 ? 'var(--cab-amber)' : 'var(--success)' }} /></span><span className="num">{t.avgPercent}%</span></span>}</td>
                          <td data-label="Неверные ответы">
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

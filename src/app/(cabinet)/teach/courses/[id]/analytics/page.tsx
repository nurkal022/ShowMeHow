import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { staffCourse } from '@/lib/lms/access';
import { courseAnalytics } from '@/lib/lms/analytics';
import { answersHref } from '@/lib/lms/links';
import { formatDate } from '@/lib/lms/format';
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
  const a = await courseAnalytics(id);
  const scored = a.tasks.filter((t) => t.avgPercent !== null);
  const avg = scored.length ? Math.round(scored.reduce((s, t) => s + (t.avgPercent ?? 0), 0) / scored.length) : null;
  const hardest = [...scored].sort((x, y) => (x.avgPercent ?? 0) - (y.avgPercent ?? 0)).slice(0, 5);
  const funnelMax = Math.max(1, a.students);
  const done = a.funnel.length ? a.funnel[a.funnel.length - 1].finished : 0;

  return (
    <>
      <CabinetHeader title={`Аналитика: ${staff.course.title}`} subtitle="Что даётся трудно, где бросают и кому нужна помощь" />
      <StatCards>
        <StatCard tone="blue" value={a.students} label="учеников в курсе" icon={<IconPeople size={20} />} />
        <StatCard tone="indigo" value={a.tasks.length} label="заданий" hint={`ждут проверки: ${a.tasks.reduce((s, t) => s + t.pending, 0)}`} icon={<IconTask size={20} />} />
        <StatCard tone="teal" value={avg === null ? '—' : `${avg}%`} label="средний результат" hint="по проверенным заданиям" icon={<IconCheck size={20} />} />
        <StatCard tone="rose" value={a.risk.length} label="нужна помощь" hint={a.risk.length ? 'список ниже' : 'все в порядке'} icon={<IconAlert size={20} />} />
      </StatCards>

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>Самые трудные задания</h2><span className="muted">Средний балл по проверенным ответам</span></div></header>
          {hardest.length === 0 ? <p className="muted cab-empty">Проверенных ответов пока нет.</p> : (
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
          <header className="cab-card-head"><div><h2>Где бросают</h2><span className="muted">{`Открыли тему → начали отвечать → сдали всё. До конца курса дошли: ${done}`}</span></div></header>
          <ul className="an-funnel">
            {a.funnel.map((f, i) => (
              <li key={f.topicId}>
                <span className="an-funnel-title"><span className="an-funnel-n">{i + 1}</span>{f.title}</span>
                <span className="an-funnel-bars" aria-label={`Открыли ${f.opened}, начали ${f.started}, сдали всё ${f.finished} из ${a.students}`}>
                  <i className="o" style={{ width: `${(f.opened / funnelMax) * 100}%` }} />
                  <i className="s" style={{ width: `${(f.started / funnelMax) * 100}%` }} />
                  <i className="f" style={{ width: `${(f.finished / funnelMax) * 100}%` }} />
                </span>
                <span className="an-funnel-nums">{`${f.opened} · ${f.started} · ${f.finished}`}</span>
              </li>
            ))}
          </ul>
          <p className="an-legend"><i className="o" />открыли <i className="s" />начали <i className="f" />сдали всё</p>
        </section>
      </div>

      <section className="cab-card">
        <header className="cab-card-head"><div><h2>Кому нужна помощь</h2><span className="muted">Давно не заходили, низкий балл или работы на доработке</span></div></header>
        {a.risk.length === 0 ? <p className="muted cab-empty">Все ученики занимаются и справляются.</p> : (
          <ul className="cab-list">
            {a.risk.map((r) => (
              <li key={r.id}>
                <div>
                  <Link href={`/teach/courses/${id}/students/${r.id}`}>{r.name}</Link>
                  <span className="muted">{`${r.groups.join(', ')} · ${r.reason}`}</span>
                </div>
                <span className="muted">{r.lastActive ? `был ${formatDate(r.lastActive)}` : 'не заходил'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cab-card">
        <header className="cab-card-head"><div><h2>Все задания</h2><span className="muted">Сколько ответили, средний балл и доля полных баллов</span></div></header>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Задание</th><th>Тема</th><th>Ответили</th><th>Средний</th><th>Полный балл</th><th>Ждут</th></tr></thead>
            <tbody>
              {a.tasks.map((t) => (
                <tr key={t.blockId}>
                  <td data-label="Задание"><Link href={answersHref(id, t.blockId)}>{t.title}</Link><br /><span className="muted">{t.typeLabel}</span></td>
                  <td data-label="Тема">{t.topicTitle}</td>
                  <td data-label="Ответили">{`${t.answered} из ${a.students}`}</td>
                  <td data-label="Средний"><span className={`an-chip ${tone(t.avgPercent)}`}>{t.avgPercent === null ? '—' : `${t.avgPercent}%`}</span></td>
                  <td data-label="Полный балл">{t.fullShare === null ? '—' : `${t.fullShare}%`}</td>
                  <td data-label="Ждут">{t.pending || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted"><IconCourses size={14} /> Считается по ученикам, которым курс открыт сейчас.</p>
    </>
  );
}

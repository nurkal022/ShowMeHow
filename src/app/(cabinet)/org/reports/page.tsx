import Link from 'next/link';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { weekFacts, weekStartOf, type WeekNumbers } from '@/lib/org/reports';
import { getWeekReport, listWeekReports } from '@/lib/org/ai';
import { withOrgParam } from '@/lib/lms/links';
import { formatAgo } from '@/lib/lms/format';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import { WeekReportButton } from '@/components/org/InsightButton';
import { Avatar } from '@/components/cabinet/viz';
import { IconAlert, IconBulb, IconCheck, IconSpark, IconTeach } from '@/components/icons';

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

function Delta({ now, prev, suffix = '', invert = false }: { now: number | null; prev: number | null; suffix?: string; invert?: boolean }) {
  if (now === null || prev === null) return <span className="delta flat">—</span>;
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return <span className="delta flat">без изменений</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={`delta ${good ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}{suffix}</span>;
}

const KPIS: { key: keyof WeekNumbers; label: string; suffix?: string; invert?: boolean }[] = [
  { key: 'activeStudents', label: 'активных учеников' },
  { key: 'submitted', label: 'сдано работ' },
  { key: 'graded', label: 'проверено' },
  { key: 'avgPercent', label: 'средний балл', suffix: '%' },
  { key: 'medianHours', label: 'часов до проверки', suffix: ' ч', invert: true },
  { key: 'newStudents', label: 'новых учеников' },
];

/** Отчёт недели: цифры считаются всегда, выводы помощника — по кнопке и сохраняются. */
export default async function WeekReportPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/reports', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const raw = firstParam((await searchParams).week);
  const weekStart = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStartOf(new Date(`${raw}T00:00:00`)) : weekStartOf();
  const [saved, history] = await Promise.all([getWeekReport(m.orgId, weekStart), listWeekReports(m.orgId)]);
  const facts = saved?.facts ?? await weekFacts(m.orgId, weekStart);
  const s = saved?.summary ?? null;
  const link = (w: string) => withOrgParam(`/org/reports?week=${w}`, m.orgSlug);
  const current = weekStartOf();
  const prevWeek = (() => { const d = new Date(`${weekStart}T00:00:00`); d.setDate(d.getDate() - 7); return weekStartOf(d); })();
  const nextWeek = (() => { const d = new Date(`${weekStart}T00:00:00`); d.setDate(d.getDate() + 7); return weekStartOf(d); })();

  return (
    <>
      <CabinetHeader title="Отчёт недели" subtitle={`${m.orgName} · ${fmtDay(facts.weekStart)} — ${fmtDay(facts.weekEnd)}`}>
        <span className="week-nav no-print">
          <Link className="btn btn-sm" href={link(prevWeek)}>← Пред.</Link>
          {weekStart !== current && <Link className="btn btn-sm" href={link(nextWeek)}>След. →</Link>}
        </span>
      </CabinetHeader>

      <section className={s ? 'report-hero' : 'report-hero empty'}>
        <div>
          <span className="report-hero-kicker"><IconSpark size={15} />{s ? `Выводы помощника · ${formatAgo(saved!.createdAt)}` : 'Выводов ещё нет'}</span>
          <h2>{s ? s.headline : 'Цифры недели готовы — помощник может прочитать их и написать, что хорошо, что тревожит и что делать.'}</h2>
        </div>
        <WeekReportButton slug={m.orgSlug} weekStart={weekStart} again={!!s} />
      </section>

      <div className="kpi-row">
        {KPIS.map((k) => (
          <div key={k.key} className="kpi">
            <b>{facts.now[k.key] ?? '—'}{facts.now[k.key] !== null && k.suffix ? k.suffix : ''}</b>
            <span>{k.label}</span>
            <Delta now={facts.now[k.key]} prev={facts.prev[k.key]} suffix={k.suffix} invert={k.invert} />
          </div>
        ))}
      </div>

      {s && (
        <div className="report-cols">
          <section className="cab-card debrief-block tone-green"><h3><IconCheck size={17} />Что хорошо</h3><ul>{s.highlights.map((x) => <li key={x}>{x}</li>)}</ul></section>
          <section className="cab-card debrief-block tone-rose"><h3><IconAlert size={17} />Что тревожит</h3><ul>{s.concerns.map((x) => <li key={x}>{x}</li>)}</ul></section>
          <section className="cab-card debrief-block tone-blue"><h3><IconBulb size={17} />Что сделать</h3><ol>{s.actions.map((x) => <li key={x}>{x}</li>)}</ol></section>
        </div>
      )}

      {s && s.teachers.length > 0 && (
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>Работа учителей</h2><span className="muted">Оценка помощника по цифрам недели</span></div></header>
          <ul className="teacher-notes">
            {s.teachers.map((t) => {
              const name = t.split(/\s[—–-]\s/)[0];
              return <li key={t}><Avatar name={name} size={34} /><p>{t}</p></li>;
            })}
          </ul>
        </section>
      )}

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>Классы за неделю</h2><span className="muted">В скобках — прошлая неделя</span></div></header>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Класс</th><th className="center">Активны</th><th className="center">Сдано</th><th className="center">Балл</th></tr></thead>
              <tbody>
                {facts.groups.map((g) => (
                  <tr key={g.id}>
                    <td data-label="Класс"><b>{g.title}</b> <small className="muted">· {g.students}</small></td>
                    <td data-label="Активны" className="center num">{g.active} <Delta now={g.active} prev={g.prevActive} /></td>
                    <td data-label="Сдано" className="center num">{g.submitted} <Delta now={g.submitted} prev={g.prevSubmitted} /></td>
                    <td data-label="Балл" className="center num">{g.avgPercent === null ? '—' : `${g.avgPercent}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>Учителя за неделю</h2><span className="muted">Проверка работ и долги</span></div></header>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Учитель</th><th className="center">Проверено</th><th className="center">Ждут</th><th className="center">Часов до проверки</th></tr></thead>
              <tbody>
                {facts.teachers.map((t) => (
                  <tr key={t.userId}>
                    <td data-label="Учитель"><span className="person-cell"><Avatar name={t.name} size={28} /><b>{t.name}</b></span></td>
                    <td data-label="Проверено" className="center num">{t.graded}</td>
                    <td data-label="Ждут" className="center num">{t.pending ? <span className={t.oldestPendingDays && t.oldestPendingDays > 7 ? 'status-pill danger' : 'status-pill warn'}>{t.pending}{t.oldestPendingDays ? ` · ${t.oldestPendingDays} дн.` : ''}</span> : '0'}</td>
                    <td data-label="Часов до проверки" className="center num">{t.medianHours ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="cab-card">
        <header className="cab-card-head">
          <div><h2>Риски отставания</h2><span className="muted">высокий {facts.risk.high} · средний {facts.risk.medium} · низкий {facts.risk.low}</span></div>
          <Link className="btn btn-sm btn-ghost" href={withOrgParam('/org/risk', m.orgSlug)}>Все риски</Link>
        </header>
        {facts.risk.top.length === 0 ? <p className="empty-state">Учеников в зоне риска нет.</p> : (
          <ul className="people-list">
            {facts.risk.top.map((r) => (
              <li key={r.name}><Avatar name={r.name} size={32} /><div><strong>{r.name}</strong><span className="muted">{r.groups.join(', ')} · {r.factors.join(' · ')}</span></div></li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section className="cab-card no-print">
          <header className="cab-card-head"><h2>Архив отчётов</h2><IconTeach size={18} /></header>
          <ul className="report-archive">
            {history.map((h) => (
              <li key={h.weekStart} className={h.weekStart === weekStart ? 'active' : ''}>
                <Link href={link(h.weekStart)}><b>{fmtDay(h.weekStart)}</b><span className="muted">{h.headline ?? 'только цифры'}</span></Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

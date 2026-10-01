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
import { getLocale } from '@/i18n/server';
import { formatDate, translator } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import { localizeMessage } from '@/i18n/catalog';
import { org } from '@/i18n/messages/org';

const fmtDay = (d: string, locale: Locale) => formatDate(`${d}T00:00:00`, locale, { day: 'numeric', month: 'long' });

function Delta({ now, prev, suffix = '', invert = false, flat = 'без изменений' }: { now: number | null; prev: number | null; suffix?: string; invert?: boolean; flat?: string }) {
  if (now === null || prev === null) return <span className="delta flat">—</span>;
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return <span className="delta flat">{flat}</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={`delta ${good ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}{suffix}</span>;
}

const KPIS: { key: keyof WeekNumbers; suffix?: '%' | 'hours'; invert?: boolean }[] = [
  { key: 'activeStudents' },
  { key: 'submitted' },
  { key: 'graded' },
  { key: 'avgPercent', suffix: '%' },
  { key: 'medianHours', suffix: 'hours', invert: true },
  { key: 'newStudents' },
];

/** Отчёт недели: цифры считаются всегда, выводы помощника — по кнопке и сохраняются. */
export default async function WeekReportPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/reports', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const locale = await getLocale();
  const t = translator(org, locale);
  const flat = t('noChange');
  const suffixOf = (k: (typeof KPIS)[number]) => (k.suffix === 'hours' ? t('hoursSuffix') : k.suffix ?? '');
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
      <CabinetHeader title={t('reportTitle')} subtitle={`${m.orgName} · ${fmtDay(facts.weekStart, locale)} — ${fmtDay(facts.weekEnd, locale)}`}>
        <span className="week-nav no-print">
          <Link className="btn btn-sm" href={link(prevWeek)}>{t('prev')}</Link>
          {weekStart !== current && <Link className="btn btn-sm" href={link(nextWeek)}>{t('next')}</Link>}
        </span>
      </CabinetHeader>

      <section className={s ? 'report-hero' : 'report-hero empty'}>
        <div>
          <span className="report-hero-kicker"><IconSpark size={15} />{s ? t('aiSaid', { ago: formatAgo(saved!.createdAt, locale) }) : t('noAi')}</span>
          <h2>{s ? s.headline : t('noAiText')}</h2>
        </div>
        <WeekReportButton slug={m.orgSlug} weekStart={weekStart} again={!!s} />
      </section>

      <div className="kpi-row">
        {KPIS.map((k) => (
          <div key={k.key} className="kpi">
            <b>{facts.now[k.key] ?? '—'}{facts.now[k.key] !== null && k.suffix ? suffixOf(k) : ''}</b>
            <span>{t(`k_${k.key}`)}</span>
            <Delta now={facts.now[k.key]} prev={facts.prev[k.key]} suffix={suffixOf(k)} invert={k.invert} flat={flat} />
          </div>
        ))}
      </div>

      {s && (
        <div className="report-cols">
          <section className="cab-card debrief-block tone-green"><h3><IconCheck size={17} />{t('good')}</h3><ul>{s.highlights.map((x) => <li key={x}>{x}</li>)}</ul></section>
          <section className="cab-card debrief-block tone-rose"><h3><IconAlert size={17} />{t('worry')}</h3><ul>{s.concerns.map((x) => <li key={x}>{x}</li>)}</ul></section>
          <section className="cab-card debrief-block tone-blue"><h3><IconBulb size={17} />{t('todo')}</h3><ol>{s.actions.map((x) => <li key={x}>{x}</li>)}</ol></section>
        </div>
      )}

      {s && s.teachers.length > 0 && (
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>{t('teachersWork')}</h2><span className="muted">{t('teachersWorkHint')}</span></div></header>
          <ul className="teacher-notes">
            {s.teachers.map((line) => {
              const name = line.split(/\s[—–-]\s/)[0];
              return <li key={line}><Avatar name={name} size={34} /><p>{line}</p></li>;
            })}
          </ul>
        </section>
      )}

      <div className="cab-grid-2">
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>{t('classesWeek')}</h2><span className="muted">{t('classesWeekHint')}</span></div></header>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('w_class')}</th><th className="center">{t('w_active')}</th><th className="center">{t('w_submitted')}</th><th className="center">{t('w_score')}</th></tr></thead>
              <tbody>
                {facts.groups.map((g) => (
                  <tr key={g.id}>
                    <td data-label={t('w_class')}><b>{g.title}</b> <small className="muted">· {g.students}</small></td>
                    <td data-label={t('w_active')} className="center num">{g.active} <Delta now={g.active} prev={g.prevActive} flat={flat} /></td>
                    <td data-label={t('w_submitted')} className="center num">{g.submitted} <Delta now={g.submitted} prev={g.prevSubmitted} flat={flat} /></td>
                    <td data-label={t('w_score')} className="center num">{g.avgPercent === null ? '—' : `${g.avgPercent}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="cab-card">
          <header className="cab-card-head"><div><h2>{t('teachersWeek')}</h2><span className="muted">{t('teachersWeekHint')}</span></div></header>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('w_teacher')}</th><th className="center">{t('w_graded')}</th><th className="center">{t('w_waiting')}</th><th className="center">{t('w_hours')}</th></tr></thead>
              <tbody>
                {facts.teachers.map((tt) => (
                  <tr key={tt.userId}>
                    <td data-label={t('w_teacher')}><span className="person-cell"><Avatar name={tt.name} size={28} /><b>{tt.name}</b></span></td>
                    <td data-label={t('w_graded')} className="center num">{tt.graded}</td>
                    <td data-label={t('w_waiting')} className="center num">{tt.pending ? <span className={tt.oldestPendingDays && tt.oldestPendingDays > 7 ? 'status-pill danger' : 'status-pill warn'}>{tt.pending}{tt.oldestPendingDays ? ` · ${t('days', { n: tt.oldestPendingDays })}` : ''}</span> : '0'}</td>
                    <td data-label={t('w_hours')} className="center num">{tt.medianHours ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="cab-card">
        <header className="cab-card-head">
          <div><h2>{t('risksTitle')}</h2><span className="muted">{t('risksLine', { high: facts.risk.high, medium: facts.risk.medium, low: facts.risk.low })}</span></div>
          <Link className="btn btn-sm btn-ghost" href={withOrgParam('/org/risk', m.orgSlug)}>{t('allRisks')}</Link>
        </header>
        {facts.risk.top.length === 0 ? <p className="empty-state">{t('noRisk')}</p> : (
          <ul className="people-list">
            {facts.risk.top.map((r) => (
              <li key={r.name}><Avatar name={r.name} size={32} /><div><strong>{r.name}</strong><span className="muted">{r.groups.join(', ')} · {r.factors.map((x) => localizeMessage(x, locale)).join(' · ')}</span></div></li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section className="cab-card no-print">
          <header className="cab-card-head"><h2>{t('archive')}</h2><IconTeach size={18} /></header>
          <ul className="report-archive">
            {history.map((h) => (
              <li key={h.weekStart} className={h.weekStart === weekStart ? 'active' : ''}>
                <Link href={link(h.weekStart)}><b>{fmtDay(h.weekStart, locale)}</b><span className="muted">{h.headline ?? t('onlyNumbers')}</span></Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

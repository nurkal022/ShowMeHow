import Link from 'next/link';
import type { FunnelCounts, GroupFunnel } from '@/lib/org/insights';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { org } from '@/i18n/messages/org';

const STEPS: { key: keyof FunnelCounts }[] = [{ key: 'added' }, { key: 'loggedIn' }, { key: 'opened' }, { key: 'submitted' }];

const share = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Воронка учеников школы: на каждом шаге — сколько дошло и сколько потерялось. */
export function FunnelBars({ total, locale = 'ru' }: { total: FunnelCounts; locale?: Locale }) {
  const t = translator(org, locale);
  return (
    <ol className="funnel">
      {STEPS.map((s, i) => {
        const n = total[s.key];
        const prev = i > 0 ? total[STEPS[i - 1].key] : n;
        const w = share(n, total.added);
        const lost = prev - n;
        return (
          <li key={s.key} style={{ ['--i' as string]: i }}>
            <div className="funnel-label"><b>{t(`f_${s.key}`)}</b><span className="muted">{t(`f_${s.key}Hint`)}</span></div>
            <div className="funnel-track">
              <span className="funnel-fill" style={{ width: `${Math.max(w, n ? 4 : 0)}%` }}>
                <span className="funnel-num">{n}</span>
              </span>
            </div>
            <div className="funnel-rate">
              <b>{total.added ? `${w}%` : '—'}</b>
              {i > 0 && lost > 0 && <span className="funnel-lost">−{lost}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** По группам: четыре ступени рядом, слабое место подсвечено. */
export function FunnelByGroup({ groups, hrefOf, locale = 'ru' }: { groups: GroupFunnel[]; hrefOf: (id: string) => string; locale?: Locale }) {
  const t = translator(org, locale);
  return (
    <div className="table-wrap">
      <table className="data-table funnel-table">
        <thead><tr><th>{t('group')}</th>{STEPS.slice(1).map((s) => <th key={s.key}>{t(`f_${s.key}`)}</th>)}<th className="center">{t('stuckCol')}</th></tr></thead>
        <tbody>
          {groups.map((g) => {
            const rates = STEPS.slice(1).map((s) => share(g[s.key], g.added));
            const weakest = g.added ? rates.indexOf(Math.min(...rates)) : -1;
            const stuck = g.added - g.submitted;
            return (
              <tr key={g.id}>
                <td data-label={t('group')}><Link href={hrefOf(g.id)}><b>{g.title}</b></Link>
                  <small className="muted"> · {t('students', { n: g.added })}</small></td>
                {rates.map((r, i) => (
                  <td key={i} data-label={t(`f_${STEPS[i + 1].key}`)}>
                    <span className={`inline-meter${i === weakest && r < 100 ? ' weak' : ''}`}>
                      <span className="meter"><i style={{ width: `${r}%` }} /></span><span className="num">{g.added ? `${r}%` : '—'}</span>
                    </span>
                  </td>
                ))}
                <td data-label={t('stuckCol')} className="center num">{stuck > 0 ? <span className="status-pill warn">{stuck}</span> : <span className="muted">0</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

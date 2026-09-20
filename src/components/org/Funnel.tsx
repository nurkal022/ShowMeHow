import Link from 'next/link';
import type { FunnelCounts, GroupFunnel } from '@/lib/org/insights';
import { ruPlural } from '@/lib/lms/format';

const STEPS: { key: keyof FunnelCounts; label: string; hint: string }[] = [
  { key: 'added', label: 'Добавлены', hint: 'учётные записи созданы' },
  { key: 'loggedIn', label: 'Вошли', hint: 'сменили временный пароль' },
  { key: 'opened', label: 'Открыли урок', hint: 'начали заниматься' },
  { key: 'submitted', label: 'Сдали работу', hint: 'хотя бы одно задание' },
];

const share = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Воронка учеников школы: на каждом шаге — сколько дошло и сколько потерялось. */
export function FunnelBars({ total }: { total: FunnelCounts }) {
  return (
    <ol className="funnel">
      {STEPS.map((s, i) => {
        const n = total[s.key];
        const prev = i > 0 ? total[STEPS[i - 1].key] : n;
        const w = share(n, total.added);
        const lost = prev - n;
        return (
          <li key={s.key} style={{ ['--i' as string]: i }}>
            <div className="funnel-label"><b>{s.label}</b><span className="muted">{s.hint}</span></div>
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
export function FunnelByGroup({ groups, hrefOf }: { groups: GroupFunnel[]; hrefOf: (id: string) => string }) {
  return (
    <div className="table-wrap">
      <table className="data-table funnel-table">
        <thead><tr><th>Группа</th>{STEPS.slice(1).map((s) => <th key={s.key}>{s.label}</th>)}<th className="center">Застряли</th></tr></thead>
        <tbody>
          {groups.map((g) => {
            const rates = STEPS.slice(1).map((s) => share(g[s.key], g.added));
            const weakest = g.added ? rates.indexOf(Math.min(...rates)) : -1;
            const stuck = g.added - g.submitted;
            return (
              <tr key={g.id}>
                <td data-label="Группа"><Link href={hrefOf(g.id)}><b>{g.title}</b></Link>
                  <small className="muted"> · {g.added} {ruPlural(g.added, 'ученик', 'ученика', 'учеников')}</small></td>
                {rates.map((r, i) => (
                  <td key={i} data-label={STEPS[i + 1].label}>
                    <span className={`inline-meter${i === weakest && r < 100 ? ' weak' : ''}`}>
                      <span className="meter"><i style={{ width: `${r}%` }} /></span><span className="num">{g.added ? `${r}%` : '—'}</span>
                    </span>
                  </td>
                ))}
                <td data-label="Застряли" className="center num">{stuck > 0 ? <span className="status-pill warn">{stuck}</span> : <span className="muted">0</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import type { Achievements as Data } from '@/lib/lms/achievements';
import {
  IconBook, IconCheck, IconHistory, IconSpark, IconTable, IconTarget, IconTask, IconTrophy,
} from '@/components/icons';

/** Значки ученика: нераскрытые тоже видны — чтобы было к чему стремиться. */
export default function Achievements({ data }: { data: Data }) {
  const earned = data.badges.filter((b) => b.earned).length;
  return (
    <section className="ach-badges" aria-label="Значки">
      <h2>{`Значки · ${earned} из ${data.badges.length}`}</h2>
      <ul>
        {data.badges.map((b, i) => (
          <li key={b.id} className={b.earned ? 'earned' : undefined} style={{ animationDelay: `${i * 50}ms` }} title={b.hint}>
            <span className={`ach-badge b-${b.id}`} aria-hidden="true">{(BADGE_ICON[b.id] ?? IconTrophy)({ size: 22 })}</span>
            <strong>{b.title}</strong>
            <small>{b.earned ? b.hint : `${b.progress} / ${b.goal}`}</small>
            {!b.earned && <span className="ach-prog"><i style={{ width: `${(b.progress / b.goal) * 100}%` }} /></span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

const BADGE_ICON: Record<string, (p: { size?: number }) => React.ReactNode> = {
  first: IconCheck, ten: IconTask, sniper: IconTarget, explorer: IconBook, lab: IconTable, exam: IconHistory,
  streak3: IconSpark, streak7: IconTrophy,
};

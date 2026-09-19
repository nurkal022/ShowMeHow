import type { Achievements as Data } from '@/lib/lms/achievements';
import { ruPlural } from '@/lib/lms/format';
import {
  IconBook, IconCheck, IconFlame, IconHistory, IconSpark, IconTable, IconTarget, IconTask, IconTrophy,
} from '@/components/icons';

const WEEKS = 16;

/** Серия, карта активности за шесть недель и значки. Нераскрытые значки видны — чтобы было к чему стремиться. */
export default function Achievements({ data }: { data: Data }) {
  const active = new Set(data.activeDays);
  const today = new Date(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' }) + 'T12:00:00Z');
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - (WEEKS - 1) * 7);
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { key, on: active.has(key), future: d > today };
  });
  const earned = data.badges.filter((b) => b.earned).length;
  return (
    <section className="ach" aria-label="Достижения">
      <div className="ach-streak">
        <span className={data.streak > 0 ? 'ach-flame on' : 'ach-flame'} aria-hidden="true"><IconFlame size={30} /></span>
        <div>
          <strong>{data.streak > 0 ? `${data.streak} ${ruPlural(data.streak, 'день', 'дня', 'дней')} подряд` : 'Начните серию сегодня'}</strong>
          <span>{`Лучшая серия: ${data.bestStreak} ${ruPlural(data.bestStreak, 'день', 'дня', 'дней')}`}</span>
        </div>
        <span className="ach-heat-cap">{`Дни с занятиями за ${WEEKS} недель`}</span>
        <div className="ach-heat" role="img" aria-label={`Дни с занятиями за ${WEEKS} недель: ${cells.filter((c) => c.on).length}`}>
          {cells.map((c) => <i key={c.key} title={c.key} className={c.future ? 'future' : c.on ? 'on' : undefined} />)}
        </div>
      </div>
      <div className="ach-badges">
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
      </div>
    </section>
  );
}

const BADGE_ICON: Record<string, (p: { size?: number }) => React.ReactNode> = {
  first: IconCheck, ten: IconTask, sniper: IconTarget, explorer: IconBook, lab: IconTable, exam: IconHistory,
  streak3: IconSpark, streak7: IconTrophy,
};

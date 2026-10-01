'use client';
import type { Achievements as Data } from '@/lib/lms/achievements';
import {
  IconBook, IconCheck, IconHistory, IconSpark, IconTable, IconTarget, IconTask, IconTrophy,
} from '@/components/icons';
import { useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';

/** Значки ученика: нераскрытые тоже видны — чтобы было к чему стремиться. */
export default function Achievements({ data }: { data: Data }) {
  const t = useT(learn);
  // Названия значков — по id из словаря; незнакомый id показывается как пришёл с сервера.
  const known = (id: string) => BADGE_IDS.includes(id);
  const title = (b: Data['badges'][number]) => (known(b.id) ? t(`badge_${b.id}` as 'badge_first') : b.title);
  const hint = (b: Data['badges'][number]) => (known(b.id) ? t(`badge_${b.id}_hint` as 'badge_first_hint') : b.hint);
  const earned = data.badges.filter((b) => b.earned).length;
  return (
    <section className="ach-badges" aria-label={t('badges')}>
      <h2>{t('badgesHead', { earned, total: data.badges.length })}</h2>
      <ul>
        {data.badges.map((b, i) => (
          <li key={b.id} className={b.earned ? 'earned' : undefined} style={{ animationDelay: `${i * 50}ms` }} title={hint(b)}>
            <span className={`ach-badge b-${b.id}`} aria-hidden="true">{(BADGE_ICON[b.id] ?? IconTrophy)({ size: 22 })}</span>
            <strong>{title(b)}</strong>
            <small>{b.earned ? hint(b) : `${b.progress} / ${b.goal}`}</small>
            {!b.earned && <span className="ach-prog"><i style={{ width: `${(b.progress / b.goal) * 100}%` }} /></span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

const BADGE_IDS = ['first', 'ten', 'sniper', 'explorer', 'lab', 'exam', 'streak3', 'streak7'];

const BADGE_ICON: Record<string, (p: { size?: number }) => React.ReactNode> = {
  first: IconCheck, ten: IconTask, sniper: IconTarget, explorer: IconBook, lab: IconTable, exam: IconHistory,
  streak3: IconSpark, streak7: IconTrophy,
};

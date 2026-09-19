import Link from 'next/link';
import type { TopicProgress } from '@/lib/lms/learn';
import { dueLabel, TOPIC_STATE_LABELS } from '@/lib/lms/learn';
import { learnTopicHref } from '@/lib/lms/links';
import { formatScore, ruPlural } from '@/lib/lms/format';
import { IconCheck, IconChevron } from '@/components/icons';

/**
 * Темы курса вертикальной лесенкой. Закрытых тем в курсе нет — ещё не начатые темы
 * после текущей выглядят приглушённо, но открываются.
 */
export default function TopicStepper({ topics, currentId, preview }: {
  topics: TopicProgress[]; currentId: string | null; preview: boolean;
}) {
  const currentIndex = currentId ? topics.findIndex((t) => t.topicId === currentId) : -1;
  return (
    <ol className="learn-steps">
      {topics.map((t, i) => {
        const current = t.topicId === currentId;
        const ahead = !preview && t.state === 'none' && currentIndex !== -1 && i > currentIndex;
        const cls = ['learn-step', t.state, current ? 'current' : '', ahead ? 'ahead' : ''].filter(Boolean).join(' ');
        return (
          <li key={t.topicId} className={cls}>
            <span className="learn-step-dot" aria-hidden="true">
              {t.state === 'done' ? <IconCheck size={14} /> : i + 1}
            </span>
            <Link className="learn-step-card" href={learnTopicHref(t.topicId, preview)}>
              <span className="learn-step-main">
                <span className="learn-step-title">{t.title}</span>
                {!preview && (
                  <span className="learn-step-meta">
                    <span className={`learn-state ${t.state}`}>{TOPIC_STATE_LABELS[t.state]}</span>
                    {t.assignmentsTotal > 0 && (
                      <span>{`${t.assignmentsDone} из ${t.assignmentsTotal} ${ruPlural(t.assignmentsTotal, 'задания', 'заданий', 'заданий')}`}</span>
                    )}
                    {t.dueAt && t.state !== 'done' && (() => { const d = dueLabel(t.dueAt); return <span className={`learn-due ${d.tone}`}>{d.text}</span>; })()}
                    {t.assignmentsReturned > 0 && <span className="learn-state returned">возвращено на доработку</span>}
                    {t.pointsMax > 0 && (
                      <span className="learn-step-points">{`${formatScore(t.pointsEarned)} / ${formatScore(t.pointsMax)} б.`}</span>
                    )}
                  </span>
                )}
              </span>
              <IconChevron size={16} />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

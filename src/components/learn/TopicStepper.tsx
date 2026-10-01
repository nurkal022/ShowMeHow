'use client';
import Link from 'next/link';
import type { TopicProgress } from '@/lib/lms/learn-view';
import { learnTopicHref } from '@/lib/lms/links';
import { useLocale, useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';
import { learnDue, learnScore } from './format';
import { IconCheck, IconChevron } from '@/components/icons';

/**
 * Темы курса вертикальной лесенкой. Закрытых тем в курсе нет — ещё не начатые темы
 * после текущей выглядят приглушённо, но открываются.
 */
export default function TopicStepper({ topics, currentId, preview }: {
  topics: TopicProgress[]; currentId: string | null; preview: boolean;
}) {
  const t0 = useT(learn);
  const locale = useLocale();
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
                    <span className={`learn-state ${t.state}`}>{t0(`state_${t.state}`)}</span>
                    {t.assignmentsTotal > 0 && (
                      <span>{t0('doneOfTasks', { done: t.assignmentsDone, n: t.assignmentsTotal })}</span>
                    )}
                    {t.dueAt && t.state !== 'done' && (() => { const d = learnDue(t.dueAt, locale); return <span className={`learn-due ${d.tone}`}>{d.text}</span>; })()}
                    {t.assignmentsReturned > 0 && <span className="learn-state returned">{t0('returnedForRevision')}</span>}
                    {t.pointsMax > 0 && (
                      <span className="learn-step-points">{t0('pointsShort', { a: learnScore(t.pointsEarned, locale), b: learnScore(t.pointsMax, locale) })}</span>
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

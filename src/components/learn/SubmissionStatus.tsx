import type { StudentSubmission } from '@/lib/lms/answers';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { useLocale, useT } from '@/i18n/client';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import { learnDateTime, learnScore } from './format';

/** Что случилось с ответом — одной фразой. null — ученик ещё ничего не отправлял. */
export function submissionLine(sub: StudentSubmission | null, points: number, locale: Locale = 'ru'): string | null {
  if (!sub) return null;
  const t = translator(learnLesson, locale);
  switch (sub.status) {
    case 'draft': return t('statusDraft');
    case 'submitted': return t('statusSubmitted');
    case 'graded': return t('statusGraded', { score: learnScore(sub.score, locale), points });
    case 'returned': return t('statusReturned');
  }
}

/** Проверенная работа: полный балл, часть или ноль — цвет не должен врать. */
export function scoreTone(score: number | null, points: number): 'full' | 'part' | 'zero' {
  if (score === null || score <= 0) return points === 0 ? 'full' : 'zero';
  return score >= points ? 'full' : 'part';
}

export default function SubmissionStatus({ sub, points }: { sub: StudentSubmission | null; points: number }) {
  const t = useT(learnLesson);
  const locale = useLocale();
  const line = submissionLine(sub, points, locale);
  if (!line || !sub) {
    return <div className="learn-status none" role="status"><span className="learn-status-dot" />{t('notSubmitted')}</div>;
  }
  return (
    <div className="learn-status-wrap">
      <div className={`learn-status ${sub.status}${sub.status === 'graded' ? ` ${scoreTone(sub.score, points)}` : ''}`} role="status">
        <span className="learn-status-dot" />
        <span className="learn-status-line">{line}</span>
        {sub.submittedAt && sub.status !== 'draft' && (
          <span className="learn-status-when">{learnDateTime(sub.submittedAt, locale)}</span>
        )}
      </div>
      {sub.comment && <p className="teacher-note learn-note">{t('teacherComment', { text: sub.comment })}</p>}
    </div>
  );
}

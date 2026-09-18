import type { StudentSubmission } from '@/lib/lms/answers';
import { formatDateTime, formatScore } from '@/lib/lms/format';

/** Что случилось с ответом — одной фразой. null — ученик ещё ничего не отправлял. */
export function submissionLine(sub: StudentSubmission | null, points: number): string | null {
  if (!sub) return null;
  switch (sub.status) {
    case 'draft': return 'Черновик сохранён — ответ ещё не сдан.';
    case 'submitted': return 'Сдано, ждёт проверки.';
    case 'graded': return `Проверено: ${formatScore(sub.score)} из ${points}.`;
    case 'returned': return 'Работа возвращена на доработку.';
  }
}

/** Проверенная работа: полный балл, часть или ноль — цвет не должен врать. */
export function scoreTone(score: number | null, points: number): 'full' | 'part' | 'zero' {
  if (score === null || score <= 0) return points === 0 ? 'full' : 'zero';
  return score >= points ? 'full' : 'part';
}

export default function SubmissionStatus({ sub, points }: { sub: StudentSubmission | null; points: number }) {
  const line = submissionLine(sub, points);
  if (!line || !sub) {
    return <div className="learn-status none" role="status"><span className="learn-status-dot" />Не сдано</div>;
  }
  return (
    <div className="learn-status-wrap">
      <div className={`learn-status ${sub.status}${sub.status === 'graded' ? ` ${scoreTone(sub.score, points)}` : ''}`} role="status">
        <span className="learn-status-dot" />
        <span className="learn-status-line">{line}</span>
        {sub.submittedAt && sub.status !== 'draft' && (
          <span className="learn-status-when">{formatDateTime(sub.submittedAt)}</span>
        )}
      </div>
      {sub.comment && <p className="teacher-note learn-note">{`Комментарий учителя: ${sub.comment}`}</p>}
    </div>
  );
}

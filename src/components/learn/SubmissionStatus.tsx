import type { StudentSubmission } from '@/lib/lms/answers';
import { formatScore } from '@/lib/lms/format';

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

export default function SubmissionStatus({ sub, points }: { sub: StudentSubmission | null; points: number }) {
  const line = submissionLine(sub, points);
  if (!line) return null;
  const tone = sub?.status === 'graded' ? 'ok-box' : sub?.status === 'returned' ? 'warn-banner' : 'cancel-banner';
  return (
    <div className="settings-list">
      <p className={tone} role="status">{line}</p>
      {sub?.comment && <p className="teacher-note">{`Комментарий учителя: ${sub.comment}`}</p>}
    </div>
  );
}

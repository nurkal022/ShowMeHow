import Link from 'next/link';
import type { CourseListItem } from '@/lib/lms/courses';
import { COURSE_STATUS_LABELS } from '@/lib/lms/types';
import StatusPill from '@/components/cabinet/StatusPill';

export default function CoursesTable({ courses, showOwner }: { courses: CourseListItem[]; showOwner: boolean }) {
  if (courses.length === 0) {
    return <p className="empty-state">Курсов пока нет. Создайте первый — например, «Физика 7: механика».</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Курс</th><th>Предмет</th><th>Статус</th><th>Группы</th><th className="center">Тем</th>
            <th>Ответы</th>{showOwner && <th>Владелец</th>}
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id}>
              <td data-label="Курс"><Link href={`/teach/courses/${c.id}`}>{c.title}</Link></td>
              <td data-label="Предмет">{c.subject || '—'}</td>
              <td data-label="Статус">
                <StatusPill tone={c.status === 'published' ? 'ok' : 'neutral'}>{COURSE_STATUS_LABELS[c.status]}</StatusPill>
              </td>
              <td data-label="Группы">{c.groupTitles.length ? c.groupTitles.join(', ') : 'никому не открыт'}</td>
              <td data-label="Тем" className="center">{c.topicCount}</td>
              <td data-label="Ответы">
                {c.ungraded > 0
                  ? <StatusPill tone="warn">{`непроверенных ответов: ${c.ungraded}`}</StatusPill>
                  : <span className="muted">всё проверено</span>}
              </td>
              {showOwner && <td data-label="Владелец">{c.ownerLabel}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

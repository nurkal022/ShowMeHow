import Link from 'next/link';
import type { CourseListItem } from '@/lib/lms/courses';
import { COURSE_STATUS_LABELS } from '@/lib/lms/types';
import { learnCourseHref } from '@/lib/lms/links';
import StatusPill from '@/components/cabinet/StatusPill';
import { IconEdit, IconEye } from '@/components/icons';

export default function CoursesTable({ courses, showOwner }: { courses: CourseListItem[]; showOwner: boolean }) {
  if (courses.length === 0) {
    return <p className="empty-state">Курсов пока нет. Создайте первый — например, «Физика 7: механика».</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead>
          <tr>
            <th>Курс</th><th>Статус</th><th>Группы</th><th className="center">Тем</th>
            <th>Ответы</th>{showOwner && <th>Владелец</th>}<th><span className="visually-hidden">Действия</span></th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id}>
              <td data-label="Курс">
                <span className="cf-person">
                  <Link href={`/teach/courses/${c.id}`}><strong>{c.title}</strong></Link>
                  {c.subject && <span className="muted">{c.subject}</span>}
                </span>
              </td>
              <td data-label="Статус">
                <StatusPill tone={c.status === 'published' ? 'ok' : 'neutral'}>{COURSE_STATUS_LABELS[c.status]}</StatusPill>
              </td>
              <td data-label="Группы">
                {c.groupTitles.length
                  ? <span className="cf-tags">{c.groupTitles.map((g) => <span key={g} className="cf-tag">{g}</span>)}</span>
                  : <span className="muted">никому не открыт</span>}
              </td>
              <td data-label="Тем" className="center">{c.topicCount}</td>
              <td data-label="Ответы">
                {c.ungraded > 0
                  ? <StatusPill tone="warn">{`непроверенных ответов: ${c.ungraded}`}</StatusPill>
                  : <span className="muted">всё проверено</span>}
              </td>
              {showOwner && <td data-label="Владелец">{c.ownerLabel}</td>}
              <td className="actions">
                <span className="cf-row-actions">
                  <Link className="icon-btn cf-icon-btn" href={`/teach/courses/${c.id}`} aria-label={`Редактировать курс «${c.title}»`} title="Редактировать">
                    <IconEdit size={16} />
                  </Link>
                  <a className="icon-btn cf-icon-btn" href={learnCourseHref(c.id, true)} target="_blank" rel="noopener noreferrer"
                    aria-label={`Посмотреть курс «${c.title}» глазами ученика`} title="Глазами ученика"><IconEye size={16} /></a>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import Link from 'next/link';
import type { CourseListItem } from '@/lib/lms/courses';
import { courseStatusLabels } from '@/lib/lms/types';
import { learnCourseHref } from '@/lib/lms/links';
import StatusPill from '@/components/cabinet/StatusPill';
import { IconEdit, IconEye } from '@/components/icons';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { teachReview } from '@/i18n/messages/teach-review';

export default function CoursesTable({ courses, showOwner, locale = 'ru' }: { courses: CourseListItem[]; showOwner: boolean; locale?: Locale }) {
  const t = translator(teachReview, locale);
  if (courses.length === 0) {
    return <p className="empty-state">{t('coursesEmpty')}</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table cf-table">
        <thead>
          <tr>
            <th>{t('course')}</th><th>{t('status')}</th><th>{t('groups')}</th><th className="center">{t('topicsCol')}</th>
            <th>{t('answersCol')}</th>{showOwner && <th>{t('owner')}</th>}<th><span className="visually-hidden">{t('actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id}>
              <td data-label={t('course')}>
                <span className="cf-person">
                  <Link href={`/teach/courses/${c.id}`}><strong>{c.title}</strong></Link>
                  {c.subject && <span className="muted">{c.subject}</span>}
                </span>
              </td>
              <td data-label={t('status')}>
                <StatusPill tone={c.status === 'published' ? 'ok' : 'neutral'}>{courseStatusLabels(locale)[c.status]}</StatusPill>
              </td>
              <td data-label={t('groups')}>
                {c.groupTitles.length
                  ? <span className="cf-tags">{c.groupTitles.map((g) => <span key={g} className="cf-tag">{g}</span>)}</span>
                  : <span className="muted">{t('notOpened')}</span>}
              </td>
              <td data-label={t('topicsCol')} className="center">{c.topicCount}</td>
              <td data-label={t('answersCol')}>
                {c.ungraded > 0
                  ? <StatusPill tone="warn">{t('ungraded', { n: c.ungraded })}</StatusPill>
                  : <span className="muted">{t('allChecked')}</span>}
              </td>
              {showOwner && <td data-label={t('owner')}>{c.ownerLabel}</td>}
              <td className="actions">
                <span className="cf-row-actions">
                  <Link className="icon-btn cf-icon-btn" href={`/teach/courses/${c.id}`} aria-label={t('editCourse', { title: c.title })} title={t('edit')}>
                    <IconEdit size={16} />
                  </Link>
                  <a className="icon-btn cf-icon-btn" href={learnCourseHref(c.id, true)} target="_blank" rel="noopener noreferrer"
                    aria-label={t('viewAsStudent', { title: c.title })} title={t('studentView')}><IconEye size={16} /></a>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

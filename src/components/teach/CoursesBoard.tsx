'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import RowMenu from '@/components/lms/ui/RowMenu';
import { useConfirm } from '@/components/lms/ui/useConfirm';
import { callApi } from '@/components/cabinet/api';
import Link from 'next/link';
import { learnCourseHref, withOrgParam } from '@/lib/lms/links';
import { coverStyle } from '@/lib/lms/covers';
import { formatAgo } from '@/lib/lms/format';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { INTL_LOCALE } from '@/i18n/config';
import { teachCourse } from '@/i18n/messages/teach-course';
import { courseStatusLabels, type CourseStatus } from '@/lib/lms/types';
import StatusPill from '@/components/cabinet/StatusPill';
import EmptyState from '@/components/cabinet/EmptyState';
import { IconCourses, IconEdit, IconFold, IconSearch, IconTrash, IconUndo } from '@/components/icons';
import { IconDashboard, IconList, IconView } from '@/components/cabinet/icons';

export interface BoardCourse {
  id: string; title: string; subject: string; status: CourseStatus; groups: string[]; owner: string | null;
  topics: number; students: number; percent: number; graded: number; ungraded: number; updatedAt: string;
  reviewHref: string | null;
}

type StatusFilter = 'all' | 'published' | 'draft' | 'unassigned' | 'archived';
const FILTERS: { key: StatusFilter; label: 'fAll' | 'fPublished' | 'fDraft' | 'fUnassigned' | 'fArchived'; match: (c: BoardCourse) => boolean }[] = [
  { key: 'all', label: 'fAll', match: (c) => c.status !== 'archived' },
  { key: 'published', label: 'fPublished', match: (c) => c.status === 'published' },
  { key: 'draft', label: 'fDraft', match: (c) => c.status === 'draft' },
  { key: 'unassigned', label: 'fUnassigned', match: (c) => c.status !== 'archived' && c.groups.length === 0 },
  { key: 'archived', label: 'fArchived', match: (c) => c.status === 'archived' },
];
const VIEW_KEY = 'tesseract.teach.courses.view';

export default function CoursesBoard({ courses, org, initialStatus }: {
  courses: BoardCourse[]; org: string; initialStatus: string;
}) {
  const t = useT(teachCourse);
  const fmt = useFormat();
  const locale = useLocale();
  const COURSE_STATUS_LABELS = courseStatusLabels(locale);
  const [status, setStatus] = useState<StatusFilter>(FILTERS.some((f) => f.key === initialStatus) ? initialStatus as StatusFilter : 'all');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); } catch { /* приватный режим */ }
  }, []);
  const pickView = (v: 'grid' | 'list') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* не беда */ } };

  const groups = useMemo(() => [...new Set(courses.flatMap((c) => c.groups))].sort((a, b) => a.localeCompare(b, INTL_LOCALE[locale], { numeric: true })), [courses, locale]);
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const q = query.trim().toLowerCase();
  const shown = courses.filter((c) => filter.match(c)
    && (!group || c.groups.includes(group))
    && (!q || `${c.title} ${c.subject} ${c.groups.join(' ')} ${c.owner ?? ''}`.toLowerCase().includes(q)));
  const link = (href: string) => withOrgParam(href, org);
  const router = useRouter();
  const [ask, confirmDialog] = useConfirm();
  const [error, setError] = useState('');

  async function act(c: BoardCourse, kind: 'archive' | 'restore' | 'delete') {
    setError('');
    if (kind === 'delete' && !(await ask({
      title: t('deleteCourseQ', { title: c.title }),
      text: t('deleteCourseText'),
      confirmLabel: t('deleteCourse'), danger: true,
    }))) return;
    const res = kind === 'delete'
      ? await callApi(`/api/teach/courses/${c.id}`, 'DELETE')
      : await callApi(`/api/teach/courses/${c.id}`, 'PATCH', { status: kind === 'archive' ? 'archived' : 'draft' });
    if (!res.ok) return setError(res.error);
    router.refresh();
  }
  const menu = (c: BoardCourse) => (
    <RowMenu label={t('courseActions', { title: c.title })} items={[
      { key: 'about', label: t('aboutSettings'), icon: <IconEdit size={16} />, onSelect: () => router.push(link(`/teach/courses/${c.id}/settings`)) },
      c.status === 'archived'
        ? { key: 'restore', label: t('restore'), icon: <IconUndo size={16} />, onSelect: () => void act(c, 'restore') }
        : { key: 'archive', label: t('archive'), icon: <IconFold size={16} />, onSelect: () => void act(c, 'archive') },
      { key: 'delete', label: t('deleteCourse'), icon: <IconTrash size={16} />, danger: true, onSelect: () => void act(c, 'delete') },
    ]} />
  );

  return (
    <div className="board">
      {confirmDialog}
      {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}
      <div className="board-bar">
        <div className="cf-filter" role="group" aria-label={t('filterGroup')}>
          {FILTERS.map((f) => {
            const n = courses.filter(f.match).length;
            if (n === 0 && f.key !== 'all' && f.key !== status) return null;
            return (
              <button key={f.key} type="button" aria-pressed={status === f.key}
                className={status === f.key ? 'cf-filter-item active' : 'cf-filter-item'} onClick={() => setStatus(f.key)}>
                {t(f.label)}<span className="cf-count">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="board-tools">
          <label className="board-search">
            <IconSearch size={16} />
            <span className="visually-hidden">{t('searchCourse')}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('findCourse')} />
          </label>
          {groups.length > 1 && (
            <select className="select board-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('group')}>
              <option value="">{t('allGroups')}</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <div className="segmented" role="group" aria-label={t('view')}>
            <button type="button" aria-pressed={view === 'grid'} aria-label={t('grid')} title={t('grid')}
              className={view === 'grid' ? 'segmented-item active' : 'segmented-item'} onClick={() => pickView('grid')}><IconDashboard size={16} /></button>
            <button type="button" aria-pressed={view === 'list'} aria-label={t('list')} title={t('list')}
              className={view === 'list' ? 'segmented-item active' : 'segmented-item'} onClick={() => pickView('list')}><IconList size={16} /></button>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="cab-card">
          <EmptyState icon={<IconCourses size={24} />}
            text={courses.length === 0 ? t('boardEmpty') : t('boardNoMatch')} />
        </div>
      ) : view === 'grid' ? (
        <div className="course-grid" key={`${status}-${group}`}>
          {shown.map((c) => (
            <article key={c.id} className={c.status === 'archived' ? 'course-tile archived' : 'course-tile'}>
              <Link href={link(`/teach/courses/${c.id}`)} className="course-tile-cover" style={coverStyle(c.subject || c.title)} tabIndex={-1} aria-hidden="true">
                <span className="course-tile-glyph">{(c.subject || c.title).slice(0, 1).toUpperCase()}</span>
                <span className="course-tile-subject">{c.subject || t('noSubject')}</span>
                {c.ungraded > 0 && <span className="course-tile-badge">{t('nToReview', { n: c.ungraded })}</span>}
              </Link>
              <div className="course-tile-body">
                <div className="course-tile-meta">
                  <StatusPill tone={c.status === 'published' ? 'ok' : c.status === 'draft' ? 'neutral' : 'danger'}>{COURSE_STATUS_LABELS[c.status]}</StatusPill>
                  <span className="muted">{t('changedAgo', { ago: formatAgo(c.updatedAt, locale) })}</span>
                </div>
                <h3><Link href={link(`/teach/courses/${c.id}`)}>{c.title}</Link></h3>
                <div className="chip-row">
                  {c.groups.length ? c.groups.map((g) => <span key={g} className="chip-sm">{g}</span>) : <span className="chip-sm warn">{t('notOpened')}</span>}
                  {c.owner && <span className="muted">· {c.owner}</span>}
                </div>
                <dl className="course-tile-facts">
                  <div><dt>{t('factTopics', { n: c.topics })}</dt><dd>{c.topics}</dd></div>
                  <div><dt>{t('factStudents', { n: c.students })}</dt><dd>{c.students}</dd></div>
                  <div><dt>{t('checked')}</dt><dd>{c.graded}</dd></div>
                </dl>
                <div className="course-tile-progress">
                  <span className="muted">{t('topicsPassed')}</span><b>{c.percent}%</b>
                  <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.percent}
                    aria-label={t('topicsPassedAria', { n: c.percent })}><i style={{ width: `${c.percent}%` }} /></div>
                </div>
              </div>
              <footer className="course-tile-foot">
                {c.reviewHref
                  ? <Link className="btn btn-sm btn-warn" href={link(c.reviewHref)}>{t('reviewN', { n: c.ungraded })}</Link>
                  : <Link className="btn btn-sm btn-secondary" href={link(`/teach/courses/${c.id}`)}>{t('editor')}</Link>}
                <Link className="btn btn-sm btn-ghost" href={link(`/teach/courses/${c.id}/journal`)}>{t('journal')}</Link>
                <Link className="btn btn-sm btn-ghost" href={link(`/teach/courses/${c.id}/analytics`)}>{t('analytics')}</Link>
                <a className="cab-icon-btn" href={learnCourseHref(c.id, true)} target="_blank" rel="noopener noreferrer"
                  title={t('asStudent')} aria-label={t('openAsStudent', { title: c.title })}><IconView size={18} /></a>
                {menu(c)}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="cab-card">
          <div className="table-wrap">
            <table className="data-table course-rows">
              <thead><tr><th>{t('colCourse')}</th><th>{t('colGroups')}</th><th className="center">{t('colTopics')}</th><th className="center">{t('colStudents')}</th><th>{t('colPassed')}</th><th className="center">{t('colReview')}</th><th className="actions"><span className="visually-hidden">{t('actions')}</span></th></tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td data-label={t('colCourse')}>
                      <span className="course-row-title">
                        <span className="course-row-dot" style={coverStyle(c.subject || c.title)} aria-hidden="true">{(c.subject || c.title).slice(0, 1).toUpperCase()}</span>
                        <span><Link href={link(`/teach/courses/${c.id}`)}>{c.title}</Link>
                          <small className="muted">{COURSE_STATUS_LABELS[c.status]}{c.subject ? ` · ${c.subject}` : ''}{c.owner ? ` · ${c.owner}` : ''}</small></span>
                      </span>
                    </td>
                    <td data-label={t('colGroups')}>{c.groups.join(', ') || <span className="muted">—</span>}</td>
                    <td data-label={t('colTopics')} className="center num">{c.topics}</td>
                    <td data-label={t('colStudents')} className="center num">{c.students}</td>
                    <td data-label={t('colPassed')}><span className="inline-meter"><span className="meter"><i style={{ width: `${c.percent}%` }} /></span><span className="num">{c.percent}%</span></span></td>
                    <td data-label={t('colReview')} className="center num">{c.ungraded || '—'}</td>
                    <td className="actions">
                      {c.reviewHref
                        ? <Link className="btn btn-sm btn-warn" href={link(c.reviewHref)}>{t('review')}</Link>
                        : <Link className="btn btn-sm btn-ghost" href={link(`/teach/courses/${c.id}/journal`)}>{t('journal')}</Link>}
                      {menu(c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

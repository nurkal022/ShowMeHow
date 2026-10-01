'use client';
import Link from 'next/link';
import type { StudentGrade } from '@/lib/lms/submissions';
import { useLocale, useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';
import { learnMe } from '@/i18n/messages/learn-me';
import { learnScore } from './format';
import { coverStyle } from '@/lib/lms/covers';
import { Ring } from '@/components/cabinet/viz';
import { IconAlert, IconCheck, IconChevron } from '@/components/icons';

interface CourseGroup { courseId: string; title: string; rows: StudentGrade[] }

function byCourse(grades: StudentGrade[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  for (const g of grades) {
    const group = groups.get(g.courseId)
      ?? { courseId: g.courseId, title: g.courseTitle, rows: [] };
    group.rows.push(g);
    groups.set(g.courseId, group);
  }
  return [...groups.values()];
}

const STATE_CLASS: Record<string, string> = {
  graded: 'done', submitted: 'wait', returned: 'back', draft: 'none', none: 'none',
};

/** Мои оценки: общий итог сверху, затем курсы — каждый со своей сводкой и списком работ. */
export default function GradesTable({ grades }: { grades: StudentGrade[] }) {
  const t = useT(learnMe);
  const tl = useT(learn);
  const locale = useLocale();
  const formatScore = (n: number | null) => learnScore(n, locale);
  if (grades.length === 0) {
    return <p className="empty-state">{t('noGrades')}</p>;
  }
  const courses = byCourse(grades);
  const gradedAll = grades.filter((g) => g.state === 'graded');
  const earnedAll = gradedAll.reduce((a, g) => a + (g.score ?? 0), 0);
  const gradedMaxAll = gradedAll.reduce((a, g) => a + g.points, 0);
  const maxAll = grades.reduce((a, g) => a + g.points, 0);
  const doneAll = grades.filter((g) => g.state === 'graded' || g.state === 'submitted').length;
  const returned = grades.filter((g) => g.state === 'returned').length;
  const percentAll = gradedMaxAll > 0 ? Math.round((earnedAll / gradedMaxAll) * 100) : 0;

  return (
    <div className="gr">
      <section className="gr-summary" aria-label={t('summaryAria')}>
        <div className="gr-sum-main">
          <Ring value={percentAll} size={84} stroke={9} label={t('avgResultLabel', { p: percentAll })} />
          <div>
            <b>{percentAll}%</b>
            <span>{t('avgChecked')}</span>
            <small className="muted">{t('ofPossible', { a: formatScore(earnedAll), b: formatScore(gradedMaxAll) })}</small>
          </div>
        </div>
        <div className="gr-sum-tiles">
          <div><b>{doneAll} / {grades.length}</b><span>{t('worksSubmitted', { n: grades.length })}</span></div>
          <div><b>{formatScore(earnedAll)}</b><span>{t('ofCourseTotal', { b: formatScore(maxAll) })}</span></div>
          <div className={returned > 0 ? 'warn' : undefined}>
            <b>{returned}</b>
            <span>{returned > 0
              ? t('worksReturned', { n: returned })
              : t('nothingReturned')}</span>
          </div>
        </div>
      </section>

      {courses.map((c) => {
        const graded = c.rows.filter((g) => g.state === 'graded');
        const earned = graded.reduce((a, g) => a + (g.score ?? 0), 0);
        const max = c.rows.reduce((a, g) => a + g.points, 0);
        const gradedMax = graded.reduce((a, g) => a + g.points, 0);
        const done = c.rows.filter((g) => g.state === 'graded' || g.state === 'submitted').length;
        const percent = gradedMax > 0 ? Math.round((earned / gradedMax) * 100) : 0;
        return (
          <section key={c.courseId} className="gr-course">
            <header className="gr-course-head">
              <span className="gr-cover" style={coverStyle(c.title)} aria-hidden="true">{c.title.slice(0, 1).toUpperCase()}</span>
              <div className="gr-course-title">
                <h2><Link href={`/learn/courses/${c.courseId}`}>{c.title}<IconChevron size={15} /></Link></h2>
                <span className="muted">{t('courseLine', { done, n: c.rows.length, a: formatScore(earned), b: formatScore(max) })}</span>
                <span className="lv-bar sm"><i style={{ width: `${c.rows.length ? (done / c.rows.length) * 100 : 0}%` }} /></span>
              </div>
              {gradedMax > 0 && <span className={`gr-pct ${percent >= 85 ? 'high' : percent >= 60 ? 'mid' : 'low'}`}>{percent}%</span>}
            </header>
            <ul className="gr-rows">
              {c.rows.map((g) => (
                <li key={g.blockId} className={STATE_CLASS[g.state] ?? 'none'}>
                  <Link href={`/learn/topics/${g.topicId}#block-${g.blockId}`}>
                    <span className="gr-row-text">
                      <b>{g.title}</b>
                      <small className="muted">{g.topicTitle}</small>
                    </span>
                    <span className={`gr-state ${STATE_CLASS[g.state] ?? 'none'}`}>
                      {g.state === 'graded' && <IconCheck size={13} />}
                      {g.state === 'returned' && <IconAlert size={13} />}
                      {tl(`answer_${g.state}`)}
                    </span>
                    <span className="gr-score">
                      {g.score === null ? <span className="muted">— / {g.points}</span> : <><b>{formatScore(g.score)}</b> / {g.points}</>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

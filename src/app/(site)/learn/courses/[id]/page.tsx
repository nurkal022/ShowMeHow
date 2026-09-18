import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { firstParam, type SearchParams } from '@/lib/http/params';
import { learnerCourse } from '@/lib/lms/access';
import { listTopics, openedTopicIds } from '@/lib/lms/courses';
import { learnTopicHref } from '@/lib/lms/links';
import Markup from '@/components/lms/Markup';
import StatusPill from '@/components/cabinet/StatusPill';

export default async function LearnCoursePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/learn/courses/${id}`);
  if (!user) return null;
  const ctx = await learnerCourse(user, id, firstParam((await searchParams).preview) === '1');
  if (!ctx) notFound();
  const { course, preview } = ctx;
  const [topics, opened] = await Promise.all([
    listTopics(course.id),
    preview ? Promise.resolve(new Set<string>()) : openedTopicIds(course.id, user.id),
  ]);
  return (
    <div className="lesson">
      {preview && <p className="warn-banner">Так курс видит ученик. Ответы в этом режиме не сохраняются.</p>}
      <Link href={preview ? `/teach/courses/${course.id}` : '/learn'} className="muted">
        {preview ? '← К редактору' : '← Мои курсы'}
      </Link>
      <h1>{course.title}</h1>
      {course.description && <Markup text={course.description} />}
      {topics.length === 0
        ? <p className="empty-state">В курсе пока нет тем.</p>
        : (
          <ol className="topic-toc">
            {topics.map((t, i) => (
              <li key={t.id}>
                <Link href={learnTopicHref(t.id, preview)}>{`${i + 1}. ${t.title}`}</Link>
                {opened.has(t.id) && <StatusPill tone="ok">открыта</StatusPill>}
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

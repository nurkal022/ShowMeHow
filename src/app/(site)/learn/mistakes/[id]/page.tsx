import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getRemedial, markRemedialOpened } from '@/lib/lms/remedial';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { learnMe } from '@/i18n/messages/learn-me';
import { learnDate } from '@/components/learn/format';
import Markup from '@/components/lms/Markup';
import RemedialTasks from '@/components/learn/RemedialTasks';
import { IconAlert, IconBack, IconUser } from '@/components/icons';

/** Персональный разбор ошибки: объяснение помощника и мини-задания с проверкой на месте. */
export default async function RemedialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/learn/mistakes/${id}`);
  if (!user) return null;
  // Чужой разбор неотличим от несуществующего — оба 404.
  const remedial = await getRemedial(user.id, id);
  if (!remedial) notFound();
  await markRemedialOpened(user.id, remedial.id);
  const locale = await getLocale();
  const t = translator(learnMe, locale);

  return (
    <div className="learn-page rm-page">
      <Link className="btn btn-sm btn-ghost rm-back" href="/learn/mistakes"><IconBack size={15} />{t('mistakesTitle')}</Link>
      <header className="learn-head">
        <div>
          <h1>{remedial.title}</h1>
          <p className="muted">
            {[remedial.topicTitle, remedial.courseTitle].filter(Boolean).join(' · ')}
            {remedial.topicTitle ? ' · ' : ''}
            {learnDate(remedial.createdAt, locale)}
          </p>
        </div>
      </header>

      {remedial.reason && (
        <div className="rm-why">
          <span className="rm-why-icon"><IconAlert size={18} /></span>
          <div><b>{t('whyWrong')}</b><p>{remedial.reason}</p></div>
        </div>
      )}

      {remedial.body.sections.map((s, i) => (
        <article className="rm-section" key={i} style={{ animationDelay: `${i * 60}ms` }}>
          {s.title && <h2>{s.title}</h2>}
          <Markup text={s.body} />
        </article>
      ))}

      <RemedialTasks id={remedial.id} tasks={remedial.body.tasks} status={remedial.status} />

      {!remedial.body.personal && (
        <Link className="mk-invite" href="/learn/me">
          <span className="mk-invite-icon"><IconUser size={20} /></span>
          <span className="mk-invite-text">
            <b>{t('wantPersonal')}</b>
            <small>{t('wantPersonalText')}</small>
          </span>
        </Link>
      )}
    </div>
  );
}

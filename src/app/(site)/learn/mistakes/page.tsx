import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listGaps, topicGaps } from '@/lib/lms/gaps';
import { getInterests } from '@/lib/lms/interests-store';
import { interestsFilled } from '@/lib/lms/interests';
import { listRemedials, remedialsByBlock } from '@/lib/lms/remedial';
import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { learn } from '@/i18n/messages/learn';
import { learnMe } from '@/i18n/messages/learn-me';
import { learnDate } from '@/components/learn/format';
import GapList from '@/components/learn/GapList';
import { IconBulb, IconCheck, IconSpark, IconTrophy, IconUser } from '@/components/icons';

/** Работа над ошибками: где ученик просел и какие персональные разборы у него уже есть. */
export default async function MistakesPage() {
  const user = await requirePageUser('/learn/mistakes');
  if (!user) return null;
  const locale = await getLocale();
  const t = translator(learnMe, locale);
  const tl = translator(learn, locale);
  const [gaps, remedials, interests] = await Promise.all([
    listGaps(user.id), listRemedials(user.id), getInterests(user.id),
  ]);
  const existing = Object.fromEntries(await remedialsByBlock(user.id));
  const topics = topicGaps(gaps);
  const filled = interestsFilled(interests);

  return (
    <div className="learn-page mk-page">
      <header className="learn-head">
        <div>
          <h1>{t('mistakesTitle')}</h1>
          <p className="muted">{t('mistakesIntro')}</p>
        </div>
      </header>

      {filled < 50 && (
        <Link className="mk-invite" href="/learn/me">
          <span className="mk-invite-icon"><IconUser size={20} /></span>
          <span className="mk-invite-text">
            <b>{t('tellInterests')}</b>
            <small>
              {filled === 0
                ? t('profileEmpty')
                : t('profileFilled', { p: filled })}
            </small>
          </span>
        </Link>
      )}

      {topics.length > 0 && (
        <section className="mk-topics" aria-label={t('topicsAria')}>
          <h2 className="learn-section-title"><IconTrophy size={17} />{t('topicsTitle')}</h2>
          <ul>
            {topics.map((tp) => (
              <li key={tp.topicId}>
                <b>{tp.topicTitle}</b>
                <small>{tp.courseTitle}</small>
                <span className="mk-topic-count">{tl('doneOfTasks', { done: tp.failed, n: tp.total })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t('weakAria')}>
        <h2 className="learn-section-title"><IconSpark size={17} />{t('whatFailed')}</h2>
        {gaps.length === 0
          ? (
            <div className="learn-empty">
              <span className="learn-empty-icon"><IconCheck size={26} /></span>
              <h2>{t('noWeak')}</h2>
              <p>{t('noWeakText')}</p>
            </div>
          )
          : <GapList gaps={gaps} existing={existing} />}
      </section>

      {remedials.length > 0 && (
        <section aria-label={t('myBreakdowns')}>
          <h2 className="learn-section-title"><IconBulb size={17} />{t('myBreakdowns')}</h2>
          <ul className="mk-remedials">
            {remedials.map((r) => (
              <li key={r.id}>
                <Link href={`/learn/mistakes/${r.id}`}>
                  <span className="mk-rm-text">
                    <b>{r.title}</b>
                    <small>
                      {[r.topicTitle, r.courseTitle].filter(Boolean).join(' · ') || t('topicDeleted')}
                      {` · ${learnDate(r.createdAt, locale)}`}
                    </small>
                  </span>
                  <span className={`mk-rm-status ${r.status}`}>{t(`status_${r.status}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

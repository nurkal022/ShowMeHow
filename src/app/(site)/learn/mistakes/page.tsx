import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listGaps, topicGaps } from '@/lib/lms/gaps';
import { getInterests } from '@/lib/lms/interests-store';
import { interestsFilled } from '@/lib/lms/interests';
import { listRemedials, remedialsByBlock } from '@/lib/lms/remedial';
import { formatDate, ruPlural } from '@/lib/lms/format';
import GapList from '@/components/learn/GapList';
import { IconBulb, IconCheck, IconSpark, IconTrophy, IconUser } from '@/components/icons';

const STATUS_LABEL = { new: 'Не открыт', in_progress: 'В работе', done: 'Разобрано' } as const;

/** Работа над ошибками: где ученик просел и какие персональные разборы у него уже есть. */
export default async function MistakesPage() {
  const user = await requirePageUser('/learn/mistakes');
  if (!user) return null;
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
          <h1>Работа над ошибками</h1>
          <p className="muted">
            Здесь собраны задания, которые не получились. По каждому помощник напишет персональный разбор:
            объяснит, где была ошибка, и даст свои задачи на ту же идею — потренироваться без оценок.
          </p>
        </div>
      </header>

      {filled < 50 && (
        <Link className="mk-invite" href="/learn/me">
          <span className="mk-invite-icon"><IconUser size={20} /></span>
          <span className="mk-invite-text">
            <b>Расскажите о своих интересах</b>
            <small>
              {filled === 0
                ? 'Профиль пока пустой — разборы будут с обычными примерами. Пара минут, и задачи станут про то, что вам нравится.'
                : `Профиль заполнен на ${filled}%. Чем больше знает помощник, тем ближе к вам будут примеры.`}
            </small>
          </span>
        </Link>
      )}

      {topics.length > 0 && (
        <section className="mk-topics" aria-label="Темы, где ошибок больше всего">
          <h2 className="learn-section-title"><IconTrophy size={17} />Темы, к которым стоит вернуться</h2>
          <ul>
            {topics.map((t) => (
              <li key={t.topicId}>
                <b>{t.topicTitle}</b>
                <small>{t.courseTitle}</small>
                <span className="mk-topic-count">{`${t.failed} из ${t.total} ${ruPlural(t.total, 'задания', 'заданий', 'заданий')}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Слабые места">
        <h2 className="learn-section-title"><IconSpark size={17} />Что не получилось</h2>
        {gaps.length === 0
          ? (
            <div className="learn-empty">
              <span className="learn-empty-icon"><IconCheck size={26} /></span>
              <h2>Слабых мест не нашлось</h2>
              <p>Все проверенные работы сданы хорошо. Если какое-то задание вернут на доработку или балл окажется низким, оно появится здесь.</p>
            </div>
          )
          : <GapList gaps={gaps} existing={existing} />}
      </section>

      {remedials.length > 0 && (
        <section aria-label="Мои разборы">
          <h2 className="learn-section-title"><IconBulb size={17} />Мои разборы</h2>
          <ul className="mk-remedials">
            {remedials.map((r) => (
              <li key={r.id}>
                <Link href={`/learn/mistakes/${r.id}`}>
                  <span className="mk-rm-text">
                    <b>{r.title}</b>
                    <small>
                      {[r.topicTitle, r.courseTitle].filter(Boolean).join(' · ') || 'тема удалена'}
                      {` · ${formatDate(r.createdAt)}`}
                    </small>
                  </span>
                  <span className={`mk-rm-status ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

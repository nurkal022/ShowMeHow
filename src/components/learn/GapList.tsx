'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Gap } from '@/lib/lms/gaps';
import type { Remedial } from '@/lib/lms/remedial';
import { coverStyle } from '@/lib/lms/covers';
import { formatDate, formatScore } from '@/lib/lms/format';
import { callApi } from '@/components/cabinet/api';
import { IconBulb, IconChevron, IconSpark } from '@/components/icons';

/**
 * Слабые места ученика с кнопкой «Разобрать». Сборка разбора идёт минуту-другую,
 * поэтому кнопка блокируется вся карточка целиком, а не одна только кнопка:
 * второй такой же разбор ученику не нужен. Если разбор уже есть — ведём в него.
 */
export default function GapList({ gaps, existing }: { gaps: Gap[]; existing: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function explain(blockId: string) {
    setBusy(blockId);
    setError('');
    const res = await callApi<{ remedial: Remedial }>('/api/learn/remedial', 'POST', { blockId });
    if (!res.ok) { setBusy(''); setError(res.error); return; }
    router.push(`/learn/mistakes/${res.data.remedial.id}`);
  }

  return (
    <>
      {error && <p className="error-box" role="alert">{error}</p>}
      <ul className="gap-list">
        {gaps.map((g, i) => {
          const done = existing[g.blockId];
          return (
            <li key={g.blockId} className={busy === g.blockId ? 'busy' : ''} style={{ animationDelay: `${i * 45}ms` }}>
              <span className="gap-cover" style={coverStyle(g.subject || g.courseTitle)} aria-hidden="true">
                {(g.subject || g.courseTitle).slice(0, 1).toUpperCase()}
              </span>
              <div className="gap-text">
                <b>{g.title}</b>
                <small>{g.topicTitle} · {g.courseTitle}</small>
                <span className="gap-meta">
                  {g.score === null
                    ? 'Возвращено на доработку'
                    : `${formatScore(g.score)} из ${g.points} баллов · ${g.percent}%`}
                  {` · ${formatDate(g.at)}`}
                </span>
              </div>
              {done
                ? (
                  <Link className="btn btn-sm" href={`/learn/mistakes/${done}`}>
                    <IconBulb size={15} />Открыть разбор<IconChevron size={15} />
                  </Link>
                )
                : (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy !== ''}
                    onClick={() => void explain(g.blockId)}>
                    <IconSpark size={15} />{busy === g.blockId ? 'Собираю разбор…' : 'Разобрать'}
                  </button>
                )}
            </li>
          );
        })}
      </ul>
      {busy && <p className="muted gap-wait">Помощник пишет объяснение и придумывает задания — это занимает до двух минут. Не закрывайте страницу.</p>}
    </>
  );
}

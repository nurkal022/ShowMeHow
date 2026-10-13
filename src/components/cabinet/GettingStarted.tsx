'use client';
import { useState } from 'react';
import Link from 'next/link';
import { IconCheck } from '@/components/icons';
import { IconChevronRight } from '@/components/cabinet/icons';
import { startCookie, type StartStep } from './getting-started';

/**
 * «С чего начать»: шаги сами отмечаются по данным кабинета, первый невыполненный — с главной кнопкой.
 * Скрывается навсегда кнопкой «Скрыть»; когда всё сделано, сервер его просто не рисует.
 */
export default function GettingStarted({ scope, title, sub, progress, hideLabel, steps }: {
  scope: string; title: string; sub: string; progress: string; hideLabel: string; steps: StartStep[];
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.key;

  function hide() {
    document.cookie = `${startCookie(scope)}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setHidden(true);
  }

  return (
    <section className="cab-card start-card" aria-label={title}>
      <header className="cab-card-head">
        <div><h2>{title}</h2><span className="muted">{sub}</span></div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={hide}>{hideLabel}</button>
      </header>
      <div className="start-progress">
        <span className="bar"><i style={{ width: `${Math.round((done / steps.length) * 100)}%`, background: 'var(--accent)' }} /></span>
        <small>{progress}</small>
      </div>
      <ol className="start-steps">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : s.key === next ? 'next' : ''}>
            <span className="start-mark" aria-hidden="true">{s.done ? <IconCheck size={14} /> : i + 1}</span>
            <div><strong>{s.title}</strong>{!s.done && <span className="muted">{s.hint}</span>}</div>
            {!s.done && s.href && s.cta && (
              <Link className={`btn btn-sm ${s.key === next ? 'btn-primary' : 'btn-ghost'}`} href={s.href}>
                {s.cta}<IconChevronRight size={14} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

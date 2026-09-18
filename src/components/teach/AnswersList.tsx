'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { AnswerState } from '@/lib/lms/types';
import StatusPill, { type PillTone } from '@/components/cabinet/StatusPill';

export interface AnswerListItem {
  id: string;
  name: string;
  groups: string;
  state: AnswerState;
  stateLabel: string;
  tone: PillTone;
  score: string;
  submittedAt: string;
  href: string | null;
  selected: boolean;
}

type Filter = 'all' | 'pending' | 'graded' | 'missing';
const FILTERS: { key: Filter; label: string; match: (s: AnswerState) => boolean }[] = [
  { key: 'all', label: 'Все', match: () => true },
  { key: 'pending', label: 'Ждут проверки', match: (s) => s === 'submitted' },
  { key: 'graded', label: 'Проверены', match: (s) => s === 'graded' },
  { key: 'missing', label: 'Не сдали', match: (s) => s === 'none' || s === 'draft' || s === 'returned' },
];

/**
 * Список ответов с быстрым фильтром. Ссылка следующей непроверенной работы
 * помечена data-next-answer: по ней форма оценки уходит «к следующему».
 */
export default function AnswersList({ items }: { items: AnswerListItem[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = items.filter((i) => active.match(i.state) || i.selected);
  const at = items.findIndex((i) => i.selected);
  const after = [...items.slice(at + 1), ...items.slice(0, Math.max(at, 0))];
  const next = after.find((i) => i.href && i.state === 'submitted') ?? null;

  return (
    <div className="cf-answers">
      <div className="cf-filter" role="group" aria-label="Какие ответы показать">
        {FILTERS.map((f) => {
          const count = items.filter((i) => f.match(i.state)).length;
          return (
            <button key={f.key} type="button" aria-pressed={filter === f.key}
              className={filter === f.key ? 'cf-filter-item active' : 'cf-filter-item'} onClick={() => setFilter(f.key)}>
              {f.label}<span className="cf-count">{count}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="empty-state">
          {filter === 'pending' ? 'Непроверенных ответов нет — всё проверено.' : 'Под этот фильтр никто не подходит.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table cf-table">
            <thead><tr><th>Ученик</th><th>Статус</th><th>Балл</th><th>Сдано</th><th><span className="visually-hidden">Действия</span></th></tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className={i.selected ? 'selected' : undefined}>
                  <td data-label="Ученик">
                    <span className="cf-person">
                      <strong>{i.name}</strong>
                      {i.groups && <span className="muted">{i.groups}</span>}
                    </span>
                  </td>
                  <td data-label="Статус"><StatusPill tone={i.tone}>{i.stateLabel}</StatusPill></td>
                  <td data-label="Балл"><span className="num">{i.score}</span></td>
                  <td data-label="Сдано">{i.submittedAt}</td>
                  <td className="actions">
                    {i.href && (
                      <Link href={i.href} scroll={false} data-next-answer={next?.id === i.id ? '' : undefined}
                        aria-current={i.selected ? 'true' : undefined}
                        aria-label={`${i.state === 'submitted' ? 'Проверить ответ' : 'Открыть ответ'}: ${i.name}`}
                        className={i.state === 'submitted' ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-ghost'}>
                        {i.state === 'submitted' ? 'Проверить' : 'Открыть'}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

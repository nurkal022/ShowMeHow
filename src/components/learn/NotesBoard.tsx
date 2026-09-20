'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { NoteEntry } from '@/lib/lms/notes';
import { coverStyle } from '@/lib/lms/covers';
import { ruPlural } from '@/lib/lms/format';
import { IconChevron, IconEdit, IconSearch } from '@/components/icons';
import { IconStar } from '@/components/cabinet/icons';

type Filter = 'all' | 'marks' | 'notes';

const FILTERS: [Filter, string][] = [['all', 'Всё'], ['marks', 'Закладки'], ['notes', 'С заметкой']];

/** Конспект ученика: закладки и заметки по всем курсам, с поиском и фильтром. */
export default function NotesBoard({ notes }: { notes: NoteEntry[] }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [course, setCourse] = useState('');

  const courses = [...new Map(notes.map((n) => [n.courseId, n.courseTitle])).entries()];
  const counts = {
    all: notes.length,
    marks: notes.filter((n) => n.bookmarked).length,
    notes: notes.filter((n) => n.body.trim()).length,
  };
  const needle = q.trim().toLowerCase();
  const shown = notes.filter((n) => {
    if (filter === 'marks' && !n.bookmarked) return false;
    if (filter === 'notes' && !n.body.trim()) return false;
    if (course && n.courseId !== course) return false;
    if (!needle) return true;
    return `${n.body} ${n.stepTitle} ${n.topicTitle} ${n.courseTitle}`.toLowerCase().includes(needle);
  });

  const grouped = new Map<string, NoteEntry[]>();
  for (const n of shown) grouped.set(n.courseId, [...(grouped.get(n.courseId) ?? []), n]);

  return (
    <>
      <div className="cat-tools">
        <label className="cat-search">
          <IconSearch size={16} />
          <input className="input" value={q} placeholder="Найти по тексту заметки или названию темы"
            onChange={(e) => setQ(e.target.value)} aria-label="Поиск по заметкам" />
        </label>
        <div className="cat-filters" role="tablist" aria-label="Что показать">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f}
              className={filter === f ? 'cat-chip active' : 'cat-chip'} onClick={() => setFilter(f)}>
              {label}<b>{counts[f]}</b>
            </button>
          ))}
        </div>
      </div>
      {courses.length > 1 && (
        <div className="cat-subjects">
          <button type="button" className={course === '' ? 'cat-sub active' : 'cat-sub'} onClick={() => setCourse('')}>Все курсы</button>
          {courses.map(([id, title]) => (
            <button key={id} type="button" className={course === id ? 'cat-sub active' : 'cat-sub'}
              onClick={() => setCourse(course === id ? '' : id)}>{title}</button>
          ))}
        </div>
      )}

      {shown.length === 0
        ? <p className="empty-state">Ничего не нашлось. Попробуйте другой запрос или снимите фильтры.</p>
        : [...grouped.values()].map((list) => (
          <section key={list[0].courseId} className="nt-course">
            <h2 className="learn-section-title">
              <span className="nt-cover" style={coverStyle(list[0].subject || list[0].courseTitle)} aria-hidden="true">
                {(list[0].subject || list[0].courseTitle).slice(0, 1).toUpperCase()}
              </span>
              <Link href={`/learn/courses/${list[0].courseId}`}>{list[0].courseTitle}</Link>
              <small className="muted">{list.length} {ruPlural(list.length, 'отметка', 'отметки', 'отметок')}</small>
            </h2>
            <ul className="nt-list">
              {list.map((n, i) => (
                <li key={n.blockId} className={n.bookmarked ? 'bookmarked' : undefined} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <Link href={`/learn/topics/${n.topicId}#block-${n.blockId}`}>
                    <span className="nt-head">
                      <span className={n.bookmarked ? 'nt-star on' : 'nt-star'} aria-label={n.bookmarked ? 'Закладка' : 'Заметка'}>
                        {n.bookmarked ? <IconStar size={14} /> : <IconEdit size={13} />}
                      </span>
                      <b>{n.stepTitle}</b>
                      <IconChevron size={16} />
                    </span>
                    <small className="muted nt-sub">{n.topicTitle}</small>
                    {n.body && <p className="nt-body">{n.body}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}

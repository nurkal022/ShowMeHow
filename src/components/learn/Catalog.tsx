'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Course } from '@/lib/lms/types';
import type { ProgressTotals } from '@/lib/lms/learn-view';
import { coverStyle } from '@/lib/lms/covers';
import { useLocale, useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';
import { learnHome } from '@/i18n/messages/learn-home';
import { learnScore } from './format';
import { IconBook, IconBulb, IconCheck, IconLab, IconLibrary, IconPlay, IconSearch, IconSliders, IconTask, IconTrophy } from '@/components/icons';
import { IconStar } from '@/components/cabinet/icons';

export interface CatalogItem {
  course: Course;
  teacher: string | null;
  totals: ProgressTotals;
  continueId: string | null;
  topics: number;
}

type Filter = 'all' | 'active' | 'new' | 'done';

const FILTERS: Filter[] = ['all', 'active', 'new', 'done'];

type Sort = 'progress' | 'title' | 'points';

const SORTS: Sort[] = ['progress', 'title', 'points'];

const SECTIONS: Exclude<Filter, 'all'>[] = ['active', 'new', 'done'];

/** Соседние разделы: каталог не должен быть тупиком, когда курсов мало. */
const MORE = [
  { href: '/library', key: 'more_library', icon: IconLibrary },
  { href: '/labs', key: 'more_labs', icon: IconLab },
  { href: '/learn/grades', key: 'more_grades', icon: IconTrophy },
  { href: '/learn/notes', key: 'more_notes', icon: IconStar },
  { href: '/learn/mistakes', key: 'more_mistakes', icon: IconBulb },
] as const;

function stateOf(i: CatalogItem): Exclude<Filter, 'all'> {
  if (i.totals.topicsTotal > 0 && i.continueId === null) return 'done';
  return i.totals.topicsViewed > 0 || i.totals.assignmentsDone > 0 ? 'active' : 'new';
}

function percentOf(i: CatalogItem): number {
  return i.totals.topicsTotal ? Math.round((i.totals.topicsDone / i.totals.topicsTotal) * 100) : 0;
}

/** Каталог курсов ученика: поиск, предметы и состояние. Фильтры считаются на клиенте — список небольшой. */
export default function Catalog({ items }: { items: CatalogItem[] }) {
  const t = useT(learnHome);
  const tl = useT(learn);
  const locale = useLocale();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [teacher, setTeacher] = useState('');
  const [sort, setSort] = useState<Sort>('progress');

  // Сводка по всему, что открыто ученику: сверху фильтров, чтобы колонка
  // отвечала не только «что показать», но и «сколько всего».
  const summary = useMemo(() => {
    const pointsEarned = items.reduce((a, i) => a + i.totals.pointsEarned, 0);
    const pointsMax = items.reduce((a, i) => a + i.totals.pointsMax, 0);
    const topicsTotal = items.reduce((a, i) => a + i.totals.topicsTotal, 0);
    const topicsDone = items.reduce((a, i) => a + i.totals.topicsDone, 0);
    return {
      pointsEarned, pointsMax, topicsTotal, topicsDone,
      percent: topicsTotal ? Math.round((topicsDone / topicsTotal) * 100) : 0,
    };
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, active: 0, new: 0, done: 0 };
    for (const i of items) c[stateOf(i)] += 1;
    return c;
  }, [items]);
  // Списки берём из самих курсов: фиксированных справочников нет, новый предмет
  // или класс появится в фильтре сам.
  const byField = useMemo(() => {
    function tally(pick: (i: CatalogItem) => string) {
      const m = new Map<string, number>();
      for (const i of items) {
        const v = pick(i).trim();
        if (v) m.set(v, (m.get(v) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
    }
    return {
      subjects: tally((i) => i.course.subject),
      grades: tally((i) => i.course.grade),
      teachers: tally((i) => i.teacher ?? ''),
    };
  }, [items]);

  const needle = q.trim().toLowerCase();
  const found = items.filter((i) => {
    if (filter !== 'all' && stateOf(i) !== filter) return false;
    if (subject && i.course.subject !== subject) return false;
    if (grade && i.course.grade !== grade) return false;
    if (teacher && i.teacher !== teacher) return false;
    if (!needle) return true;
    return `${i.course.title} ${i.course.subject} ${i.course.grade} ${i.teacher ?? ''} ${i.course.description}`
      .toLowerCase().includes(needle);
  });
  const shown = [...found].sort((a, b) => (
    sort === 'title' ? a.course.title.localeCompare(b.course.title, 'ru')
      : sort === 'points' ? b.totals.pointsMax - a.totals.pointsMax
        : percentOf(b) - percentOf(a)));

  // Герой показываем только на «чистом» каталоге: с фильтром и поиском он мешает
  // сравнивать найденное и просто отнимает экран.
  const dirty = filter !== 'all' || !!subject || !!grade || !!teacher || !!needle;
  const hero = dirty
    ? null
    : [...shown].filter((i) => stateOf(i) === 'active').sort((a, b) => percentOf(b) - percentOf(a))[0] ?? null;
  const rest = shown.filter((i) => i !== hero);

  function reset() {
    setQ(''); setFilter('all'); setSubject(''); setGrade(''); setTeacher('');
  }

  return (
    <div className="cat-layout">
      <aside className="cat-side" aria-label={t('filtersAria')}>
        <div className="cat-side-head">
          <h2><IconSliders size={15} />{t('filters')}</h2>
          {dirty && <button type="button" className="cat-reset" onClick={reset}>{t('reset')}</button>}
        </div>

        <div className="cat-side-sum">
          <div className="cat-side-ring" style={{ ['--p' as string]: `${summary.percent}%` }} aria-hidden="true">
            <span>{summary.percent}%</span>
          </div>
          <div>
            <b>{t('sumTopics', { done: summary.topicsDone, n: summary.topicsTotal })}</b>
            <span className="muted">
              {summary.pointsMax > 0
                ? tl('pointsOfFull', { a: learnScore(summary.pointsEarned, locale), b: learnScore(summary.pointsMax, locale) })
                : t('noPointsYet')}
            </span>
          </div>
        </div>

        <div className="cat-group" role="group" aria-label={t('stateAria')}>
          <h3>{t('stateTitle')}</h3>
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f}
              className={filter === f ? 'cat-opt active' : 'cat-opt'} onClick={() => setFilter(f)}>
              {t(`f_${f}`)}<b>{counts[f]}</b>
            </button>
          ))}
        </div>

        <Group title={t('subject')} all={t('allSubjects')} options={byField.subjects} value={subject} onPick={setSubject} />
        <Group title={t('grade')} all={t('anyGrade')} options={byField.grades} value={grade} onPick={setGrade} />
        <Group title={t('teacher')} all={t('allTeachers')} options={byField.teachers} value={teacher} onPick={setTeacher} />

        <div className="cat-group" role="group" aria-label={t('sort')}>
          <h3>{t('sort')}</h3>
          {SORTS.map((s) => (
            <button key={s} type="button" aria-pressed={sort === s}
              className={sort === s ? 'cat-opt active' : 'cat-opt'} onClick={() => setSort(s)}>{t(`s_${s}`)}</button>
          ))}
        </div>

        <p className="cat-side-note muted">
          {t('sideNote')}
        </p>
      </aside>

      <div className="cat-main">
        <div className="cat-tools">
          <label className="cat-search">
            <IconSearch size={16} />
            <input className="input" value={q} placeholder={t('searchPlaceholder')}
              onChange={(e) => setQ(e.target.value)} aria-label={t('searchAria')} />
          </label>
          <span className="cat-found muted">
            {tl('coursesN', { n: shown.length })}
          </span>
        </div>

        {hero && <Hero item={hero} />}

        {shown.length === 0
          ? <p className="empty-state">{tl('nothingFound')}</p>
          : !dirty
            ? SECTIONS.map((key) => {
              const list = rest.filter((i) => stateOf(i) === key);
              if (list.length === 0) return null;
              return (
                <section key={key} className="cat-section">
                  <div className="cat-section-head">
                    <h2>{t(`sec_${key}`)}</h2>
                    <p className="muted">{t(`sec_${key}_hint`)}</p>
                    <span className="cat-section-count">{list.length}</span>
                  </div>
                  <Grid items={list} />
                </section>
              );
            })
            : <Grid items={rest} />}

        <section className="cat-more" aria-label={t('moreAria')}>
          <div className="cat-section-head">
            <h2>{t('moreTitle')}</h2>
            <p className="muted">{t('moreHint')}</p>
          </div>
          <div className="cat-more-grid">
            {MORE.map(({ href, key, icon: Icon }) => (
              <Link key={href} className="cat-more-tile" href={href}>
                <span className="cat-more-icon"><Icon size={19} /></span>
                <b>{t(key)}</b>
                <span className="muted">{t(`${key}_text`)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Группа фильтра в боковой колонке: «всё» плюс значения со счётчиками. */
function Group({ title, all, options, value, onPick }: {
  title: string; all: string; options: [string, number][]; value: string; onPick: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="cat-group" role="group" aria-label={title}>
      <h3>{title}</h3>
      <button type="button" aria-pressed={value === ''} className={value === '' ? 'cat-opt active' : 'cat-opt'}
        onClick={() => onPick('')}>{all}</button>
      {options.map(([name, n]) => (
        <button key={name} type="button" aria-pressed={value === name}
          className={value === name ? 'cat-opt active' : 'cat-opt'}
          onClick={() => onPick(value === name ? '' : name)}>{name}<b>{n}</b></button>
      ))}
    </div>
  );
}

/** Курс, в котором ученик дальше всего: широкая карточка сверху каталога. */
function Hero({ item }: { item: CatalogItem }) {
  const t = useT(learnHome);
  const tl = useT(learn);
  const locale = useLocale();
  const percent = percentOf(item);
  const left = Math.max(0, item.totals.topicsTotal - item.totals.topicsDone);
  return (
    <section className="cat-hero" style={coverStyle(item.course.subject || item.course.title)}>
      <div className="cat-hero-art" aria-hidden="true">
        <span>{(item.course.subject || item.course.title).slice(0, 1).toUpperCase()}</span>
      </div>
      <div className="cat-hero-body">
        <span className="cat-hero-eyebrow">{t('heroEyebrow')}</span>
        <h2><Link href={`/learn/courses/${item.course.id}`}>{item.course.title}</Link></h2>
        <p className="cat-hero-sub">
          {item.course.subject}
          {item.course.grade && ` · ${item.course.grade}`}
          {item.teacher && ` · ${item.teacher}`}
        </p>
        <div className="cat-hero-bar"><i style={{ width: `${percent}%` }} /></div>
        <p className="cat-hero-nums">
          {tl('percentDone', { p: percent })}
          {left > 0 && t('leftTopics', { n: left })}
          {item.totals.pointsMax > 0 && ` · ${tl('pointsOfFull', { a: learnScore(item.totals.pointsEarned, locale), b: learnScore(item.totals.pointsMax, locale) })}`}
        </p>
        <div className="cat-hero-actions">
          {item.continueId && (
            <Link className="btn btn-primary" href={`/learn/topics/${item.continueId}`}>
              <IconPlay size={15} />{tl('continue')}
            </Link>
          )}
          <Link className="btn btn-ghost cat-hero-plan" href={`/learn/courses/${item.course.id}`}>{t('syllabus')}</Link>
        </div>
      </div>
    </section>
  );
}

function Grid({ items }: { items: CatalogItem[] }) {
  // Одна-две карточки в узкой колонке смотрятся потерянно, поэтому они
  // раскладываются вширь: обложка слева, текст справа.
  const t = useT(learnHome);
  const tl = useT(learn);
  const locale = useLocale();
  const wide = items.length <= 2;
  return (
    <div className={wide ? 'cat-grid wide' : 'cat-grid'}>
      {items.map((i, n) => {
        const st = stateOf(i);
        const percent = percentOf(i);
        return (
          <article key={i.course.id} className={`cat-card ${st}`} style={{ animationDelay: `${Math.min(n, 8) * 45}ms` }}>
            <Link className="cat-cover" href={`/learn/courses/${i.course.id}`}
              style={coverStyle(i.course.subject || i.course.title)} aria-label={i.course.title}>
              <span className="cat-cover-glyph" aria-hidden="true">{(i.course.subject || i.course.title).slice(0, 1).toUpperCase()}</span>
              <span className="cat-cover-meta">
                {i.course.subject && <b>{i.course.subject}</b>}
                {i.course.grade && <span>{i.course.grade}</span>}
              </span>
              {st === 'done' && <span className="cat-done"><IconCheck size={13} />{tl('passed')}</span>}
              {st === 'active' && <span className="cat-progress-tag">{percent}%</span>}
            </Link>
            <div className="cat-body">
              <h3><Link href={`/learn/courses/${i.course.id}`}>{i.course.title}</Link></h3>
              <p className="cat-desc">{i.course.description?.trim() || t('noDescription')}</p>
              <p className="learn-card-teacher">
                <span className="cat-teacher-ava" aria-hidden="true">{(i.teacher ?? '?').slice(0, 1).toUpperCase()}</span>
                {i.teacher ?? t('noTeacher')}
              </p>
              <ul className="cat-facts">
                <li><IconBook size={14} />{tl('topicsN', { n: i.topics })}</li>
                <li><IconTask size={14} />{tl('tasksN', { n: i.totals.assignmentsTotal })}</li>
                {i.totals.pointsMax > 0 && (
                  <li><IconTrophy size={14} />{tl('pointsShort', { a: learnScore(i.totals.pointsEarned, locale), b: learnScore(i.totals.pointsMax, locale) })}</li>
                )}
              </ul>
              <div className="cat-foot">
                <span className="lv-bar sm"><i style={{ width: `${percent}%` }} /></span>
                <span className="muted cat-foot-pct">
                  {st === 'done' ? t('courseDoneLower') : st === 'new' ? t('notStarted') : tl('percentDone', { p: percent })}
                </span>
                {i.continueId
                  ? (
                    <Link className="btn btn-sm btn-primary" href={`/learn/topics/${i.continueId}`}>
                      {st === 'new' ? tl('start') : tl('continue')}
                    </Link>
                  )
                  : <Link className="btn btn-sm" href={`/learn/courses/${i.course.id}`}>{t('repeat')}</Link>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LIMITS, type Course } from '@/lib/lms/types';
import { withOrgParam } from '@/lib/lms/links';
import { callApi } from '@/components/cabinet/api';
import { coverStyle } from '@/lib/lms/covers';
import Layer from './Layer';
import { IconClose, IconCourses, IconPlus, IconSpark } from '@/components/icons';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { COURSE_GRADES, COURSE_SUBJECTS, teachCourse } from '@/i18n/messages/teach-course';

/** Русский список предметов-подсказок; на других языках — COURSE_SUBJECTS[locale]. */
export const SUBJECTS = COURSE_SUBJECTS.ru;

/**
 * «Создать курс» — короткое окно: название, предмет и класс. Остальное (описание, план тем,
 * группы) заполняется на странице «О курсе» — там же помощник пишет описание и план.
 */
export default function NewCourseDialog({ org, openInitially }: {
  org: string; openInitially?: boolean; groups?: { id: string; title: string }[];
}) {
  const t = useT(teachCourse);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openInitially) setOpen(true); }, [openInitially]);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><IconPlus size={16} />{t('createCourse')}</button>
      {open && <Layer><NewCourseModal org={org} onClose={() => setOpen(false)} /></Layer>}
    </>
  );
}

function NewCourseModal({ org, onClose }: { org: string; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const t = useT(teachCourse);
  const fmt = useFormat();
  const locale = useLocale();
  const SUBJECTS = COURSE_SUBJECTS[locale];
  const GRADES = COURSE_GRADES[locale];
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.documentElement.style.overflow = ''; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError(t('nameCourse')); titleRef.current?.focus(); return; }
    setBusy(true);
    setError('');
    const res = await callApi<{ course: Course }>('/api/teach/courses', 'POST', { org, title, subject, grade });
    if (!res.ok) { setBusy(false); return setError(res.error); }
    router.push(withOrgParam(`/teach/courses/${res.data.course.id}/settings?new=1`, org));
  }

  return (
    <div className="nx-layer" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`}>
      <div className="nx-scrim" onClick={() => !busy && onClose()} />
      <form className="nx-modal nx-small" onSubmit={submit} noValidate>
        <div className="nq-cover" style={coverStyle(subject || title || 'курс')} aria-hidden="true">
          <span className="course-tile-glyph">{(subject || title || t('colCourse')).slice(0, 1).toUpperCase()}</span>
          <span className="nq-cover-text"><IconCourses size={18} />{subject || t('newCourse')}{grade ? ` · ${grade}` : ''}</span>
          <button type="button" className="nx-close nq-close" aria-label={t('close')} onClick={onClose}><IconClose size={18} /></button>
        </div>
        <div className="nq-body">
          <h2 id={`${uid}-t`}>{t('newCourse')}</h2>
          <label className="nx-field"><span>{t('name')}</span>
            <input ref={titleRef} className="input nc-title" value={title} maxLength={LIMITS.title} placeholder={t('namePh')}
              aria-invalid={error && !title.trim() ? true : undefined} onChange={(e) => { setTitle(e.target.value); setError(''); }} />
          </label>
          <div className="nx-field"><span>{t('subject')}</span>
            <div className="nc-subjects">
              {SUBJECTS.map((s) => (
                <button key={s} type="button" aria-pressed={subject === s} className={subject === s ? 'nc-subject on' : 'nc-subject'}
                  style={coverStyle(s)} onClick={() => setSubject(subject === s ? '' : s)}>{s}</button>
              ))}
              <input className="input nc-subject-own" value={SUBJECTS.includes(subject) ? '' : subject} maxLength={LIMITS.subject}
                placeholder={t('otherPh')} aria-label={t('otherSubject')} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
          <div className="nx-field"><span>{t('grade')}</span>
            <div className="nq-grades">
              {GRADES.map((g) => (
                <button key={g.value} type="button" aria-pressed={grade === g.value} className={grade === g.value ? 'nq-grade on' : 'nq-grade'}
                  onClick={() => setGrade(grade === g.value ? '' : g.value)}>{g.short}</button>
              ))}
            </div>
          </div>
          {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}
          <Link className="nq-program" href={withOrgParam('/teach/courses/generate', org)} onClick={onClose}>
            <IconSpark size={16} /><span><b>{t('haveProgram')}</b> {t('haveProgramHint')}</span>
          </Link>
        </div>
        <footer className="nx-foot">
          <span className="muted nq-hint">{t('nextStepHint')}</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />{busy ? t('creating') : t('createContinue')}</button>
        </footer>
      </form>
    </div>
  );
}

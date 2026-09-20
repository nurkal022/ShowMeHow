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

export const SUBJECTS = ['Физика', 'Химия', 'Биология', 'Математика', 'Алгебра', 'Геометрия', 'Информатика', 'География', 'История', 'Литература', 'Английский'];
const GRADES = ['5 класс', '6 класс', '7 класс', '8 класс', '9 класс', '10 класс', '11 класс', 'колледж'];

/**
 * «Создать курс» — короткое окно: название, предмет и класс. Остальное (описание, план тем,
 * группы) заполняется на странице «О курсе» — там же помощник пишет описание и план.
 */
export default function NewCourseDialog({ org, openInitially }: {
  org: string; openInitially?: boolean; groups?: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openInitially) setOpen(true); }, [openInitially]);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><IconPlus size={16} />Создать курс</button>
      {open && <Layer><NewCourseModal org={org} onClose={() => setOpen(false)} /></Layer>}
    </>
  );
}

function NewCourseModal({ org, onClose }: { org: string; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
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
    if (!title.trim()) { setError('Назовите курс — так его увидят ученики.'); titleRef.current?.focus(); return; }
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
          <span className="course-tile-glyph">{(subject || title || 'К').slice(0, 1).toUpperCase()}</span>
          <span className="nq-cover-text"><IconCourses size={18} />{subject || 'Новый курс'}{grade ? ` · ${grade}` : ''}</span>
          <button type="button" className="nx-close nq-close" aria-label="Закрыть" onClick={onClose}><IconClose size={18} /></button>
        </div>
        <div className="nq-body">
          <h2 id={`${uid}-t`}>Новый курс</h2>
          <label className="nx-field"><span>Название</span>
            <input ref={titleRef} className="input nc-title" value={title} maxLength={LIMITS.title} placeholder="Физика 8: колебания и волны"
              aria-invalid={error && !title.trim() ? true : undefined} onChange={(e) => { setTitle(e.target.value); setError(''); }} />
          </label>
          <div className="nx-field"><span>Предмет</span>
            <div className="nc-subjects">
              {SUBJECTS.map((s) => (
                <button key={s} type="button" aria-pressed={subject === s} className={subject === s ? 'nc-subject on' : 'nc-subject'}
                  style={coverStyle(s)} onClick={() => setSubject(subject === s ? '' : s)}>{s}</button>
              ))}
              <input className="input nc-subject-own" value={SUBJECTS.includes(subject) ? '' : subject} maxLength={LIMITS.subject}
                placeholder="другой…" aria-label="Другой предмет" onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
          <div className="nx-field"><span>Класс</span>
            <div className="nq-grades">
              {GRADES.map((g) => (
                <button key={g} type="button" aria-pressed={grade === g} className={grade === g ? 'nq-grade on' : 'nq-grade'}
                  onClick={() => setGrade(grade === g ? '' : g)}>{g.replace(' класс', '')}</button>
              ))}
            </div>
          </div>
          {error && <p className="error-box" role="alert">{error}</p>}
          <Link className="nq-program" href={withOrgParam('/teach/courses/generate', org)} onClick={onClose}>
            <IconSpark size={16} /><span><b>Есть программа или КТП?</b> Помощник соберёт весь курс сразу — темы, уроки и контрольные</span>
          </Link>
        </div>
        <footer className="nx-foot">
          <span className="muted nq-hint">Описание, план тем и группы — на следующем шаге</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><IconPlus size={16} />{busy ? 'Создаю…' : 'Создать и продолжить'}</button>
        </footer>
      </form>
    </div>
  );
}

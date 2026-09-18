'use client';
import { useEffect, useRef } from 'react';
import { IconClose, IconPlus } from '@/components/icons';
import NewCourseForm from '@/components/teach/NewCourseForm';

/** Кнопка «Создать курс» и окно с формой. `openInitially` — переход по «Новый курс» из меню. */
export default function NewCourseDialog({ org, openInitially }: { org: string; openInitially?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (openInitially && ref.current && !ref.current.open) ref.current.showModal();
  }, [openInitially]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => ref.current?.showModal()}>
        <IconPlus size={16} />Создать курс
      </button>
      <dialog ref={ref} className="cab-dialog" aria-labelledby="new-course-title"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="cab-dialog-body">
          <header>
            <h2 id="new-course-title">Новый курс</h2>
            <button type="button" className="cab-icon-btn" aria-label="Закрыть" onClick={() => ref.current?.close()}>
              <IconClose size={18} />
            </button>
          </header>
          <p className="muted">Темы, тренажёры и задания добавите в редакторе — курс откроется сразу после создания.</p>
          <NewCourseForm org={org} />
        </div>
      </dialog>
    </>
  );
}

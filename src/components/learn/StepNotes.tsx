'use client';
import { useEffect, useRef, useState } from 'react';
import { callApi } from '@/components/cabinet/api';
import { IconCheck, IconEdit } from '@/components/icons';
import { IconStar } from '@/components/cabinet/icons';
import { useT } from '@/i18n/client';
import { learnLesson } from '@/i18n/messages/learn-lesson';

/**
 * Заметка и закладка к шагу урока. Сохраняется сама — при уходе из поля и через
 * пару секунд после последней правки, чтобы ученик не думал о кнопке.
 */
export default function StepNotes({ blockId, body, bookmarked, onChange }: {
  blockId: string;
  body: string;
  bookmarked: boolean;
  onChange: (note: { body: string; bookmarked: boolean }) => void;
}) {
  const tr = useT(learnLesson);
  const [open, setOpen] = useState(body.length > 0);
  const [text, setText] = useState(body);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);

  // Шаг сменился — поле показывает заметку нового шага.
  useEffect(() => { setText(body); setOpen(body.length > 0); dirty.current = false; }, [blockId, body]);

  async function save(next: { body?: string; bookmarked?: boolean }) {
    const payload = { body: next.body ?? text, bookmarked: next.bookmarked ?? bookmarked };
    dirty.current = false;
    onChange(payload);
    await callApi('/api/learn/notes', 'POST', { blockId, ...payload });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => { void save({ body: text }); }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="sn">
      <div className="sn-tools">
        <button type="button" className={bookmarked ? 'sn-btn on' : 'sn-btn'} aria-pressed={bookmarked}
          onClick={() => void save({ bookmarked: !bookmarked })}>
          <IconStar size={15} />{bookmarked ? tr('inBookmarks') : tr('toBookmarks')}
        </button>
        <button type="button" className={open ? 'sn-btn on' : 'sn-btn'} aria-expanded={open}
          onClick={() => setOpen((v) => !v)}>
          <IconEdit size={15} />{text.trim() ? tr('myNote') : tr('note')}
        </button>
        {saved && <span className="sn-saved"><IconCheck size={13} />{tr('savedLower')}</span>}
        <span className="muted sn-hint">{tr('notesHint')}</span>
      </div>
      {open && (
        <textarea className="input sn-area" value={text} rows={3} maxLength={4000}
          placeholder={tr('notePlaceholder')}
          onChange={(e) => { dirty.current = true; setText(e.target.value); }}
          onBlur={() => { if (dirty.current) void save({ body: text }); }} />
      )}
    </div>
  );
}

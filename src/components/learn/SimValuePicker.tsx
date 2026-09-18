'use client';
import { useEffect, useRef, useState } from 'react';
import { requestSimValues, type SimReadout } from '@/lib/lms/sim-bridge';
import { formatScore } from '@/lib/lms/format';
import { IconPipette } from '@/components/icons';

/** Ближайший тренажёр: сначала стенд этого же задания, иначе последний тренажёр выше по уроку. */
function nearestFrame(from: HTMLElement): HTMLIFrameElement | null {
  const own = from.closest('.learn-task')?.querySelector<HTMLIFrameElement>('iframe.preview-frame');
  if (own) return own;
  // Стенды чужих заданий не в счёт: они относятся к своему вопросу.
  const all = [...document.querySelectorAll<HTMLIFrameElement>('.learn-lesson iframe.preview-frame')]
    .filter((f) => !f.closest('.learn-task'));
  const above = all.filter((f) => f.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING);
  return above[above.length - 1] ?? all[0] ?? null;
}

/** «Взять из тренажёра»: показания приборов и значения ползунков одним кликом попадают в ответ. */
export default function SimValuePicker({ onPick, disabled, compact }: {
  onPick: (value: string) => void; disabled?: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SimReadout[] | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setItems(null);
    setItems(wrap.current ? await requestSimValues(nearestFrame(wrap.current)) : []);
  }

  return (
    <span className="sim-pick" ref={wrap}>
      <button type="button" className={compact ? 'icon-btn sim-pick-btn' : 'btn btn-sm sim-pick-btn'} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} title="Взять значение из тренажёра" onClick={toggle}>
        <IconPipette size={15} />{!compact && 'Взять из тренажёра'}
      </button>
      {open && (
        <span className="sim-pick-menu" role="listbox" aria-label="Значения тренажёра">
          {items === null && <span className="muted sim-pick-note">Спрашиваю тренажёр…</span>}
          {items && items.length === 0 && <span className="muted sim-pick-note">Тренажёр не сообщает значений. Введите число вручную.</span>}
          {items?.map((r, i) => (
            <button key={`${r.label}-${i}`} type="button" role="option" aria-selected="false" className="sim-pick-item"
              onClick={() => { onPick(formatScore(r.value)); setOpen(false); }}>
              <span>{r.label}</span><strong>{r.text}</strong>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

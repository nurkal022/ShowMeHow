'use client';
import { Children, useEffect, useRef, useState } from 'react';
import { IconExpand } from '@/components/icons';

/**
 * Формат «Слайды»: один блок на экран. Стрелки, пробел и PageUp/PageDown листают,
 * F — на весь экран. Все слайды остаются в разметке: тренажёр и черновик ответа
 * не сбрасываются, когда учитель листает туда-обратно.
 */
export default function SlideDeck({ children }: { children: React.ReactNode }) {
  const slides = Children.toArray(children).filter(Boolean);
  const [at, setAt] = useState(0);
  const deck = useRef<HTMLDivElement>(null);
  const last = slides.length - 1;
  const go = (n: number) => setAt(Math.max(0, Math.min(last, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable], dialog')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); setAt((v) => Math.min(last, v + 1)); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); setAt((v) => Math.max(0, v - 1)); }
      if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'а') void toggleFull();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  async function toggleFull() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await deck.current?.requestFullscreen();
    } catch { /* браузер не разрешил — не беда */ }
  }

  if (slides.length === 0) return null;
  return (
    <div ref={deck} className="learn-deck">
      <div className="learn-deck-stage">
        {slides.map((slide, i) => (
          <div key={i} className={i === at ? 'learn-slide current' : 'learn-slide'} aria-hidden={i !== at} inert={i !== at ? true : undefined}>{slide}</div>
        ))}
      </div>
      <div className="learn-deck-bar">
        <button type="button" className="btn btn-sm" disabled={at === 0} onClick={() => go(at - 1)}>← Назад</button>
        <div className="learn-deck-dots" role="tablist" aria-label="Слайды">
          {slides.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === at} aria-label={`Слайд ${i + 1}`}
              className={i === at ? 'on' : i < at ? 'seen' : undefined} onClick={() => go(i)} />
          ))}
        </div>
        <span className="learn-deck-count">{`${at + 1} / ${slides.length}`}</span>
        <button type="button" className="icon-btn" aria-label="На весь экран (F)" title="На весь экран (F)" onClick={toggleFull}><IconExpand size={16} /></button>
        <button type="button" className="btn btn-sm btn-primary" disabled={at === last} onClick={() => go(at + 1)}>Дальше →</button>
      </div>
    </div>
  );
}

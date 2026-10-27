'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { startValues, stepCount, tutorPlotSvg, type TutorPlot } from '@/lib/lms/tutor-plot';
import { useLocale, useT } from '@/i18n/client';
import { formatNumber } from '@/i18n/core';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import { speak, type Speech } from '@/lib/lms/speech';
import { IconSound } from '@/components/icons';

/**
 * График из ответа наставника — маленькая доска: ползунки параметров перерисовывают кривые
 * и отметки на месте, а разбор по шагам открывает отметки по одной с подписью шага.
 */
export default function TutorPlotView({ plot }: { plot: TutorPlot }) {
  const locale = useLocale();
  const t = useT(learnLesson);
  const clipId = `tp${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [values, setValues] = useState(() => startValues(plot));
  const total = stepCount(plot);
  const [step, setStep] = useState(1);
  // Только что открытый шаг подсвечен анимацией один раз — не на каждом движении ползунка.
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (!fresh) return;
    const id = setTimeout(() => setFresh(0), 700);
    return () => clearTimeout(id);
  }, [fresh]);
  const go = (next: number) => { setStep(next); setFresh(next); };

  // «Разобрать вслух»: каждый шаг читается, и доска сама листает дальше, когда фраза дочитана.
  const [narrating, setNarrating] = useState(false);
  const speech = useRef<Speech | null>(null);
  useEffect(() => () => speech.current?.stop(), []);
  function narrate(from: number) {
    go(from);
    setNarrating(true);
    speech.current = speak(plot.steps[from - 1] ?? '', locale, () => {
      if (from < total) setTimeout(() => { if (speech.current) narrate(from + 1); }, 450);
      else { speech.current = null; setNarrating(false); }
    });
  }
  function stopNarration() {
    const s = speech.current;
    speech.current = null;
    s?.stop();
    setNarrating(false);
  }
  const manual = (next: number) => { stopNarration(); go(next); };
  const svg = useMemo(() => tutorPlotSvg(plot, values, clipId, total > 1 ? step : Infinity, fresh), [plot, values, clipId, step, total, fresh]);
  return (
    <figure className="tutor-plot">
      <div className="tutor-plot-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      {total > 1 && (
        <div className="tutor-plot-steps">
          <p aria-live="polite"><b>{t('boardStep', { i: step, n: total })}</b> {plot.steps[step - 1]}</p>
          <span className="tutor-plot-nav">
            <button type="button" className={narrating ? 'btn btn-sm btn-ghost tutor-speak-btn on' : 'btn btn-sm btn-ghost tutor-speak-btn'}
              aria-pressed={narrating} title={t(narrating ? 'speakStop' : 'boardNarrate')} aria-label={t(narrating ? 'speakStop' : 'boardNarrate')}
              onClick={() => (narrating ? stopNarration() : narrate(step === total ? 1 : step))}>
              <IconSound size={14} />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={step === 1} onClick={() => manual(step - 1)}>{t('back')}</button>
            <button type="button" className="btn btn-sm" disabled={step === total} onClick={() => manual(step + 1)}>{t('next')}</button>
          </span>
        </div>
      )}
      {plot.params.map((p) => {
        const inc = (p.max - p.min) / 100;
        return (
          <label key={p.name} className="tutor-plot-param">
            <span>{p.label}</span>
            <input type="range" min={p.min} max={p.max} step={inc} value={values[p.name]}
              onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.valueAsNumber }))} />
            <output>{formatNumber(values[p.name], locale, { maximumFractionDigits: 2 })}</output>
          </label>
        );
      })}
    </figure>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Instrument, Level, Style } from '../data';
import { sectionByKey } from '../data';
import { MOTIFS } from './motifs';
import { IdleCore, VIEW_H, VIEW_W } from './primitives';
import { kitPreviewDoc } from './kitPreviewDoc';

export interface StageConfig {
  section: string;
  phenomenon: string;
  mode: '2d' | '3d';
  style: Style;
  instruments: Instrument[];
  parameters: string[];
  /** Слова, которые человек дописал сам: на сцене они становятся выносками. */
  notes: string[];
  level: Level;
}

/** Формулы для превью — узнаваемый закон раздела, а не заглушка. */
const TEX: Record<string, string> = {
  mechanics: 'T = 2\\pi\\sqrt{l/g}',
  optics: 'n_1\\sin\\alpha = n_2\\sin\\beta',
  thermo: 'pV = \\nu RT',
  electro: 'F = k\\dfrac{q_1 q_2}{r^2}',
  molecular: '\\langle E \\rangle = \\tfrac{3}{2}kT',
  astro: 'T^2 \\sim a^3',
  chemistry: 'v = k[A][B]',
  cs: 'O(n\\log n)',
  math: "f'(x_0) = \\lim_{\\Delta x \\to 0}\\dfrac{\\Delta f}{\\Delta x}",
  biology: '\\dfrac{dN}{dt} = rN\\left(1-\\dfrac{N}{K}\\right)',
  earth: '\\varepsilon = 23{,}5^\\circ',
};

const CHART: Record<string, string> = {
  mechanics: 'Энергия', optics: 'Освещённость', thermo: 'Давление',
  electro: 'Напряжённость', molecular: 'Скорости', astro: 'Расстояние',
  chemistry: 'Концентрация', cs: 'Сравнений', math: 'Значение',
  biology: 'Численность', earth: 'Освещённость',
};

/**
 * Сцена стенда: образ выбранного плюс настоящая панель приборов поверх него.
 *
 * Образ — SVG в самой странице, приборы — iframe с китом. Разделение
 * намеренное: образ так рисуется декларативно и плавно перетекает между
 * состояниями, а приборы обязаны быть настоящими, иначе стенд обещает то,
 * чего в результате не будет.
 */
export default function Stage({ config }: { config: StageConfig }) {
  const [t, setT] = useState(0);
  const [knob, setKnob] = useState(0.4);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => kitPreviewDoc(), []);
  const section = sectionByKey(config.section);
  const Motif = section ? MOTIFS[section.motif] : IdleCore;

  // Часы стенда. Движение считается от времени, поэтому один тикер обслуживает
  // любой мотив, а уважение к prefers-reduced-motion решается в одном месте.
  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(1.1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Обработчик живёт один на всё время жизни компонента, поэтому конфигурацию
  // он берёт из ref, а не из замыкания: иначе на первый же запрос кадра ушёл бы
  // набор приборов, каким он был при монтировании.
  const configRef = useRef(config);
  configRef.current = config;

  // Ползунок в панели приборов крутит образ: прибор настоящий, отклик настоящий.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: string; value?: number };
      if (data?.type === 'ready') sync();
      if (data?.type === 'knob' && typeof data.value === 'number') setKnob(data.value);
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const config = configRef.current;
    const section = sectionByKey(config.section);
    frameRef.current?.contentWindow?.postMessage({
      type: 'sync',
      config: {
        title: config.phenomenon || section?.label || 'Симуляция',
        instruments: config.instruments,
        // Ничего не выбрано — показываем то, что генератор выбрал бы сам:
        // панель обязана быть правдоподобной, а не заглушкой со словом «параметр».
        // На пустом стенде тоже нужен хотя бы один ползунок: человек с первого
        // взгляда должен увидеть, что такое прибор, а не пустую панель.
        parameters: (config.parameters.length
          ? config.parameters
          : section?.parameters ?? ['параметр']).slice(0, 4),
        readoutLabel: CHART[config.section] ?? 'Величина',
        chartTitle: CHART[config.section] ?? 'График',
        tex: TEX[config.section],
      },
    }, '*');
  }

  useEffect(sync, [
    config.section, config.phenomenon, config.instruments.join(), config.parameters.join(),
  ]);

  return (
    <div className="stage-shell">
      <div className={config.style === 'data' ? 'stage stage-grid' : 'stage'}>
        <svg className="stage-art" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet" role="img"
          aria-label={`Образ: ${config.phenomenon || section?.label || 'симуляция'}`}>
          <Motif t={t} mode={config.mode} style={config.style} knob={knob} />
        </svg>
        <iframe ref={frameRef} className="stage-kit" srcDoc={doc}
          sandbox="allow-scripts" title="Приборы" tabIndex={-1} />
        {/* Свои слова и подсказка набираются в HTML, а не в SVG: внутри сцены
            текст масштабируется вместе с образом и вырастает вдвое против
            остального интерфейса. Здесь у него настоящий кегль. */}
        {config.notes.length > 0 && (
          <div className="stage-tags">
            {config.notes.slice(0, 3).map((n) => (
              <span key={n} className="stage-tag">{n}</span>
            ))}
          </div>
        )}
        {!section && <p className="stage-hint">выберите тему — предмет превратится в неё</p>}
      </div>
      <p className="stage-note">
        Приборы настоящие — такими они и будут. Образ — набросок: сцену соберёт генератор.
      </p>
    </div>
  );
}

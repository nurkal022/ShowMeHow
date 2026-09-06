/**
 * Общая грамматика образа: палитра, ядро и вспомогательная разметка.
 *
 * Ядро — одна и та же фигура во всех разделах: раздел лишь надстраивает вокруг
 * неё свой аппарат. Поэтому переключение темы читается как превращение одного
 * предмета, а не как подмена картинки. Плоский круг и объёмная сфера рисуются
 * обе и перекрещиваются прозрачностью — переход виден глазом.
 */
import type { Style } from '../data';

/** Палитра совпадает с палитрой настоящих симуляций: превью не должно врать. */
export const INK = {
  bg: '#101318',
  panel: '#1a2029',
  text: '#e8ecf1',
  muted: '#8b95a3',
  accent: '#4f8ff7',
  warm: '#f7a14f',
  grid: '#1e2530',
  line: '#38414f',
};

export interface MotifProps {
  /** Время в секундах от запуска стенда: движение считается, а не анимируется CSS. */
  t: number;
  mode: '2d' | '3d';
  style: Style;
  /**
   * Значение главной крутилки, 0..1. Приходит из ползунка в панели кита, поэтому
   * образ откликается на настоящий прибор, а не на свою имитацию.
   */
  knob: number;
}

export const VIEW_W = 400;
export const VIEW_H = 260;

/**
 * Ядро. Радиус не меняется между 2D и 3D — меняется только объём, и предмет
 * узнаётся как тот же самый.
 */
export function Core({
  x, y, r = 15, mode, style, hue = INK.accent, id = 'core',
}: {
  x: number; y: number; r?: number; mode: '2d' | '3d'; style: Style; hue?: string; id?: string;
}) {
  const flat = mode === '2d' ? 1 : 0;
  const solid = 1 - flat;
  return (
    <g className="mot-core" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <defs>
        <radialGradient id={`${id}-vol`} cx="34%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".92" />
          <stop offset="34%" stopColor={hue} stopOpacity=".98" />
          <stop offset="100%" stopColor="#0a1020" stopOpacity=".96" />
        </radialGradient>
      </defs>

      {/* Объём: тень на плоскости и подсвеченный бок. Появляется в 3D. */}
      <g style={{ opacity: solid }} className="mot-fade">
        <ellipse cx="1" cy={r * 1.5} rx={r * 1.05} ry={r * 0.26} fill="#000" opacity=".38" />
        <circle r={r} fill={`url(#${id}-vol)`} />
        <circle r={r} fill="none" stroke={hue} strokeOpacity=".5" />
      </g>

      {/* Плоскость: заливка без светотени. Появляется в 2D. */}
      <g style={{ opacity: flat }} className="mot-fade">
        {style === 'schematic' ? (
          <>
            <circle r={r} fill={hue} fillOpacity=".18" stroke={hue} strokeWidth="1.6" />
            <circle r={Math.max(1.5, r * 0.12)} fill={hue} />
          </>
        ) : (
          <circle r={r} fill={hue} />
        )}
      </g>
    </g>
  );
}

/** Оси со стрелками — язык схематичной подачи. */
export function Axes({ x, y, w, h, labels }: {
  x: number; y: number; w: number; h: number; labels?: [string, string];
}) {
  return (
    <g stroke={INK.line} strokeWidth="1" fill="none">
      <path d={`M${x} ${y - h} V${y} H${x + w}`} />
      <path d={`M${x + w} ${y} l-5 -3.5 v7 z`} fill={INK.line} stroke="none" />
      <path d={`M${x} ${y - h} l-3.5 5 h7 z`} fill={INK.line} stroke="none" />
      {labels && (
        <>
          <text x={x + w - 4} y={y + 14} fill={INK.muted} fontSize="9" textAnchor="end" stroke="none">{labels[0]}</text>
          <text x={x + 6} y={y - h + 9} fill={INK.muted} fontSize="9" stroke="none">{labels[1]}</text>
        </>
      )}
    </g>
  );
}

/** Пунктирная вспомогательная линия: там, где схеме нужно показать «как было». */
export function Ghost({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={INK.muted} strokeOpacity=".45" strokeWidth="1" strokeDasharray="3 4" />;
}

/**
 * Выноска с текстом — так на сцене появляются слова, которые человек дописал сам.
 * Ведущая линия от точки на сцене к подписи: язык технического чертежа.
 */
/**
 * Слова, дописанные человеком, — тихой строкой поверху кадра.
 *
 * Ведущих линий к точкам сцены здесь намеренно нет: мы не знаем, к какому месту
 * относится «есть трение», и стрелка в произвольную точку соврала бы. Полоса
 * идёт по верху — единственная зона кадра, свободная от панелей кита.
 */
export function NoteChips({ notes }: { notes: string[] }) {
  const gap = 8;
  const widths = notes.map((n) => n.length * 5.3 + 20);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (notes.length - 1);
  let x = VIEW_W / 2 - total / 2;
  return (
    <g className="mot-tag">
      {notes.map((n, i) => {
        const at = x;
        x += widths[i] + gap;
        return (
          <g key={n}>
            <rect x={at} y={22} width={widths[i]} height="19" rx="9.5"
              fill={INK.warm} fillOpacity=".13" stroke={INK.warm} strokeOpacity=".4" />
            <text x={at + 9} y={35.5} fill={INK.warm} fontSize="10">+ {n}</text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Покой: тема не выбрана — на сцене одно ядро. С него всё и начинается, и
 * первое, что можно сделать, — нажать 3D и увидеть, как круг обретает объём.
 */
export function IdleCore({ t, mode, style }: MotifProps) {
  const y = VIEW_H / 2 - 8 + Math.sin(t * 1.2) * 5;
  return (
    <g>
      <circle cx={VIEW_W / 2} cy={y} r={54} fill={INK.accent} fillOpacity=".05" />
      <Core x={VIEW_W / 2} y={y} r={26} mode={mode} style={style} />
      <text x={VIEW_W / 2} y={VIEW_H - 34} fill={INK.muted} fontSize="11" textAnchor="middle">
        выберите тему — предмет превратится в неё
      </text>
    </g>
  );
}

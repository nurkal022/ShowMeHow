/**
 * Мотивы-структуры: разделы, где на сцене не предмет, а данные — массив,
 * функция, кривая роста. Здесь ядро играет указатель: элемент, который
 * алгоритм сравнивает сейчас, или точку, в которой берут производную.
 */
import { Axes, Core, Ghost, INK, SAFE_R, type MotifProps } from './primitives';

/* ----------------------------- информатика ------------------------------ */

/** Высоты столбиков после k проходов пузырьковой сортировки. */
function bubbleState(base: number[], swaps: number): number[] {
  const a = base.slice();
  let done = 0;
  for (let pass = 0; pass < a.length && done < swaps; pass++) {
    for (let i = 0; i < a.length - 1 - pass && done < swaps; i++) {
      if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; done++; }
    }
  }
  return a;
}

const BARS = [6, 2, 8, 1, 5, 9, 3, 7, 4];

export function ArrayScan({ t, mode, style, knob }: MotifProps) {
  const n = BARS.length;
  const x0 = 66, w = 19, gap = 4, base = 196;
  // Шаг — дискретный: это и есть режим «пошагово», ради которого он в разделе.
  const step = Math.floor(t * (0.9 + knob * 2.2));
  const bars = bubbleState(BARS, step);
  const cursor = step % (n - 1);
  const cursorX = x0 + cursor * (w + gap) + w + gap / 2;
  const pairTop = base - (12 + Math.max(bars[cursor], bars[cursor + 1]) * 15);
  const cursorY = Math.max(42, pairTop - 28);
  // Корпус экрана вокруг сцены: информатика — единственный раздел, где предмет
  // не физический, и рамка сразу говорит, что смотрим на работу программы.
  const sx = x0 - 18, sw = Math.min(n * (w + gap) - gap + 36, SAFE_R - (x0 - 18));
  const sy = 24, sh = base - sy + 30;
  return (
    <g>
      <rect x={sx} y={sy} width={sw} height={sh} rx="12"
        fill="#0b0e13" stroke={INK.line} strokeWidth="2.5" />
      <rect x={sx + 8} y={sy + 8} width={sw - 16} height={sh - 16} rx="7"
        fill="none" stroke={INK.line} strokeOpacity=".5" />
      <path d={`M${sx + sw / 2 - 22} ${sy + sh + 10} h44`} stroke={INK.line}
        strokeWidth="4" strokeLinecap="round" />
      <path d={`M${sx + sw / 2} ${sy + sh} v10`} stroke={INK.line} strokeWidth="6" />
      {style === 'data' && <Ghost d={`M${x0 - 8} ${base} H${x0 + n * (w + gap)}`} />}
      {bars.map((v, i) => {
        const h = 12 + v * 15;
        const x = x0 + i * (w + gap);
        const active = i === cursor || i === cursor + 1;
        return (
          <g key={i}>
            <rect x={x} y={base - h} width={w} height={h} rx="4"
              fill={active ? INK.accent : INK.text}
              fillOpacity={active ? 0.85 : 0.24} className="mot-fade" />
            {style === 'schematic' && (
              <text x={x + w / 2} y={base + 13} fill={INK.muted} fontSize="9" textAnchor="middle">{v}</text>
            )}
          </g>
        );
      })}
      <path d={`M${x0 - 8} ${base} H${x0 + n * (w + gap) - gap + 8}`} stroke={INK.line} strokeWidth="2" />
      {/* Ядро — указатель алгоритма. Держится над самой парой, которую сравнивают,
          и поднимается ровно настолько, чтобы не заходить на столбики. */}
      <Core x={cursorX} y={cursorY} r={10} mode={mode} style={style} />
      <path d={`M${cursorX} ${cursorY + 14} l-5 -7 h10 z`} fill={INK.accent} fillOpacity=".8" />
      <text x={cursorX} y={cursorY - 18} fill={INK.muted} fontSize="10" textAnchor="middle">
        шаг {step % 40}
      </text>
    </g>
  );
}

/* ------------------------------ математика ------------------------------ */

export function Curve({ t, mode, style, knob }: MotifProps) {
  const ox = 48, oy = 206, w = 246, h = 158;
  const k = 0.6 + knob * 1.4;
  // y = sin(kx), нормированная в окно: касательная в точке — это и есть производная.
  const fy = (u: number) => Math.sin(u * k * Math.PI * 2) * 0.42 + 0.5;
  const pts = Array.from({ length: 121 }, (_, i) => {
    const u = i / 120;
    return `${ox + u * w} ${oy - fy(u) * h}`;
  });
  const u0 = (t * 0.12) % 1;
  const px = ox + u0 * w;
  const py = oy - fy(u0) * h;
  const d = (fy(u0 + 0.001) - fy(u0 - 0.001)) / 0.002;
  const slope = (-d * h) / w;
  const seg = 52;
  const dx = seg / Math.sqrt(1 + slope * slope);
  return (
    <g>
      <Axes x={ox} y={oy} w={w + 14} h={h + 16} labels={['x', 'y']} />
      <path d={`M${pts.join('L')}`} fill="none" stroke={INK.accent} strokeOpacity=".55" strokeWidth="2" />
      <path d={`M${px - dx} ${py - slope * dx} L${px + dx} ${py + slope * dx}`}
        stroke={INK.warm} strokeWidth="2" strokeLinecap="round" />
      {style === 'schematic' && (
        <>
          <Ghost d={`M${px} ${py} V${oy}`} />
          <text x={px + 6} y={oy - 6} fill={INK.muted} fontSize="10">x₀</text>
        </>
      )}
      <Core x={px} y={py} r={9} mode={mode} style={style} hue={INK.warm} id="core-curve" />
    </g>
  );
}

/* ------------------------------- биология ------------------------------- */

export function Population({ t, mode, style, knob }: MotifProps) {
  const ox = 52, oy = 210, w = 268, h = 162;
  const rate = 0.6 + knob * 2.2;
  // Логистический рост: выходит на ёмкость среды, а не растёт бесконечно.
  const logistic = (u: number) => 1 / (1 + Math.exp(-(u * 12 - 6) * rate));
  // Цикл: шесть секунд рост, четыре — стояние на полке. Без паузы кадр половину
  // времени показывал бы пустое поле сразу после сброса.
  const cycle = (t * 0.1) % 1;
  const front = Math.min(1, cycle / 0.6);
  const curve = (to: number) => Array.from({ length: 81 }, (_, i) => {
    const u = (i / 80) * to;
    return `${ox + u * w} ${oy - logistic(u) * h}`;
  }).join('L');
  const fy = oy - logistic(front) * h;
  const fx = ox + front * w;
  const alive = Math.round(logistic(front) * 24);
  return (
    <g>
      <Axes x={ox} y={oy} w={w + 16} h={h + 18} labels={['t', 'N']} />
      <Ghost d={`M${ox} ${oy - h} H${ox + w + 8}`} />
      {/* Под линией, а не над ней: сверху подпись стояла на пути точки, которая
          к концу роста выходит на ёмкость и налезала на текст. */}
      <text x={ox + w - 4} y={oy - h + 12} fill={INK.muted} fontSize="9" textAnchor="end">ёмкость среды</text>
      {/* Бледный след всей кривой: поле не пустует, пока голова ещё в начале. */}
      <path d={`M${curve(1)}`} fill="none" stroke={INK.accent} strokeOpacity=".18" strokeWidth="1.6" />
      <path d={`M${curve(front)}`} fill="none" stroke={INK.accent} strokeWidth="2.4" strokeLinecap="round" />
      {/* Колония над кривой: особей ровно столько, сколько показывает график. */}
      {Array.from({ length: alive }, (_, i) => (
        <circle key={i} cx={ox + 22 + (i % 6) * 15} cy={oy - h + 24 + Math.floor(i / 6) * 15}
          r="4.5" fill={INK.accent} fillOpacity=".4" className="mot-fade" />
      ))}
      <Core x={fx} y={fy} r={9} mode={mode} style={style} />
    </g>
  );
}

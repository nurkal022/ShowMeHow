/**
 * Мотивы-аппараты: разделы, где на сцене стоят предметы — маятник, линза,
 * цилиндр, заряды, сосуд, орбита, колба, планета.
 *
 * Положения считаются от времени формулами, а не CSS-анимацией: маятник с
 * длинной нитью действительно качается медленнее, и ползунок это показывает.
 */
import { Core, Ghost, INK, SAFE_R, type MotifProps } from './primitives';

/** Детерминированный «шум»: одинаковая картинка при каждом рендере. */
function noise(i: number, k: number): number {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function mix(a: string, b: string, t: number): string {
  const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/* ------------------------------- механика ------------------------------- */

export function Pendulum({ t, mode, style, knob }: MotifProps) {
  const px = 178, py = 40;
  const len = 118 + knob * 62;
  // Период настоящий: T = 2π√(L/g). g подобрано так, чтобы качание читалось глазом.
  const period = 2 * Math.PI * Math.sqrt(len / 760);
  const amp = 0.44;
  const a = amp * Math.cos((2 * Math.PI * t) / period);
  const bx = px + Math.sin(a) * len;
  const by = py + Math.cos(a) * len;
  const arc = (sign: number) => {
    const s = sign * amp;
    return `${px + Math.sin(s) * len} ${py + Math.cos(s) * len}`;
  };
  return (
    <g>
      {style === 'schematic' && (
        <>
          <Ghost d={`M${px} ${py} V${py + len + 18}`} />
          <Ghost d={`M${arc(-1)} A${len} ${len} 0 0 1 ${arc(1)}`} />
          <text x={px + 8} y={py + 34} fill={INK.muted} fontSize="10">φ</text>
        </>
      )}
      <path d={`M${px - 34} ${py} h68`} stroke={INK.line} strokeWidth="4" strokeLinecap="round" />
      <path d={`M${px} ${py} L${bx} ${by}`} stroke={INK.text} strokeOpacity=".55" strokeWidth="1.4" />
      <circle cx={px} cy={py} r="3" fill={INK.line} />
      <Core x={bx} y={by} r={16 + knob * 5} mode={mode} style={style} />
    </g>
  );
}

/* -------------------------------- оптика -------------------------------- */

export function Beam({ t, mode, style, knob }: MotifProps) {
  const sx = 34, sy = 130;
  const lens = 178;
  const focus = lens + 44 + knob * 62;
  const offsets = [-36, 0, 36];
  const dash = -((t * 34) % 16);
  return (
    <g>
      {style === 'schematic' && <Ghost d={`M18 ${sy} H${SAFE_R}`} />}
      {offsets.map((o) => (
        <g key={o}>
          <path d={`M${sx} ${sy} L${lens} ${sy + o}`} stroke={INK.accent} strokeOpacity=".75" strokeWidth="1.5" />
          <path d={`M${lens} ${sy + o} L${focus} ${sy}`} stroke={INK.accent} strokeOpacity=".75" strokeWidth="1.5" />
          {/* Бегущий пунктир: свет идёт, а не стоит. */}
          <path d={`M${sx} ${sy} L${lens} ${sy + o} L${focus} ${sy}`} fill="none"
            stroke="#fff" strokeOpacity=".55" strokeWidth="1.5"
            strokeDasharray="3 13" strokeDashoffset={dash} />
        </g>
      ))}
      <ellipse cx={lens} cy={sy} rx="9" ry="54" fill={INK.text} fillOpacity=".1"
        stroke={INK.text} strokeOpacity=".45" />
      <circle cx={focus} cy={sy} r="3.5" fill={INK.warm} />
      <text x={focus} y={sy + 20} fill={INK.warm} fontSize="10" textAnchor="middle">F</text>
      <path d={`M${SAFE_R} 52 V208`} stroke={INK.line} strokeWidth="3" strokeLinecap="round" />
      <Core x={sx} y={sy} r={14} mode={mode} style={style} />
    </g>
  );
}

/* ---------------------------- термодинамика ----------------------------- */

export function Piston({ t, mode, style, knob }: MotifProps) {
  const x0 = 52, x1 = 254, y0 = 62, y1 = 206;
  const stroke = 40 + 38 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 2.8));
  const head = x1 - stroke;

  // Температура — это скорость частиц. Заливкой её не показать, поэтому газ
  // рисуется частицами: они отскакивают от стенок и от самого поршня.
  const gas = Array.from({ length: 22 }, (_, i) => {
    const span = head - x0 - 16;
    const speed = 26 + knob * 90;
    const px = x0 + 8 + ((noise(i, 1) * span + t * speed * (0.5 + noise(i, 3))) % span);
    const py = y0 + 10 + ((noise(i, 2) * (y1 - y0 - 20) + t * speed * (0.4 + noise(i, 4))) % (y1 - y0 - 20));
    return { px, py, r: 2 + noise(i, 5) * 1.6 };
  });
  return (
    <g>
      {/* Цилиндр */}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx="10"
        fill="#0b0e13" stroke={INK.line} strokeWidth="2.5" />
      <rect x={x0 + 3} y={y0 + 3} width={head - x0 - 3} height={y1 - y0 - 6} rx="8"
        fill={INK.warm} fillOpacity={0.03 + knob * 0.09} className="mot-fade" />
      {gas.map((g, i) => (
        <circle key={i} cx={g.px} cy={g.py} r={g.r} fill={INK.accent} fillOpacity=".85" />
      ))}
      {/* Поршень и шток */}
      <rect x={head} y={y0 + 3} width="13" height={y1 - y0 - 6} rx="4" fill={INK.line} />
      <rect x={head + 2} y={y0 + 3} width="4" height={y1 - y0 - 6} fill={INK.text} fillOpacity=".22" />
      <path d={`M${head + 13} ${(y0 + y1) / 2} H${SAFE_R}`}
        stroke={INK.line} strokeWidth="6" strokeLinecap="round" />
      {/* Нагрев снизу: волны тем быстрее, чем выше температура. */}
      {[0, 1, 2, 3].map((i) => {
        const rise = ((t * (24 + knob * 46) + i * 22) % 88);
        const wx = x0 + 30 + i * 46;
        return (
          <path key={i} d={`M${wx} ${y1 + 8 + rise * 0.34} q6 -8 0 -16 q-6 -8 0 -16`} fill="none"
            stroke={INK.warm} strokeWidth="1.6" strokeLinecap="round"
            opacity={(1 - rise / 88) * (0.25 + knob * 0.75)} />
        );
      })}
      <path d={`M${x0 + 14} ${y1 + 16} H${x1 - 14}`} stroke={INK.warm} strokeOpacity=".5"
        strokeWidth="2" strokeLinecap="round" />
      {style === 'schematic' && (
        <>
          <Ghost d={`M${head} ${y0 - 10} V${y1 + 10}`} />
          <text x={(x0 + head) / 2} y={y0 - 14} fill={INK.muted} fontSize="10" textAnchor="middle">V</text>
        </>
      )}
      <Core x={x0 + 34} y={(y0 + y1) / 2} r={13} mode={mode} style={style} />
    </g>
  );
}

/* ----------------------------- электричество ---------------------------- */

export function Field({ t, mode, style, knob }: MotifProps) {
  const ax = 146, bx = 258, y = 130;
  const bows = [18, 46, 80, -18, -46, -80];
  return (
    <g>
      {bows.map((b, i) => {
        const d = `M${ax} ${y} C${ax + 30} ${y + b} ${bx - 30} ${y + b} ${bx} ${y}`;
        // Точка бежит по линии поля: направление видно без стрелок.
        const phase = ((t * (0.3 + knob * 0.5) + i * 0.17) % 1);
        return (
          <g key={b}>
            <path d={d} fill="none" stroke={INK.accent} strokeOpacity=".4" strokeWidth="1.2" />
            <path d={d} fill="none" stroke={INK.accent} strokeWidth="2.4" strokeLinecap="round"
              strokeDasharray="3 400" pathLength={1} strokeDashoffset={-phase} opacity=".9" />
          </g>
        );
      })}
      <path d={`M${ax} ${y}H${bx}`} stroke={INK.accent} strokeOpacity=".4" strokeWidth="1.2" />
      <Core x={ax} y={y} r={15} mode={mode} style={style} />
      <text x={ax} y={y + 4.5} fill="#fff" fontSize="15" textAnchor="middle" fontWeight="600">+</text>
      <Core x={bx} y={y} r={15} mode={mode} style={style} hue={INK.warm} id="core-b" />
      <text x={bx} y={y + 4} fill="#fff" fontSize="17" textAnchor="middle" fontWeight="600">−</text>
      {style === 'schematic' && (
        <text x={(ax + bx) / 2} y={y - 96} fill={INK.muted} fontSize="10" textAnchor="middle">E</text>
      )}
    </g>
  );
}

/* -------------------------- молекулярная физика ------------------------- */

export function Particles({ t, mode, style, knob }: MotifProps) {
  const x0 = 44, x1 = 292, y0 = 56, y1 = 212;
  const speed = 12 + knob * 46;
  const dot = (i: number, time: number) => {
    // Отражения от стенок считаем «пилой»: частица честно отскакивает.
    const w = x1 - x0 - 12, h = y1 - y0 - 12;
    const sx = (noise(i, 1) - 0.5) * 2 * speed;
    const sy = (noise(i, 2) - 0.5) * 2 * speed;
    const bounce = (p: number, size: number) => {
      const m = ((p % (2 * size)) + 2 * size) % (2 * size);
      return m > size ? 2 * size - m : m;
    };
    return {
      x: x0 + 6 + bounce(noise(i, 3) * w + sx * time, w),
      y: y0 + 6 + bounce(noise(i, 4) * h + sy * time, h),
    };
  };
  const tracked = dot(0, t);
  const trail = Array.from({ length: 14 }, (_, k) => dot(0, t - k * 0.08));
  return (
    <g>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx="10"
        fill={INK.text} fillOpacity=".03" stroke={INK.line} strokeWidth="2" />
      {Array.from({ length: 30 }, (_, i) => {
        const p = dot(i + 1, t);
        return <circle key={i} cx={p.x} cy={p.y} r="3" fill={INK.text} fillOpacity=".4" />;
      })}
      <path d={`M${trail.map((p) => `${p.x} ${p.y}`).join('L')}`} fill="none"
        stroke={INK.accent} strokeOpacity=".45" strokeWidth="1.4" strokeLinecap="round" />
      <Core x={tracked.x} y={tracked.y} r={9} mode={mode} style={style} />
      {style === 'schematic' && (
        <text x={x0 + 8} y={y0 - 8} fill={INK.muted} fontSize="10">сосуд</text>
      )}
    </g>
  );
}

/* ------------------------------ астрономия ------------------------------ */

export function Orbit({ t, mode, style, knob }: MotifProps) {
  const cx = 178, cy = 132;
  const a = 104, b = 68;
  const period = 5.2 - knob * 3.2;
  const th = (2 * Math.PI * t) / period;
  // В 3D орбиту кладём под углом: плоскость видно, а не смотрим на неё в упор.
  const tilt = mode === '3d' ? 0.52 : 1;
  const px = cx - 26 + Math.cos(th) * a;
  const py = cy + Math.sin(th) * b * tilt;
  const arcPts = Array.from({ length: 26 }, (_, k) => {
    const q = th - (k / 25) * 1.5;
    return `${cx - 26 + Math.cos(q) * a} ${cy + Math.sin(q) * b * tilt}`;
  });
  return (
    <g>
      <ellipse cx={cx - 26} cy={cy} rx={a} ry={b * tilt} fill="none"
        stroke={INK.line} strokeWidth="1" strokeDasharray={style === 'schematic' ? '4 5' : undefined}
        className="mot-fade" />
      <path d={`M${arcPts.join('L')}`} fill="none" stroke={INK.accent} strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="26" fill={INK.warm} fillOpacity=".14" />
      <circle cx={cx} cy={cy} r="15" fill={INK.warm} />
      <circle cx={cx} cy={cy} r="15" fill="none" stroke={INK.warm} strokeOpacity=".45" strokeWidth="6" />
      <Core x={px} y={py} r={11} mode={mode} style={style} />
      {style === 'schematic' && (
        <>
          <Ghost d={`M${cx} ${cy} L${px} ${py}`} />
          <text x={(cx + px) / 2} y={(cy + py) / 2 - 6} fill={INK.muted} fontSize="10">r</text>
        </>
      )}
    </g>
  );
}

/* --------------------------------- химия -------------------------------- */

export function Flask({ t, mode, style, knob }: MotifProps) {
  const cx = 200, top = 62, neckW = 15, bodyW = 74, bottom = 206;
  const shoulder = 116;
  const level = 150 - knob * 22;
  const body = `M${cx - neckW} ${top} V${shoulder} L${cx - bodyW} ${bottom - 12}
    Q${cx - bodyW} ${bottom} ${cx - bodyW + 12} ${bottom} H${cx + bodyW - 12}
    Q${cx + bodyW} ${bottom} ${cx + bodyW} ${bottom - 12} L${cx + neckW} ${shoulder} V${top}`;
  const halfW = (y: number) =>
    (y <= shoulder ? neckW : neckW + ((bodyW - neckW) * (y - shoulder)) / (bottom - 12 - shoulder));
  const wave = (y: number) => {
    const w = halfW(y);
    const pts = Array.from({ length: 17 }, (_, i) => {
      const x = cx - w + (2 * w * i) / 16;
      return `${x} ${y + Math.sin(t * 2.4 + i * 0.6) * 1.6}`;
    });
    return `M${pts.join('L')}`;
  };
  return (
    <g>
      <clipPath id="flask-clip"><path d={`${body} Z`} /></clipPath>
      <g clipPath="url(#flask-clip)">
        <rect x={cx - bodyW} y={level} width={bodyW * 2} height={bottom - level}
          fill={mix('#2f6fd0', '#37b0a6', knob)} fillOpacity=".42" className="mot-fade" />
        {/* Пузырьки идут от точки реакции — это и есть ядро. */}
        {Array.from({ length: 9 }, (_, i) => {
          const span = bottom - 24 - level;
          const rise = ((t * (14 + knob * 40) + i * 21) % span);
          const y = bottom - 24 - rise;
          const bx = cx + (noise(i, 7) - 0.5) * halfW(y) * 1.3;
          return <circle key={i} cx={bx} cy={y} r={1.6 + noise(i, 8) * 2}
            fill={INK.text} fillOpacity={0.5 * (1 - rise / span)} />;
        })}
        <path d={wave(level)} fill="none" stroke={mix('#5b9bf0', '#4fd6c8', knob)} strokeWidth="2" />
      </g>
      <path d={body} fill="none" stroke={INK.text} strokeOpacity=".55" strokeWidth="2" strokeLinejoin="round" />
      <path d={`M${cx - neckW - 4} ${top} h${neckW * 2 + 8}`} stroke={INK.text} strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
      <Core x={cx} y={bottom - 26} r={11} mode={mode} style={style} hue={mix('#5b9bf0', '#4fd6c8', knob)} />
      {style === 'schematic' && (
        <>
          {/* Выноска цепляется за саму поверхность жидкости, а не висит рядом
              с колбой: иначе она читается как отдельный обрывок разметки. */}
          <Ghost d={`M${cx - halfW(level) - 4} ${level} h-18`} />
          <text x={cx - halfW(level) - 26} y={level + 3.5} fill={INK.muted}
            fontSize="10" textAnchor="end">V</text>
        </>
      )}
    </g>
  );
}

/* ---------------------------- науки о Земле ----------------------------- */

export function Globe({ t, mode, style, knob }: MotifProps) {
  const ex = 236, ey = 138, r = 40;
  const tilt = 23.5 + knob * 14;
  const spin = (t * 26) % 360;
  return (
    <g>
      {/* Солнце и его лучи слева: сторона освещения задаёт всю сцену. */}
      <circle cx="66" cy="98" r="24" fill={INK.warm} fillOpacity=".18" />
      <circle cx="66" cy="98" r="15" fill={INK.warm} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <path key={i} d={`M${66 + Math.cos(a) * 21} ${98 + Math.sin(a) * 21}
          l${Math.cos(a) * 7} ${Math.sin(a) * 7}`} stroke={INK.warm} strokeWidth="1.6" strokeLinecap="round" />;
      })}
      <Ghost d={`M92 104 H${ex - r - 10}`} />
      <g style={{ transform: `translate(${ex}px, ${ey}px) rotate(${-tilt}deg)` }} className="mot-fade">
        <Core x={0} y={0} r={r} mode={mode} style={style} hue="#3f7fbf" id="core-globe" />
        {/* Меридиан: планета вращается, ночная сторона остаётся слева. */}
        <ellipse cx="0" cy="0" rx={Math.abs(Math.cos((spin * Math.PI) / 180)) * r} ry={r}
          fill="none" stroke={INK.text} strokeOpacity=".28" strokeWidth="1" />
        <path d={`M0 ${-r - 14} V${r + 14}`} stroke={INK.text} strokeOpacity=".4"
          strokeWidth="1" strokeDasharray="4 4" />
        <path d={`M${-r} 0 H${r}`} stroke={INK.text} strokeOpacity=".22" strokeWidth="1" />
      </g>
      {style === 'schematic' && (
        <text x={ex + r + 12} y={ey - r} fill={INK.muted} fontSize="10">{Math.round(tilt)}°</text>
      )}
    </g>
  );
}

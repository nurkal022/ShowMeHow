'use client';
import { useEffect, useRef } from 'react';
import { TESSERACT_EDGES, TESSERACT_POSE, TESSERACT_REST, edgeKind, projectTesseract } from '@/lib/tesseract';

/**
 * Марка Tesseract: тессеракт, который крутится в 4D, пока курсор над ссылкой
 * (или блоком .brand), и плавно возвращается в исходную позу, когда курсор ушёл.
 * tone="glow" — цвета тёмного лендинга; "current" — линии в currentColor для светлых шапок.
 */
export default function TesseractMark({ size = 20, tone = 'current' }: { size?: number; tone?: 'current' | 'glow' }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current; if (!svg) return;
    const host = svg.closest('a, button, .brand, .cab-brand') ?? svg;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const T = Math.PI * 2;
    const s = { ...TESSERACT_POSE, sp: 0, sc: 1, hov: false, last: 0 };
    let raf = 0;

    const draw = () => {
      const P = projectTesseract(s.a, s.b, s.c, s.sc);
      svg.querySelectorAll('line').forEach((l, n) => {
        const [i, j] = TESSERACT_EDGES[n];
        l.setAttribute('x1', P[i][0].toFixed(3)); l.setAttribute('y1', P[i][1].toFixed(3));
        l.setAttribute('x2', P[j][0].toFixed(3)); l.setAttribute('y2', P[j][1].toFixed(3));
      });
    };
    const home = (v: number, r: number) => v + (r + Math.round((v - r) / T) * T - v) * 0.09;
    const off = (v: number, r: number) => Math.abs(v - (r + Math.round((v - r) / T) * T));
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - (s.last || now)) / 1000); s.last = now;
      s.sc += ((s.hov ? 1.1 : 1) - s.sc) * 0.1;
      if (s.hov) { s.sp += (1.6 - s.sp) * 0.08; s.a += dt * 0.9 * s.sp; s.b += dt * 0.55 * s.sp; s.c += dt * 0.2 * s.sp; }
      else {
        s.sp = 0;
        s.a = home(s.a, TESSERACT_POSE.a); s.b = home(s.b, TESSERACT_POSE.b); s.c = home(s.c, TESSERACT_POSE.c);
        if (off(s.a, TESSERACT_POSE.a) + off(s.b, TESSERACT_POSE.b) + off(s.c, TESSERACT_POSE.c) + Math.abs(s.sc - 1) < 1e-4) {
          s.a = TESSERACT_POSE.a; s.b = TESSERACT_POSE.b; s.c = TESSERACT_POSE.c; s.sc = 1; draw(); raf = 0; s.last = 0; return;
        }
      }
      draw();
      raf = requestAnimationFrame(frame);
    };
    const enter = () => { s.hov = true; svg.dataset.hov = '1'; if (!reduce && !raf) raf = requestAnimationFrame(frame); };
    const leave = () => { s.hov = false; delete svg.dataset.hov; };
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);
    return () => { cancelAnimationFrame(raf); host.removeEventListener('pointerenter', enter); host.removeEventListener('pointerleave', leave); };
  }, []);

  return (
    <svg ref={ref} className={`tmark tmark-${tone}`} width={size} height={size} viewBox="-1.2 -1.2 2.4 2.4" aria-hidden="true" focusable="false">
      {TESSERACT_EDGES.map((e, n) => {
        const [i, j] = e, kind = edgeKind(e);
        return <line key={n} className={`tmark-${kind}`} strokeLinecap="round"
          x1={TESSERACT_REST[i][0].toFixed(3)} y1={TESSERACT_REST[i][1].toFixed(3)}
          x2={TESSERACT_REST[j][0].toFixed(3)} y2={TESSERACT_REST[j][1].toFixed(3)} />;
      })}
    </svg>
  );
}

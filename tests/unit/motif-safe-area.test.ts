import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MOTIFS } from '@/components/constructor/stage/motifs';
import { SAFE_R, VIEW_H, VIEW_W } from '@/components/constructor/stage/primitives';
import { SECTIONS } from '@/components/constructor/data';
import type { Motif } from '@/components/constructor/data';

/**
 * Правее SAFE_R докируется панель приборов кита. Всё, что мотив там нарисует,
 * окажется под ней — так уже случилось с корпусом монитора в информатике, и
 * заметить это можно было, только зайдя именно в этот раздел и посмотрев глазами.
 *
 * Проверяются прямоугольники, круги и эллипсы: у них край считается однозначно.
 * Пути (лучи, линии поля, шток поршня) намеренно не проверяются — их хвосты
 * заходят под панель осознанно, ровно как в настоящей симуляции.
 */
interface Box { right: number; bottom: number; tag: string }

function boxes(markup: string): Box[] {
  const out: Box[] = [];
  const num = (s: string | undefined) => (s === undefined ? 0 : Number(s));

  for (const m of markup.matchAll(/<rect\b([^>]*)>/g)) {
    const a = m[1];
    const x = num(/\bx="([-\d.]+)"/.exec(a)?.[1]);
    const y = num(/\by="([-\d.]+)"/.exec(a)?.[1]);
    const w = num(/\bwidth="([-\d.]+)"/.exec(a)?.[1]);
    const h = num(/\bheight="([-\d.]+)"/.exec(a)?.[1]);
    out.push({ right: x + w, bottom: y + h, tag: 'rect' });
  }
  for (const m of markup.matchAll(/<(circle|ellipse)\b([^>]*)>/g)) {
    const a = m[2];
    const cx = num(/\bcx="([-\d.]+)"/.exec(a)?.[1]);
    const cy = num(/\bcy="([-\d.]+)"/.exec(a)?.[1]);
    const rx = num(/\b(?:r|rx)="([-\d.]+)"/.exec(a)?.[1]);
    const ry = num(/\b(?:r|ry)="([-\d.]+)"/.exec(a)?.[1]);
    out.push({ right: cx + rx, bottom: cy + ry, tag: m[1] });
  }
  return out;
}

function draw(motif: Motif, t: number, knob: number, mode: '2d' | '3d'): Box[] {
  const markup = renderToStaticMarkup(
    createElement('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}` },
      createElement(MOTIFS[motif], { t, knob, mode, style: 'schematic' as const })),
  );
  return boxes(markup);
}

/** Несколько моментов времени: мотивы движутся, и край съезжает вместе с ними. */
const MOMENTS = [0, 0.7, 1.9, 4.3, 9.1];

describe('мотивы не залезают под панель приборов', () => {
  for (const section of SECTIONS) {
    it(`${section.label} держится левее безопасной границы`, () => {
      for (const t of MOMENTS) {
        for (const knob of [0, 0.5, 1]) {
          for (const b of draw(section.motif, t, knob, '2d')) {
            expect(b.right, `${section.key}: ${b.tag} при t=${t}, knob=${knob}`)
              .toBeLessThanOrEqual(SAFE_R);
          }
        }
      }
    });
  }
});

describe('мотивы умещаются по высоте кадра', () => {
  for (const section of SECTIONS) {
    it(`${section.label} не вылезает за нижний край`, () => {
      for (const t of MOMENTS) {
        for (const b of draw(section.motif, t, 1, '3d')) {
          expect(b.bottom, `${section.key}: ${b.tag} при t=${t}`).toBeLessThanOrEqual(VIEW_H);
        }
      }
    });
  }
});

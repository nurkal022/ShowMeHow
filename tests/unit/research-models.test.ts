import { describe, expect, it } from 'vitest';
import { buildModel, MAX_SNAPSHOTS, modelParams, phaseAxes, renderDoc, snapshotLabel, type ModelDoc } from '@/lib/research/doc';
import { GALLERY, GALLERY_FIELDS, galleryDoc, searchGallery } from '@/lib/research/model-gallery';
import { directionField, paddedExtent, planarField, trajectoryArrows } from '@/lib/research/phase';
import { parseEquation } from '@/lib/research/ode';
import { renderPlot } from '@/lib/research/plot';

const finiteCurves = (doc: ModelDoc) => {
  const b = buildModel(doc);
  const pts = b.current.flatMap((c) => c.points);
  return { b, pts, finite: pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).length };
};

describe('галерея моделей', () => {
  it('ключи уникальны, области из списка, шаблон проставлен', () => {
    expect(new Set(GALLERY.map((m) => m.key)).size).toBe(GALLERY.length);
    expect(GALLERY.length).toBeGreaterThanOrEqual(12);
    GALLERY.forEach((m) => {
      expect(GALLERY_FIELDS).toContain(m.field);
      expect(m.doc.template).toBe(m.key);
      expect(m.description.length).toBeGreaterThan(20);
    });
  });

  it.each(GALLERY.map((m) => [m.key, m] as const))('%s решается без срыва во всех видах', (_key, m) => {
    // Параметры в документе совпадают с тем, что находит разбор формул: ни лишних, ни забытых.
    const { params, error } = modelParams(m.doc);
    expect(error).toBeNull();
    expect(params.map((p) => p.name).sort()).toEqual(m.doc.params.map((p) => p.name).sort());
    m.doc.params.forEach((p) => {
      expect(p.min).toBeLessThan(p.max);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    });
    for (const view of ['time', 'phase'] as const) {
      const { b, pts, finite } = finiteCurves({ ...m.doc, view });
      expect(b.errors).toEqual([]);
      expect(pts.length).toBeGreaterThan(100);
      expect(finite).toBe(pts.length);
      expect(pts.every((p) => Math.abs(p.y) < 1e7)).toBe(true);
    }
    // Крайние значения параметров тоже не должны ломать решение.
    for (const edge of ['min', 'max'] as const) {
      const values = Object.fromEntries(m.doc.params.map((p) => [p.name, p[edge]]));
      const b = buildModel(m.doc, values);
      expect(b.errors.filter((e) => !/бесконечность/.test(e))).toEqual([]);
    }
    expect(renderDoc('model', m.doc, { width: 300, height: 180, clipId: `g-${m.key}` })).toContain('<path');
  });

  it('у систем из двух и более уравнений заданы оси фазового портрета', () => {
    GALLERY.filter((m) => m.doc.mode === 'ode' && m.doc.lines.length >= 2).forEach((m) => {
      expect(phaseAxes(m.doc)).toEqual([m.doc.phaseX, m.doc.phaseY]);
    });
  });

  it('поиск и фильтр по области', () => {
    expect(searchGallery('лоренц', null).map((m) => m.key)).toEqual(['lorenz']);
    expect(searchGallery('', 'Эпидемиология').map((m) => m.key)).toEqual(['sir']);
    expect(searchGallery('маятник', 'Химия')).toEqual([]);
  });

  it('копия документа не делит объекты с галереей', () => {
    const d = galleryDoc(GALLERY[0]);
    d.params[0].value = 999;
    expect(GALLERY[0].doc.params[0].value).not.toBe(999);
  });
});

describe('фазовый портрет', () => {
  const eqs = ["x' = y", "y' = -k*x"].map(parseEquation);

  it('поле направлений считается по правой части', () => {
    const f = planarField(eqs, 'x', 'y', { k: 1 })!;
    expect(f(1, 0)).toEqual([0, -1]);
    expect(f(0, 2)).toEqual([2, -0]);
    const arrows = directionField(f, [-1, 1], [-1, 1], 4, 2);
    expect(arrows).toHaveLength(8);
    // Центр клетки (−0.75, −0.5): скорость (y, −x) = (−0.5, 0.75).
    expect(arrows[0]).toEqual({ x: -0.75, y: -0.5, dx: -0.5, dy: 0.75 });
  });

  it('точка равновесия не даёт стрелки', () => {
    const f = planarField(eqs, 'x', 'y', { k: 1 })!;
    expect(directionField(f, [-1, 1], [-1, 1], 1, 1)).toEqual([]);
  });

  it('поля нет, если скорость зависит от t или третьей переменной', () => {
    expect(planarField(["x' = y", "y' = -x + sin(t)"].map(parseEquation), 'x', 'y', {})).toBeNull();
    const lorenz = ["x' = s*(y - x)", "y' = x*(r - z) - y", "z' = x*y - b*z"].map(parseEquation);
    expect(planarField(lorenz, 'x', 'z', { s: 10, r: 28, b: 2.667 })).toBeNull();
    // SIR: S' и I' не зависят от R — поле на плоскости S–I честное.
    const sir = ["S' = -beta*S*I", "I' = beta*S*I - gamma*I", "R' = gamma*I"].map(parseEquation);
    expect(planarField(sir, 'S', 'I', { beta: 0.3, gamma: 0.1 })).not.toBeNull();
  });

  it('стрелки по траектории идут по ходу движения и равномерно по длине', () => {
    const circle = Array.from({ length: 401 }, (_, i) => ({ x: Math.cos((i / 400) * 2 * Math.PI), y: Math.sin((i / 400) * 2 * Math.PI) }));
    const arrows = trajectoryArrows(circle, [-1, 1], [-1, 1], 4);
    expect(arrows).toHaveLength(4);
    // Против часовой стрелки: скорость перпендикулярна радиусу, векторное произведение > 0.
    arrows.forEach((a) => expect(a.x * a.dy - a.y * a.dx).toBeGreaterThan(0));
    const angles = arrows.map((a) => Math.atan2(a.y, a.x));
    expect(angles[1] - angles[0]).toBeCloseTo(Math.PI / 2, 1);
  });

  it('пределы с полями', () => {
    expect(paddedExtent([0, 10, NaN])).toEqual([-0.6, 10.6]);
    expect(paddedExtent([5, 5])).toEqual([4.5, 5.5]);
    expect(paddedExtent([])).toEqual([0, 1]);
  });

  it('buildModel рисует траекторию, поле и стартовый маркер', () => {
    const doc = { ...galleryDoc(GALLERY.find((m) => m.key === 'damped-oscillator')!), view: 'phase' as const };
    const b = buildModel(doc);
    expect(b.view).toBe('phase');
    expect(b.field).toBe(true);
    expect(b.spec.xLabel).toBe('x, м');
    expect(b.times).toHaveLength(b.current[0].points.length);
    expect(b.spec.arrows!.some((a) => a.kind === 'head')).toBe(true);
    expect(b.spec.arrows!.filter((a) => (a.kind ?? 'field') === 'field').length).toBeGreaterThan(100);
    const svg = renderPlot(b.spec);
    expect(svg).toContain('<circle');
    expect(svg).toContain('opacity="0.6"');
  });

  it('фазовый вид для одного уравнения откатывается к времени', () => {
    const b = buildModel({ ...galleryDoc(GALLERY.find((m) => m.key === 'logistic')!), view: 'phase' });
    expect(b.view).toBe('time');
    const b2 = buildModel({ ...galleryDoc(GALLERY.find((m) => m.key === 'rc-discharge')!), mode: 'ode', lines: ["x' = -k*x"], initial: { x: 1 }, view: 'phase' });
    expect(b2.view).toBe('time');
  });
});

describe('сравнение сценариев', () => {
  it('сценарии ОДУ — пунктир своего цвета с подписью в легенде', () => {
    const base = galleryDoc(GALLERY.find((m) => m.key === 'lotka-volterra')!);
    const doc: ModelDoc = { ...base, snapshots: [{ label: 'a=2', values: { a: 2 } }, { label: 'b=1', values: { b: 1 } }] };
    const b = buildModel(doc);
    expect(b.current).toHaveLength(2);
    expect(b.spec.curves).toHaveLength(6);
    const snaps = b.spec.curves!.slice(2);
    expect(snaps.every((c) => c.dashed && c.opacity! < 1)).toBe(true);
    expect(snaps.map((c) => c.label)).toEqual(['жертвы · a=2', 'хищники · a=2', 'жертвы · b=1', 'хищники · b=1']);
    expect(b.snapshotColors).toHaveLength(2);
    expect(snaps[0].color).toBe(b.snapshotColors[0]);
    expect(snaps[2].color).toBe(b.snapshotColors[1]);
    // Кривая сценария действительно другая.
    expect(snaps[0].points[500].y).not.toBeCloseTo(b.current[0].points[500].y, 3);
    const svg = renderPlot(b.spec);
    expect(svg).toContain('a=2');
    expect(svg).toContain('stroke-opacity="0.8"');
  });

  it('сценарии формулы и фазового портрета, не больше четырёх', () => {
    const rc = galleryDoc(GALLERY.find((m) => m.key === 'rc-discharge')!);
    const snaps = Array.from({ length: 6 }, (_, i) => ({ label: `R=${i + 1}`, values: { R: i + 1 } }));
    const b = buildModel({ ...rc, snapshots: snaps });
    expect(b.spec.curves!.length).toBe(b.current.length * (1 + MAX_SNAPSHOTS));
    const vdp = galleryDoc(GALLERY.find((m) => m.key === 'van-der-pol')!);
    const bp = buildModel({ ...vdp, snapshots: [{ label: 'μ=4', values: { mu: 4 } }] });
    expect(bp.view).toBe('phase');
    expect(bp.spec.curves!.map((c) => c.label)).toEqual(['траектория', 'μ=4']);
  });

  it('подпись сценария по умолчанию', () => {
    expect(snapshotLabel({ a: 1.1, b: 0.4 })).toBe('a=1.1, b=0.4');
    expect(snapshotLabel({ a: 1 / 3, b: 2, c: 3, d: 4 })).toBe('a=0.333, b=2, c=3…');
  });
});

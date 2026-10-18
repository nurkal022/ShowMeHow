/**
 * Логотип — тессеракт (4D-куб), спроецированный на плоскость. Общая геометрия
 * для статичной иконки и анимированной марки: обе рисуют одни и те же 32 ребра.
 */

/** Рёбра: вершины 0..15 соединены, если отличаются ровно одним битом. */
export const TESSERACT_EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) TESSERACT_EDGES.push([i, j]); }

/** Исходная поза (в ней логотип стоит без наведения). */
export const TESSERACT_POSE = { a: 0, b: 0, c: 0.2 };

/** Ребро внутреннего куба (w=+1), внешнего (w=-1) или связка между ними. */
export function edgeKind([i, j]: [number, number]): 'inner' | 'outer' | 'link' {
  return (i & 8) && (j & 8) ? 'inner' : !(i & 8) && !(j & 8) ? 'outer' : 'link';
}

/**
 * Вершины в координатах viewBox «-1.2 -1.2 2.4 2.4».
 * a, b — повороты в плоскостях xw и yw (то самое «вращение в 4D»), c — в xz.
 */
export function projectTesseract(a: number, b: number, c: number, scale = 1): [number, number][] {
  const TL = 0.2, SCL = 0.58, D4 = 2.5, D3 = 10;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const tc = Math.cos(TL), ts = Math.sin(TL);
  const P: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    let x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, z = i & 4 ? 1 : -1, w = i & 8 ? 1 : -1;
    [x, w] = [x * ca - w * sa, x * sa + w * ca];
    [y, w] = [y * cb - w * sb, y * sb + w * cb];
    [x, z] = [x * cc - z * sc, x * sc + z * cc];
    const k4 = (D4 - 1) / (D4 - w) * 1.5; x *= k4; y *= k4; z *= k4;
    [y, z] = [y * tc - z * ts, y * ts + z * tc];
    const k3 = (D3 - 1.5) / (D3 - z);
    P.push([x * k3 * SCL * scale, (y * k3 * SCL + 0.03) * scale]);
  }
  return P;
}

/** Вершины исходной позы — для статичной иконки и первого кадра на сервере. */
export const TESSERACT_REST = projectTesseract(TESSERACT_POSE.a, TESSERACT_POSE.b, TESSERACT_POSE.c);

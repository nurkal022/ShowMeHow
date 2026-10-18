/**
 * Электромагнитная индукция — чистые функции, без three.js.
 * Магнит — два «магнитных заряда» на концах (N = +q, S = −q). Поток через виток
 * радиуса a с осью axis считается по сглаженной формуле телесного угла:
 *   Φ = q/2 · [dS/√(dS²+a²) − dN/√(dN²+a²)],  d = (центр витка − полюс)·axis.
 * Она включает поток внутри самого магнита, поэтому непрерывна, когда магнит
 * проходит сквозь катушку. Сдвиг полюса вбок от оси ослабляет вклад.
 */

/** Поток через катушку, Вб (на все витки): coil = { center, axis, radius, length, turns, samples }. */
export function coilFlux(north, south, coil, q = 1.3e-3) {
  const { center, axis, radius: a, length, turns, samples = 16 } = coil;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = (samples === 1 ? 0 : i / (samples - 1) - 0.5) * length;
    const lc = [center[0] + axis[0] * s, center[1] + axis[1] * s, center[2] + axis[2] * s];
    sum += pole(lc, south, axis, a) - pole(lc, north, axis, a);
  }
  return (q / 2) * sum * (turns / samples);
}

function pole(lc, p, axis, a) {
  const dx = lc[0] - p[0], dy = lc[1] - p[1], dz = lc[2] - p[2];
  const d = dx * axis[0] + dy * axis[1] + dz * axis[2];
  const rho2 = Math.max(0, dx * dx + dy * dy + dz * dz - d * d);
  const fall = 1 / (1 + rho2 / (a * a));
  return (d / Math.sqrt(d * d + a * a)) * fall;
}

/**
 * Силовые линии магнита в его собственной системе: ось +x, N в (+h,0,0), S в (−h,0,0).
 * Трассируем в меридиональной плоскости и поворачиваем вокруг оси.
 * Возвращает массив ломаных [[x,y,z], ...] от N к S.
 */
export function fieldLines({ h = 0.1, starts = [18, 38, 62, 92, 128], azimuths = 6, r0 = 0.03, ds = 0.008, rmax = 0.75 } = {}) {
  const lines2d = [];
  for (const deg of starts) {
    const phi = (deg * Math.PI) / 180;
    let x = h + r0 * Math.cos(phi), y = r0 * Math.sin(phi);
    const pts = [[x, y]];
    for (let k = 0; k < 600; k++) {
      const [bx, by] = field2d(x, y, h);
      const l = Math.hypot(bx, by) || 1;
      x += (bx / l) * ds; y += (by / l) * ds;
      if (y < 0) y = 0;
      pts.push([x, y]);
      if (Math.hypot(x + h, y) < r0 || Math.hypot(x, y) > rmax) break;
    }
    lines2d.push(pts);
  }
  const out = [];
  for (let k = 0; k < azimuths; k++) {
    const al = (k / azimuths) * Math.PI * 2 + 0.3;
    const c = Math.cos(al), s = Math.sin(al);
    for (const l of lines2d) out.push(l.map(([x, y]) => [x, y * c, y * s]));
  }
  return out;
}

function field2d(x, y, h) {
  const nx = x - h, sx = x + h;
  const rn = Math.pow(nx * nx + y * y, 1.5) || 1e-9;
  const rs = Math.pow(sx * sx + y * y, 1.5) || 1e-9;
  return [nx / rn - sx / rs, y / rn - y / rs];
}

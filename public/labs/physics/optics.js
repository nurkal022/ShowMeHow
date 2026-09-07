/**
 * Геометрическая оптика на плоскости стола (векторы [x, z]).
 * refract возвращает null при полном внутреннем отражении.
 */
export function refract(d, n, n1, n2) {
  const [dx, dy] = norm(d);
  let [nx, ny] = norm(n);
  let cosI = -(dx * nx + dy * ny);
  if (cosI < 0) { nx = -nx; ny = -ny; cosI = -cosI; }
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  const s = eta * cosI - Math.sqrt(k);
  return [eta * dx + s * nx, eta * dy + s * ny];
}

export function reflect(d, n) {
  const [dx, dy] = norm(d);
  const [nx, ny] = norm(n);
  const dot = dx * nx + dy * ny;
  return [dx - 2 * dot * nx, dy - 2 * dot * ny];
}

/** Показатель преломления стекла (Коши) по длине волны в нм — даёт дисперсию. */
export function indexFor(lambdaNm, base = 1.5) {
  return base - 0.0068 + 0.012 * (1e6 / (lambdaNm * lambdaNm));
}

export const SPECTRUM = [
  { nm: 650, color: '#ff1744' }, { nm: 600, color: '#ff9100' }, { nm: 570, color: '#ffea00' },
  { nm: 530, color: '#00e676' }, { nm: 490, color: '#00e5ff' }, { nm: 460, color: '#2979ff' }, { nm: 420, color: '#d500f9' },
];

function norm([x, y]) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

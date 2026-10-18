/**
 * Геометрия затмений по трём шарам (Солнце S, Земля E, Луна M — THREE.Vector3 и радиусы).
 * Тень тела — конус умбры (сходится за телом) и конус полутени (расходится).
 * Возвращает тип затмения и данные, чтобы нарисовать пятно тени на Земле.
 */
import * as THREE from 'three';

const a = new THREE.Vector3(), w = new THREE.Vector3(), p = new THREE.Vector3();

export function classify(S, rS, E, rE, M, rM) {
  // --- Солнечное: Земля в тени Луны ---
  const dSM = S.distanceTo(M);
  w.subVectors(M, S).normalize();
  a.subVectors(E, M);
  let t = a.dot(w);
  if (t > 0) {
    p.copy(a).addScaledVector(w, -t);
    const perp = p.length();
    const rP = rM + (t * (rS + rM)) / dSM; // полутень на расстоянии t за Луной
    if (perp < rE + rP) {
      const axisPoint = M.clone().addScaledVector(w, t);
      // Точка земной поверхности, ближайшая к оси тени.
      const normal = perp > 1e-6 ? axisPoint.clone().sub(E).normalize() : w.clone().negate();
      const tSurf = perp < rE ? t - Math.sqrt(rE * rE - perp * perp) : t;
      const rUs = rM - (tSurf * (rS - rM)) / dSM; // умбра у поверхности; < 0 — за вершиной конуса
      const rPs = rM + (tSurf * (rS + rM)) / dSM;
      let kind = 'solar-partial';
      if (perp < rE) kind = rUs > 0 ? 'solar-total' : 'solar-annular';
      return { kind, normal, umbra: Math.abs(rUs), penumbra: rPs };
    }
  }
  // --- Лунное: Луна в тени Земли ---
  const dSE = S.distanceTo(E);
  w.subVectors(E, S).normalize();
  a.subVectors(M, E);
  t = a.dot(w);
  if (t > 0) {
    p.copy(a).addScaledVector(w, -t);
    const perp = p.length();
    const rU = rE - (t * (rS - rE)) / dSE;
    const rP = rE + (t * (rS + rE)) / dSE;
    if (perp + rM <= rU) return { kind: 'lunar-total', depth: 1 };
    if (perp - rM < rU) return { kind: 'lunar-partial', depth: Math.min(1, (rU - (perp - rM)) / (2 * rM)) };
    if (perp - rM < rP) return { kind: 'lunar-penumbral', depth: 0 };
  }
  return { kind: 'none' };
}

/**
 * Конус единичной высоты: основание радиуса 1 в начале координат, вершина в +Y.
 * Масштаб (r, L, r) и поворот +Y → направление тени делают из него любой конус.
 */
export function unitCone(radiusTop = 0) {
  const g = new THREE.CylinderGeometry(radiusTop, 1, 1, 32, 1, true);
  g.translate(0, 0.5, 0);
  return g;
}

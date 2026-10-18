/**
 * Игрушечные, но честные по форме модели климата.
 * Станция 1: однослойная атмосфера. Земля без атмосферы была бы −18 °C (Te),
 * слой с излучательной способностью ε возвращает часть ИК вниз: Ts = Te·(2/(2−ε))^¼.
 * ε растёт логарифмически по CO₂ (удвоение ≈ +3 °C, как оценка чувствительности климата)
 * и линейно по водяному пару.
 */
export const BASE_CO2 = 280;
const SIGMA = 5.67e-8;
const SOLAR = 1361;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function emissivity(co2, h2o) {
  return clamp(0.78 + 0.05 * Math.log2(co2 / BASE_CO2) + 0.03 * (h2o - 1), 0.3, 0.97);
}

/** Равновесная температура поверхности, °C. */
export function equilibriumC(co2, h2o, albedo = 0.3) {
  const te = Math.pow((SOLAR * (1 - albedo)) / (4 * SIGMA), 0.25);
  return te * Math.pow(2 / (2 - emissivity(co2, h2o)), 0.25) - 273.15;
}

/**
 * Станция 2: ледник и океан. dT — потепление от рычага, °C.
 * Возвращает целевую долю льда, альбедо поверхности и подъём моря в метрах.
 */
export function iceTarget(dT) { return clamp(1 - dT / 4.5, 0, 1); }

/** Альбедо смеси: лёд ≈ 0.8, вода ≈ 0.06; лёд закрывает 40 % поверхности при ice = 1. */
export function surfaceAlbedo(ice) { const cover = 0.4 * ice; return cover * 0.8 + (1 - cover) * 0.06; }

/** Обратная связь «лёд — альбедо»: темнее поверхность — больше поглощено — теплее. */
export function albedoFeedback(ice) { return 3 * (surfaceAlbedo(1) - surfaceAlbedo(ice)); }

/** Подъём уровня: тепловое расширение воды плюс талая вода с суши. */
export function seaRise(dTtotal, ice) { return 0.35 * dTtotal + 7 * (1 - ice); }

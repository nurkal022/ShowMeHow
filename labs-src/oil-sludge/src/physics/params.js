// Физические параметры модели. Значения — ориентировочные литературные (реальных образцов пока нет).
// Источники диапазонов: Hu, Li, Zeng (2013) J. Hazard. Mater. — обзор переработки нефтешламов;
// Калменова, Балакаева, Phillips (2023) IJOGCT 34(2); Вестник КазНПУ №4(84) 2023.

export const R = 8.314; // Дж/(моль·К)
export const SIGMA = 5.670374e-8; // Вт/(м²·К⁴)
export const P_ATM = 101325; // Па
export const G = 9.81; // м/с²
export const T0K = 273.15;

// Трутон: ΔS_исп ≈ 88 Дж/(моль·К) → L·M/R ≈ 10.6·Tb (для углеводородов)
const trouton = (TbC) => 10.6 * (TbC + T0K);

// Жидкие компоненты (псевдокомпоненты). B = L·M/R [K] — для уравнения Клапейрона–Клаузиуса.
export const COMPONENTS = [
  { id: 'water',  name: 'Вода',               color: '#5aa9ff', TbC: 100,  L: 2.257e6, M: 0.018, rho: 1000, c: 4186, lambda: 0.60, B: 2.257e6 * 0.018 / R },
  { id: 'light',  name: 'Лёгкие УВ (C5–C10)', color: '#7fe0c0', TbC: 150,  L: 3.4e5,   M: 0.11,  rho: 750,  c: 2100, lambda: 0.13, B: trouton(150) },
  { id: 'medium', name: 'Средние (C11–C20)',  color: '#ffd166', TbC: 290,  L: 2.7e5,   M: 0.20,  rho: 850,  c: 2200, lambda: 0.13, B: trouton(290) },
  { id: 'heavy',  name: 'Тяжёлые (C21–C35)',  color: '#f08a4b', TbC: 430,  L: 2.2e5,   M: 0.35,  rho: 920,  c: 2300, lambda: 0.13, B: trouton(430) },
  { id: 'resid',  name: 'Смолы и асфальтены', color: '#9b6b4a', TbC: null, L: 0,       M: 0.60,  rho: 1050, c: 1900, lambda: 0.15, B: 0 },
];
export const NC = COMPONENTS.length;
export const OIL = [1, 2, 3, 4];
export const VOLATILE = [0, 1, 2, 3];

export const SOLID = { rho: 2650, c: 840, lambda: 2.0 };   // минеральная часть (песок/глина)
export const COKE = { rho: 1400, c: 1100, lambda: 0.4 };   // кокс (char)

// Пиролиз смол/асфальтенов: r = A·exp(−E/RT)·m  (1-й порядок)
export const PYRO = {
  A: 7e7,         // 1/с
  E: 1.5e5,       // Дж/моль
  dH: 2.5e5,      // Дж/кг, эндотермический
  yGas: 0.2,      // доля → неконденсируемый газ (H₂, CH₄, C₂–C₄)
  yTar: 0.4,      // → пары смолы (пиролизное масло)
  yCoke: 0.4,     // → кокс
  h2sRelease: 0.5 // доля серы смол, уходящая в H₂S
};

// Испарение ниже точки кипения: ṁ = k_ev·f_esc·m·ψ, ψ = x·p_sat/p_атм
export const EVAP = {
  kEv: 5e-4,      // 1/с
  delta: 0.004,   // м — масштаб сопротивления выходу пара (f_esc = 1/(1 + d/δ))
};

// Фильтрация нефти под действием тяжести (Дарси + Кори + Андраде)
export const DRAIN = {
  Sor: 0.2,       // остаточная нефтенасыщенность
  corey: 3,
  muRef: 2.0,     // Па·с при 20 °C
  TRef: 293.15,
  Bvisc: 5050,    // К, μ = μref·exp(B(1/T − 1/Tref))
};

export const PORE_RAD = { eps: 0.85, dp: 1e-3 }; // излучение в порах: λ_rad = 4·ε·σ·d_p·T³

// Воздух — свойства от температуры (аппроксимации табличных данных, 300–800 K)
export const air = {
  nu: (T) => 1.57e-5 * Math.pow(T / 300, 1.74),     // м²/с
  lambda: (T) => 0.0263 * Math.pow(T / 300, 0.835), // Вт/(м·К)
  Pr: 0.70,
};

// Пресеты образцов: массовые доли (вода/нефть/твёрдое), состав нефти, проницаемость
export const PRESETS = [
  {
    id: 'pit', name: 'Нефтешлам из амбара',
    water: 0.25, oil: 0.30, solid: 0.45,
    oilFrac: [0.10, 0.25, 0.30, 0.35], k: 2e-11, sulfur: 0.015,
  },
  {
    id: 'tank', name: 'Резервуарный (обводнённый)',
    water: 0.55, oil: 0.35, solid: 0.10,
    oilFrac: [0.15, 0.30, 0.30, 0.25], k: 5e-11, sulfur: 0.012,
  },
  {
    id: 'soil', name: 'Почва после разлива',
    water: 0.12, oil: 0.12, solid: 0.76,
    oilFrac: [0.20, 0.30, 0.25, 0.25], k: 1e-11, sulfur: 0.01,
  },
];

export const GAS_PORE0 = 0.1; // начальная газонасыщенность пор

// Объёмные концентрации [кг/м³] из массовых долей пресета
export function presetDensities(p) {
  const vs = p.solid / SOLID.rho;
  const vw = p.water / COMPONENTS[0].rho;
  let vo = 0;
  OIL.forEach((c, i) => { vo += (p.oil * p.oilFrac[i]) / COMPONENTS[c].rho; });
  const vPore = (vw + vo) / (1 - GAS_PORE0);
  const vBulk = vs + vPore; // м³ на 1 кг
  const m = new Array(NC).fill(0);
  m[0] = p.water / vBulk;
  OIL.forEach((c, i) => { m[c] = (p.oil * p.oilFrac[i]) / vBulk; });
  return { m, solid: p.solid / vBulk, rhoBulk: 1 / vBulk, porosity: vPore / vBulk };
}

// Справочные ПДК рабочей зоны (мг/м³), для учебного сравнения
export const LIMITS = {
  h2s: 10,     // сероводород
  voc: 300,    // углеводороды алифатические предельные C1–C10 (в пересчёте на C)
};

import type { ModelDoc, ModelParam } from './doc';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';
import { galleryText } from '@/i18n/messages/research-gallery';

/**
 * Галерея готовых моделей: классика из разных областей, которую учёный узнаёт
 * с первого взгляда. Каждая — полноценный документ модели с подобранными
 * пределами параметров, единицами и начальными условиями: открыл — и сразу
 * играешь слайдерами, а не вспоминаешь, при каких k система не разлетается.
 * Что каждая решается без срыва на всём интервале, проверяет тест.
 */

export type GalleryField = 'Физика' | 'Химия' | 'Биология' | 'Экология' | 'Электротехника' | 'Эпидемиология' | 'Математика';

export const GALLERY_FIELDS: GalleryField[] = ['Физика', 'Электротехника', 'Химия', 'Биология', 'Экология', 'Эпидемиология', 'Математика'];

export interface GalleryModel {
  key: string;
  title: string;
  description: string;
  field: GalleryField;
  doc: ModelDoc;
}

const p = (name: string, value: number, min: number, max: number, hint?: string): ModelParam => ({ name, value, min, max, ...(hint ? { hint } : {}) });

/** Общие поля документа: экранный стиль, сетка, без данных эксперимента. */
function doc(key: string, d: Pick<ModelDoc, 'title' | 'mode' | 'lines' | 'params' | 'from' | 'to' | 'xLabel' | 'yLabel'> & Partial<ModelDoc>): ModelDoc {
  return {
    xLog: false, yLog: false, style: 'screen', grid: true,
    initial: {}, data: '', dataX: 0, dataY: null, view: 'time', snapshots: [],
    ...d, template: key,
  };
}

export const GALLERY: GalleryModel[] = [
  {
    key: 'damped-oscillator', field: 'Физика', title: 'Затухающий осциллятор',
    description: 'Груз на пружине с вязким трением: недо-, пере- и критическое затухание. База для механики, акустики и колебательных контуров.',
    doc: doc('damped-oscillator', {
      title: 'Затухающий гармонический осциллятор', mode: 'ode', xLabel: 't, с', yLabel: 'x, м; v, м/с',
      lines: ["x' = v", "v' = -2*g*v - w^2*x"],
      params: [p('g', 0.2, 0, 3, 'коэффициент затухания, 1/с'), p('w', 2, 0.5, 6, 'собственная частота, рад/с')],
      from: 0, to: 20, initial: { x: 1, v: 0 }, phaseX: 'x', phaseY: 'v', varLabels: { x: 'x, м', v: 'v, м/с' },
    }),
  },
  {
    key: 'pendulum', field: 'Физика', title: 'Нелинейный маятник',
    description: 'Маятник при больших углах: период зависит от амплитуды, а на фазовой плоскости видны сепаратриса и вращение. Классика нелинейной динамики.',
    doc: doc('pendulum', {
      title: 'Нелинейный маятник с трением', mode: 'ode', xLabel: 't, с', yLabel: 'θ, рад; ω, рад/с',
      lines: ["theta' = omega", "omega' = -(g/L)*sin(theta) - k*omega"],
      params: [p('g', 9.81, 1, 25, 'ускорение свободного падения, м/с²'), p('L', 1, 0.2, 5, 'длина нити, м'), p('k', 0.1, 0, 2, 'трение, 1/с')],
      from: 0, to: 20, initial: { theta: 2.5, omega: 0 }, phaseX: 'theta', phaseY: 'omega', varLabels: { theta: 'θ, рад', omega: 'ω, рад/с' },
    }),
  },
  {
    key: 'projectile-drag', field: 'Физика', title: 'Полёт тела с сопротивлением воздуха',
    description: 'Бросок под углом с квадратичным сопротивлением: траектория несимметрична, дальность меньше параболической. Баллистика, спорт, капли.',
    doc: doc('projectile-drag', {
      title: 'Полёт с квадратичным сопротивлением', mode: 'ode', xLabel: 't, с', yLabel: 'координаты, м; скорости, м/с',
      // step(y) останавливает тело на земле: дальше система «замирает», а не уходит под землю.
      lines: [
        "x' = vx*step(y)", "y' = vy*step(y)",
        "vx' = -k*vx*sqrt(vx^2 + vy^2)*step(y)", "vy' = (-g - k*vy*sqrt(vx^2 + vy^2))*step(y)",
      ],
      params: [p('k', 0.02, 0, 0.2, 'сопротивление k = ρC·S/(2m), 1/м'), p('g', 9.81, 1, 25, 'ускорение свободного падения, м/с²')],
      from: 0, to: 5, initial: { x: 0, y: 0, vx: 20, vy: 20 }, view: 'phase', phaseX: 'x', phaseY: 'y',
      varLabels: { x: 'x, м', y: 'y, м', vx: 'vx, м/с', vy: 'vy, м/с' },
    }),
  },
  {
    key: 'decay-chain', field: 'Физика', title: 'Цепочка радиоактивного распада',
    description: 'Материнское ядро → дочернее → стабильное: накопление и спад промежуточного изотопа, вековое равновесие. Радиохимия, датирование, медицина.',
    doc: doc('decay-chain', {
      title: 'Радиоактивный распад A → B → C', mode: 'ode', xLabel: 't, ч', yLabel: 'доля ядер',
      lines: ["A' = -ln(2)/T1*A", "B' = ln(2)/T1*A - ln(2)/T2*B", "C' = ln(2)/T2*B"],
      params: [p('T1', 2, 0.1, 20, 'период полураспада A, ч'), p('T2', 5, 0.1, 20, 'период полураспада B, ч')],
      from: 0, to: 40, initial: { A: 1, B: 0, C: 0 }, phaseX: 'A', phaseY: 'B', varLabels: { A: 'A (материнский)', B: 'B (дочерний)', C: 'C (стабильный)' },
    }),
  },
  {
    key: 'rc-discharge', field: 'Электротехника', title: 'Разряд конденсатора (RC)',
    description: 'Экспоненциальный спад напряжения с постоянной времени τ = RC. Первое, с чем сравнивают осциллограмму в лабораторной.',
    doc: doc('rc-discharge', {
      title: 'Разряд конденсатора через резистор', mode: 'function', xLabel: 't, с', yLabel: 'U, В',
      lines: ['U = U0*exp(-t/(R*C))', 'уровень 1/e = U0*exp(-1)'],
      params: [p('U0', 10, 0, 20, 'начальное напряжение, В'), p('R', 1, 0.1, 10, 'сопротивление, кОм'), p('C', 1, 0.1, 5, 'ёмкость, мФ')],
      from: 0, to: 10,
    }),
  },
  {
    key: 'rlc', field: 'Электротехника', title: 'Последовательный RLC-контур',
    description: 'Включение постоянного напряжения на RLC-цепь: колебательный и апериодический переходный процесс заряда и тока.',
    doc: doc('rlc', {
      title: 'Переходный процесс в RLC-контуре', mode: 'ode', xLabel: 't, мс', yLabel: 'q, мКл; i, А',
      lines: ["q' = i", "i' = (E - R*i - q/C)/L"],
      params: [
        p('E', 10, 0, 20, 'ЭДС источника, В'), p('R', 2, 0, 20, 'сопротивление, Ом'),
        p('L', 1, 0.1, 5, 'индуктивность, мГн'), p('C', 0.25, 0.02, 2, 'ёмкость, мкФ'),
      ],
      from: 0, to: 20, initial: { q: 0, i: 0 }, phaseX: 'q', phaseY: 'i', varLabels: { q: 'q, мКл', i: 'i, А' },
    }),
  },
  {
    key: 'reaction-chain', field: 'Химия', title: 'Последовательная реакция A → B → C',
    description: 'Кинетика первого порядка: промежуточный продукт B проходит через максимум. Когда останавливать синтез, чтобы собрать больше B.',
    doc: doc('reaction-chain', {
      title: 'Последовательная реакция A → B → C', mode: 'ode', xLabel: 't, мин', yLabel: 'c, моль/л',
      lines: ["A' = -k1*A", "B' = k1*A - k2*B", "C' = k2*B"],
      params: [p('k1', 1, 0.01, 5, 'константа A → B, 1/мин'), p('k2', 0.3, 0.01, 5, 'константа B → C, 1/мин')],
      from: 0, to: 20, initial: { A: 1, B: 0, C: 0 }, phaseX: 'A', phaseY: 'B', varLabels: { A: '[A], моль/л', B: '[B], моль/л', C: '[C], моль/л' },
    }),
  },
  {
    key: 'michaelis-menten', field: 'Химия', title: 'Кинетика Михаэлиса — Ментен',
    description: 'Скорость ферментативной реакции от концентрации субстрата и влияние конкурентного ингибитора. Основа энзимологии и фармакологии.',
    doc: doc('michaelis-menten', {
      title: 'Кинетика Михаэлиса — Ментен', mode: 'function', xLabel: '[S], мМ', yLabel: 'v, мкМ/с',
      lines: ['без ингибитора = Vmax*x/(Km + x)', 'с ингибитором = Vmax*x/(Km*(1 + I/Ki) + x)', 'асимптота Vmax = Vmax'],
      params: [
        p('Vmax', 10, 0.5, 20, 'максимальная скорость, мкМ/с'), p('Km', 5, 0.1, 30, 'константа Михаэлиса, мМ'),
        p('I', 2, 0, 10, 'концентрация ингибитора, мМ'), p('Ki', 1, 0.1, 10, 'константа ингибирования, мМ'),
      ],
      from: 0, to: 50,
    }),
  },
  {
    key: 'logistic', field: 'Биология', title: 'Логистический рост',
    description: 'Рост популяции с ограниченной ёмкостью среды: S-кривая выходит на плато K. Бактерии в колбе, клеточные культуры, распространение технологий.',
    doc: doc('logistic', {
      title: 'Логистический рост популяции', mode: 'function', xLabel: 't, ч', yLabel: 'N, особей',
      lines: ['N = K/(1 + (K/N0 - 1)*exp(-r*t))', 'асимптота K = K'],
      params: [p('K', 1000, 100, 5000, 'ёмкость среды, особей'), p('N0', 10, 1, 500, 'начальная численность'), p('r', 0.5, 0.05, 2, 'скорость роста, 1/ч')],
      from: 0, to: 30,
    }),
  },
  {
    key: 'lotka-volterra', field: 'Экология', title: 'Хищник — жертва (Лотка — Вольтерра)',
    description: 'Колебания численности зайцев и рысей со сдвигом фаз; на фазовой плоскости — замкнутые орбиты вокруг равновесия.',
    doc: doc('lotka-volterra', {
      title: 'Хищник — жертва (Лотка — Вольтерра)', mode: 'ode', xLabel: 't, годы', yLabel: 'численность',
      lines: ["x' = a*x - b*x*y", "y' = -c*y + d*x*y"],
      params: [
        p('a', 1.1, 0.1, 3, 'рождаемость жертв, 1/год'), p('b', 0.4, 0.05, 2, 'выедание жертв хищниками'),
        p('c', 0.4, 0.05, 2, 'смертность хищников, 1/год'), p('d', 0.1, 0.01, 1, 'прирост хищников от охоты'),
      ],
      from: 0, to: 50, initial: { x: 10, y: 10 }, phaseX: 'x', phaseY: 'y', varLabels: { x: 'жертвы', y: 'хищники' },
    }),
  },
  {
    key: 'sir', field: 'Эпидемиология', title: 'Эпидемия SIR',
    description: 'Восприимчивые → заражённые → выздоровевшие: пик эпидемии и порог R₀ = β/γ. Модель, с которой начинается любой прогноз заболеваемости.',
    doc: doc('sir', {
      title: 'Модель эпидемии SIR', mode: 'ode', xLabel: 't, сут', yLabel: 'доля населения',
      lines: ["S' = -beta*S*I", "I' = beta*S*I - gamma*I", "R' = gamma*I"],
      params: [p('beta', 0.3, 0, 1, 'скорость заражения β, 1/сут'), p('gamma', 0.1, 0.01, 0.5, 'скорость выздоровления γ, 1/сут')],
      from: 0, to: 160, initial: { S: 0.99, I: 0.01, R: 0 }, phaseX: 'S', phaseY: 'I',
      varLabels: { S: 'S, восприимчивые', I: 'I, заражённые', R: 'R, выздоровевшие' },
    }),
  },
  {
    key: 'lorenz', field: 'Математика', title: 'Аттрактор Лоренца',
    description: 'Три уравнения конвекции, дающие хаос: «бабочка» на плоскости x–z и чувствительность к начальным условиям.',
    doc: doc('lorenz', {
      title: 'Аттрактор Лоренца', mode: 'ode', xLabel: 't', yLabel: 'x, y, z',
      lines: ["x' = s*(y - x)", "y' = x*(r - z) - y", "z' = x*y - b*z"],
      params: [p('s', 10, 0, 20, 'число Прандтля σ'), p('r', 28, 0, 50, 'число Рэлея ρ'), p('b', 2.667, 0.1, 5, 'геометрия β')],
      from: 0, to: 30, initial: { x: 1, y: 1, z: 1 }, view: 'phase', phaseX: 'x', phaseY: 'z',
    }),
  },
  {
    key: 'van-der-pol', field: 'Математика', title: 'Осциллятор Ван дер Поля',
    description: 'Автоколебания с нелинейным трением: любая траектория наматывается на предельный цикл; при больших μ — релаксационные колебания.',
    doc: doc('van-der-pol', {
      title: 'Осциллятор Ван дер Поля', mode: 'ode', xLabel: 't', yLabel: 'x, y',
      lines: ["x' = y", "y' = mu*(1 - x^2)*y - x"],
      params: [p('mu', 1, 0, 6, 'нелинейность μ')],
      from: 0, to: 40, initial: { x: 0.5, y: 0 }, view: 'phase', phaseX: 'x', phaseY: 'y',
    }),
  },
];

const FIELD_KEYS: Record<GalleryField, 'fieldPhysics' | 'fieldChemistry' | 'fieldBiology' | 'fieldEcology' | 'fieldElectrical' | 'fieldEpidemiology' | 'fieldMath'> = {
  Физика: 'fieldPhysics', Химия: 'fieldChemistry', Биология: 'fieldBiology', Экология: 'fieldEcology',
  Электротехника: 'fieldElectrical', Эпидемиология: 'fieldEpidemiology', Математика: 'fieldMath',
};

/** Название области на языке интерфейса; сама область остаётся ключом фильтра. */
export const fieldLabel = (f: GalleryField, locale: Locale = 'ru'): string => translator(researchFigure, locale)(FIELD_KEYS[f]);

/** Модель на языке интерфейса: подписи, оси и имена кривых; формулы и пределы те же. */
export function localizeGalleryModel(m: GalleryModel, locale: Locale = 'ru'): GalleryModel {
  const tx = locale === 'ru' ? undefined : galleryText[locale][m.key];
  if (!tx) return m;
  const d = m.doc;
  return {
    ...m, title: tx.title, description: tx.description,
    doc: {
      ...d, title: tx.docTitle, xLabel: tx.xLabel, yLabel: tx.yLabel,
      lines: tx.lines && tx.lines.length === d.lines.length ? tx.lines : d.lines,
      params: d.params.map((p) => (tx.params?.[p.name] ? { ...p, hint: tx.params[p.name] } : p)),
      ...(d.varLabels ? { varLabels: Object.fromEntries(Object.entries(d.varLabels).map(([k, v]) => [k, tx.varLabels?.[k] ?? v])) } : {}),
    },
  };
}

export const galleryList = (locale: Locale = 'ru'): GalleryModel[] => GALLERY.map((m) => localizeGalleryModel(m, locale));

export const galleryModel = (key: string, locale: Locale = 'ru'): GalleryModel | undefined => {
  const m = GALLERY.find((g) => g.key === key);
  return m && localizeGalleryModel(m, locale);
};

/** Копия документа шаблона — чтобы правки в редакторе не портили галерею в памяти. */
export const galleryDoc = (m: GalleryModel): ModelDoc => JSON.parse(JSON.stringify(m.doc)) as ModelDoc;

/** Поиск без учёта регистра по названию, описанию и области — на языке интерфейса и по-русски. */
export function searchGallery(query: string, field: GalleryField | null, locale: Locale = 'ru'): GalleryModel[] {
  const q = query.trim().toLowerCase();
  return GALLERY.map((m) => [m, localizeGalleryModel(m, locale)] as const).filter(([m, l]) => (!field || m.field === field)
    && (!q || `${m.title} ${m.description} ${m.field} ${m.doc.lines.join(' ')} ${l.title} ${l.description} ${fieldLabel(m.field, locale)}`.toLowerCase().includes(q)))
    .map(([, l]) => l);
}

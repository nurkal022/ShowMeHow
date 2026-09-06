/**
 * Таблица стенда: разделы, типовые явления, параметры и приборы.
 *
 * Всё здесь — подсказки, а не рамки. Ни один список не ограничивает: рядом с
 * каждым в интерфейсе стоит равноправное поле «своё», и написанное руками
 * попадает в запрос наравне с выбранным. Отдельный модуль данных пополняется
 * без правки логики.
 */

/** Приборы кита, которые стенд умеет показать. Больше кит и не умеет. */
export type Instrument = 'slider' | 'readout' | 'chart' | 'formula' | 'presets' | 'steps';

/** Мотив образа: вокруг общего ядра раздел надстраивает свой аппарат. */
export type Motif =
  | 'pendulum' | 'beam' | 'piston' | 'field' | 'particles' | 'orbit'
  | 'flask' | 'array' | 'curve' | 'population' | 'globe';

export interface Section {
  key: string;
  label: string;
  motif: Motif;
  phenomena: string[];
  parameters: string[];
  /** Приборы, которые включены при выборе раздела. Меняются одним кликом. */
  instruments: Instrument[];
}

export const SECTIONS: Section[] = [
  {
    key: 'mechanics',
    label: 'Механика',
    motif: 'pendulum',
    phenomena: [
      'математический маятник', 'свободное падение', 'движение по наклонной плоскости',
      'столкновение шаров', 'вращение и центробежная сила', 'пружинный осциллятор',
    ],
    parameters: ['масса', 'длина', 'угол', 'начальная скорость', 'коэффициент трения', 'жёсткость пружины'],
    instruments: ['slider', 'readout', 'chart', 'formula'],
  },
  {
    key: 'optics',
    label: 'Оптика',
    motif: 'beam',
    phenomena: [
      'преломление луча', 'отражение и зеркала', 'линза и построение изображения',
      'дисперсия в призме', 'интерференция', 'дифракция на щели',
    ],
    parameters: ['показатель преломления', 'угол падения', 'фокусное расстояние', 'длина волны', 'ширина щели', 'расстояние до экрана'],
    instruments: ['slider', 'readout', 'formula'],
  },
  {
    key: 'thermo',
    label: 'Термодинамика',
    motif: 'piston',
    phenomena: [
      'теплопередача', 'цикл Карно', 'расширение газа', 'фазовый переход',
      'конвекция', 'теплопроводность стержня',
    ],
    parameters: ['температура', 'давление', 'объём', 'теплоёмкость', 'масса вещества', 'мощность нагрева'],
    instruments: ['slider', 'readout', 'chart', 'presets'],
  },
  {
    key: 'electro',
    label: 'Электричество',
    motif: 'field',
    phenomena: [
      'поле точечных зарядов', 'конденсатор', 'ток в цепи', 'магнитное поле проводника',
      'электромагнитная индукция', 'сила Лоренца',
    ],
    parameters: ['заряд', 'расстояние между зарядами', 'напряжение', 'сопротивление', 'сила тока', 'индукция магнитного поля'],
    instruments: ['slider', 'readout', 'formula'],
  },
  {
    key: 'molecular',
    label: 'Молекулярная физика',
    motif: 'particles',
    phenomena: [
      'диффузия', 'броуновское движение', 'идеальный газ', 'осмос',
      'испарение', 'распределение молекул по скоростям',
    ],
    parameters: ['температура', 'число частиц', 'концентрация', 'объём сосуда', 'масса молекулы', 'давление'],
    instruments: ['slider', 'readout', 'chart'],
  },
  {
    key: 'astro',
    label: 'Астрономия',
    motif: 'orbit',
    phenomena: [
      'орбита спутника', 'законы Кеплера', 'фазы Луны', 'солнечное затмение',
      'приливы', 'гравитационная линза',
    ],
    parameters: ['масса центрального тела', 'скорость запуска', 'радиус орбиты', 'эксцентриситет', 'наклон орбиты', 'масштаб времени'],
    instruments: ['slider', 'readout', 'formula', 'presets'],
  },
  {
    key: 'chemistry',
    label: 'Химия',
    motif: 'flask',
    phenomena: [
      'скорость реакции', 'химическое равновесие', 'титрование', 'электролиз',
      'кристаллическая решётка', 'геометрия молекулы',
    ],
    parameters: ['концентрация', 'температура', 'катализатор', 'объём титранта', 'кислотность (pH)', 'давление'],
    instruments: ['slider', 'readout', 'chart', 'formula'],
  },
  {
    key: 'cs',
    label: 'Информатика',
    motif: 'array',
    phenomena: [
      'сортировка массива', 'поиск пути в графе', 'двоичный поиск',
      'рекурсия и дерево вызовов', 'клеточный автомат', 'персептрон', 'хеш-таблица',
    ],
    parameters: ['размер массива', 'исходный порядок', 'скорость шагов', 'основание рекурсии', 'правило автомата', 'скорость обучения'],
    instruments: ['steps', 'readout', 'chart', 'presets'],
  },
  {
    key: 'math',
    label: 'Математика',
    motif: 'curve',
    phenomena: [
      'производная как касательная', 'векторы и их сложение', 'метод Монте-Карло',
      'ряды Фурье', 'предел последовательности', 'площадь под кривой',
    ],
    parameters: ['коэффициент функции', 'положение точки', 'число слагаемых', 'число испытаний', 'шаг разбиения', 'масштаб осей'],
    instruments: ['slider', 'readout', 'chart', 'formula'],
  },
  {
    key: 'biology',
    label: 'Биология',
    motif: 'population',
    phenomena: [
      'динамика популяций', 'потенциал действия нейрона', 'кинетика фермента',
      'наследование признаков', 'фотосинтез', 'работа сердца',
    ],
    parameters: ['рождаемость', 'смертность', 'ёмкость среды', 'концентрация субстрата', 'сила стимула', 'частота'],
    instruments: ['slider', 'chart', 'readout'],
  },
  {
    key: 'earth',
    label: 'Науки о Земле',
    motif: 'globe',
    phenomena: [
      'смена времён года', 'тектоника плит', 'круговорот воды',
      'приливы и отливы', 'парниковый эффект', 'сейсмические волны',
    ],
    parameters: ['наклон оси', 'широта', 'время года', 'скорость плит', 'концентрация CO₂', 'глубина очага'],
    instruments: ['slider', 'readout', 'chart'],
  },
];

export type Style = 'schematic' | 'realistic' | 'data';
export type Level = 'grade7to9' | 'grade10to11' | 'students';

export const STYLES: { value: Style; label: string; hint: string }[] = [
  { value: 'schematic', label: 'Схема', hint: 'как в учебнике' },
  { value: 'realistic', label: 'Реалистично', hint: 'похоже на настоящее' },
  { value: 'data', label: 'Данные', hint: 'графики и числа' },
];

export const LEVELS: { value: Level; label: string }[] = [
  { value: 'grade7to9', label: '7–9 класс' },
  { value: 'grade10to11', label: '10–11 класс' },
  { value: 'students', label: 'Студенты' },
];

export const INSTRUMENTS: { value: Instrument; label: string; hint: string }[] = [
  { value: 'slider', label: 'Ползунки', hint: 'крутить параметры' },
  { value: 'readout', label: 'Показания', hint: 'числа, меняются на ходу' },
  { value: 'chart', label: 'График', hint: 'величина во времени' },
  { value: 'formula', label: 'Формула', hint: 'закон с подстановкой' },
  { value: 'presets', label: 'Пресеты', hint: 'готовые состояния' },
  { value: 'steps', label: 'Пошагово', hint: 'по одному шагу вместо потока' },
];

export function sectionByKey(key: string): Section | undefined {
  return SECTIONS.find((s) => s.key === key);
}

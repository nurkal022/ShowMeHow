/**
 * Таблица стенда: разделы, типовые явления, параметры и приборы.
 *
 * Всё здесь — подсказки, а не рамки. Ни один список не ограничивает: рядом с
 * каждым в интерфейсе стоит равноправное поле «своё», и написанное руками
 * попадает в запрос наравне с выбранным. Отдельный модуль данных пополняется
 * без правки логики.
 */

/** Приборы кита, которые стенд умеет показать. Больше кит и не умеет. */
export type Instrument =
  | 'slider' | 'readout' | 'chart' | 'formula' | 'presets' | 'steps'
  | 'lesson' | 'task' | 'table';

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
  /** Узнаваемый закон раздела для панели формулы (TeX). */
  tex: string;
  /** Что рисует график и что показывает табло. */
  quantity: string;
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
    tex: 'T = 2\\pi\\sqrt{l/g}',
    quantity: 'Энергия',
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
    tex: 'n_1\\sin\\alpha = n_2\\sin\\beta',
    quantity: 'Освещённость',
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
    tex: 'pV = \\nu RT',
    quantity: 'Давление',
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
    tex: 'F = k\\dfrac{q_1 q_2}{r^2}',
    quantity: 'Напряжённость',
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
    tex: '\\langle E \\rangle = \\tfrac{3}{2}kT',
    quantity: 'Скорости',
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
    tex: 'T^2 \\sim a^3',
    quantity: 'Расстояние',
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
    tex: 'v = k[A][B]',
    quantity: 'Концентрация',
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
    tex: 'O(n\\log n)',
    quantity: 'Сравнений',
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
    tex: "f'(x_0) = \\lim_{\\Delta x \\to 0}\\dfrac{\\Delta f}{\\Delta x}",
    quantity: 'Значение',
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
    tex: '\\dfrac{dN}{dt} = rN\\left(1-\\dfrac{N}{K}\\right)',
    quantity: 'Численность',
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
    tex: '\\varepsilon = 23{,}5^\\circ',
    quantity: 'Освещённость',
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
  { value: 'lesson', label: 'Шаги урока', hint: 'наблюдай → измени → измерь' },
  { value: 'task', label: 'Задание', hint: 'вопрос с проверкой ответа' },
  { value: 'table', label: 'Таблица', hint: 'ученик записывает точки опыта' },
];

export function sectionByKey(key: string): Section | undefined {
  return SECTIONS.find((s) => s.key === key);
}

/* ------------------------- переводы подсказок стенда ------------------------- */

/**
 * Подписи разделов на казахском и английском. Основная таблица выше — русская:
 * её читают запрос к модели и подбор примеров. Здесь только то, что видит человек.
 */
export interface SectionText { label: string; phenomena: string[]; parameters: string[]; quantity: string }

const SECTION_TEXT: Record<'kk' | 'en', Record<string, SectionText>> = {
  kk: {
    mechanics: {
      label: 'Механика',
      phenomena: ['математикалық маятник', 'еркін түсу', 'көлбеу жазықтық бойымен қозғалыс', 'шарлардың соқтығысуы', 'айналу және центрден тепкіш күш', 'серіппелі осциллятор'],
      parameters: ['масса', 'ұзындық', 'бұрыш', 'бастапқы жылдамдық', 'үйкеліс коэффициенті', 'серіппе қатаңдығы'],
      quantity: 'Энергия',
    },
    optics: {
      label: 'Оптика',
      phenomena: ['сәуленің сынуы', 'шағылу және айналар', 'линза және кескін салу', 'призмадағы дисперсия', 'интерференция', 'саңылаудағы дифракция'],
      parameters: ['сыну көрсеткіші', 'түсу бұрышы', 'фокус аралығы', 'толқын ұзындығы', 'саңылау ені', 'экранға дейінгі қашықтық'],
      quantity: 'Жарықтану',
    },
    thermo: {
      label: 'Термодинамика',
      phenomena: ['жылу беру', 'Карно циклі', 'газдың ұлғаюы', 'фазалық ауысу', 'конвекция', 'стерженнің жылу өткізгіштігі'],
      parameters: ['температура', 'қысым', 'көлем', 'жылу сыйымдылығы', 'зат массасы', 'қыздыру қуаты'],
      quantity: 'Қысым',
    },
    electro: {
      label: 'Электр',
      phenomena: ['нүктелік зарядтардың өрісі', 'конденсатор', 'тізбектегі ток', 'өткізгіштің магнит өрісі', 'электромагниттік индукция', 'Лоренц күші'],
      parameters: ['заряд', 'зарядтар арасындағы қашықтық', 'кернеу', 'кедергі', 'ток күші', 'магнит өрісінің индукциясы'],
      quantity: 'Кернеулік',
    },
    molecular: {
      label: 'Молекулалық физика',
      phenomena: ['диффузия', 'броундық қозғалыс', 'идеал газ', 'осмос', 'булану', 'молекулалардың жылдамдықтар бойынша таралуы'],
      parameters: ['температура', 'бөлшектер саны', 'концентрация', 'ыдыс көлемі', 'молекула массасы', 'қысым'],
      quantity: 'Жылдамдықтар',
    },
    astro: {
      label: 'Астрономия',
      phenomena: ['жер серігінің орбитасы', 'Кеплер заңдары', 'Айдың фазалары', 'Күннің тұтылуы', 'толысулар', 'гравитациялық линза'],
      parameters: ['орталық дененің массасы', 'ұшыру жылдамдығы', 'орбита радиусы', 'эксцентриситет', 'орбитаның көлбеулігі', 'уақыт масштабы'],
      quantity: 'Қашықтық',
    },
    chemistry: {
      label: 'Химия',
      phenomena: ['реакция жылдамдығы', 'химиялық тепе-теңдік', 'титрлеу', 'электролиз', 'кристалдық тор', 'молекула геометриясы'],
      parameters: ['концентрация', 'температура', 'катализатор', 'титрант көлемі', 'қышқылдық (pH)', 'қысым'],
      quantity: 'Концентрация',
    },
    cs: {
      label: 'Информатика',
      phenomena: ['массивті сұрыптау', 'графтағы жолды іздеу', 'екілік іздеу', 'рекурсия және шақырулар ағашы', 'жасушалық автомат', 'перцептрон', 'хеш-кесте'],
      parameters: ['массив өлшемі', 'бастапқы рет', 'қадам жылдамдығы', 'рекурсия негізі', 'автомат ережесі', 'оқу жылдамдығы'],
      quantity: 'Салыстырулар',
    },
    math: {
      label: 'Математика',
      phenomena: ['туынды жанама ретінде', 'векторлар және оларды қосу', 'Монте-Карло әдісі', 'Фурье қатарлары', 'тізбектің шегі', 'қисық астындағы аудан'],
      parameters: ['функция коэффициенті', 'нүктенің орны', 'қосылғыштар саны', 'сынақтар саны', 'бөлу қадамы', 'осьтер масштабы'],
      quantity: 'Мән',
    },
    biology: {
      label: 'Биология',
      phenomena: ['популяциялар динамикасы', 'нейронның әрекет потенциалы', 'фермент кинетикасы', 'белгілердің тұқым қуалауы', 'фотосинтез', 'жүректің жұмысы'],
      parameters: ['туу көрсеткіші', 'өлім көрсеткіші', 'орта сыйымдылығы', 'субстрат концентрациясы', 'тітіркендіргіш күші', 'жиілік'],
      quantity: 'Саны',
    },
    earth: {
      label: 'Жер туралы ғылымдар',
      phenomena: ['жыл мезгілдерінің ауысуы', 'литосфералық плиталар тектоникасы', 'судың табиғаттағы айналымы', 'су тасуы мен қайтуы', 'парник әсері', 'сейсмикалық толқындар'],
      parameters: ['ось көлбеулігі', 'ендік', 'жыл мезгілі', 'плиталар жылдамдығы', 'CO₂ концентрациясы', 'ошақ тереңдігі'],
      quantity: 'Жарықтану',
    },
  },
  en: {
    mechanics: {
      label: 'Mechanics',
      phenomena: ['simple pendulum', 'free fall', 'motion on an inclined plane', 'collision of balls', 'rotation and centrifugal force', 'spring oscillator'],
      parameters: ['mass', 'length', 'angle', 'initial velocity', 'friction coefficient', 'spring stiffness'],
      quantity: 'Energy',
    },
    optics: {
      label: 'Optics',
      phenomena: ['refraction of a ray', 'reflection and mirrors', 'lens and image formation', 'dispersion in a prism', 'interference', 'single-slit diffraction'],
      parameters: ['refractive index', 'angle of incidence', 'focal length', 'wavelength', 'slit width', 'distance to the screen'],
      quantity: 'Illuminance',
    },
    thermo: {
      label: 'Thermodynamics',
      phenomena: ['heat transfer', 'Carnot cycle', 'gas expansion', 'phase transition', 'convection', 'heat conduction in a rod'],
      parameters: ['temperature', 'pressure', 'volume', 'heat capacity', 'mass of substance', 'heating power'],
      quantity: 'Pressure',
    },
    electro: {
      label: 'Electricity',
      phenomena: ['field of point charges', 'capacitor', 'current in a circuit', 'magnetic field of a wire', 'electromagnetic induction', 'Lorentz force'],
      parameters: ['charge', 'distance between charges', 'voltage', 'resistance', 'current', 'magnetic flux density'],
      quantity: 'Field strength',
    },
    molecular: {
      label: 'Molecular physics',
      phenomena: ['diffusion', 'Brownian motion', 'ideal gas', 'osmosis', 'evaporation', 'molecular speed distribution'],
      parameters: ['temperature', 'number of particles', 'concentration', 'container volume', 'molecular mass', 'pressure'],
      quantity: 'Speeds',
    },
    astro: {
      label: 'Astronomy',
      phenomena: ['satellite orbit', 'Kepler’s laws', 'phases of the Moon', 'solar eclipse', 'tides', 'gravitational lensing'],
      parameters: ['central body mass', 'launch speed', 'orbit radius', 'eccentricity', 'orbital inclination', 'time scale'],
      quantity: 'Distance',
    },
    chemistry: {
      label: 'Chemistry',
      phenomena: ['reaction rate', 'chemical equilibrium', 'titration', 'electrolysis', 'crystal lattice', 'molecular geometry'],
      parameters: ['concentration', 'temperature', 'catalyst', 'titrant volume', 'acidity (pH)', 'pressure'],
      quantity: 'Concentration',
    },
    cs: {
      label: 'Computer science',
      phenomena: ['array sorting', 'pathfinding in a graph', 'binary search', 'recursion and the call tree', 'cellular automaton', 'perceptron', 'hash table'],
      parameters: ['array size', 'initial order', 'step speed', 'recursion base case', 'automaton rule', 'learning rate'],
      quantity: 'Comparisons',
    },
    math: {
      label: 'Mathematics',
      phenomena: ['derivative as a tangent', 'vectors and their addition', 'Monte Carlo method', 'Fourier series', 'limit of a sequence', 'area under a curve'],
      parameters: ['function coefficient', 'point position', 'number of terms', 'number of trials', 'partition step', 'axis scale'],
      quantity: 'Value',
    },
    biology: {
      label: 'Biology',
      phenomena: ['population dynamics', 'neuron action potential', 'enzyme kinetics', 'inheritance of traits', 'photosynthesis', 'how the heart works'],
      parameters: ['birth rate', 'death rate', 'carrying capacity', 'substrate concentration', 'stimulus strength', 'frequency'],
      quantity: 'Population',
    },
    earth: {
      label: 'Earth science',
      phenomena: ['change of seasons', 'plate tectonics', 'water cycle', 'tides', 'greenhouse effect', 'seismic waves'],
      parameters: ['axial tilt', 'latitude', 'season', 'plate speed', 'CO₂ concentration', 'focal depth'],
      quantity: 'Illuminance',
    },
  },
};

/** Раздел с подписями на языке интерфейса; ключ, мотив, приборы и формула — те же. */
export function localizeSection(section: Section, locale: 'ru' | 'kk' | 'en'): Section {
  if (locale === 'ru') return section;
  const text = SECTION_TEXT[locale][section.key];
  return text ? { ...section, ...text } : section;
}

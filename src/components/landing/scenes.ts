import type { Locale } from '@/i18n/config';

/** Размер фоновых картинок первого экрана: координаты объектов ниже — в их пикселях. */
export const IW = 1672;
export const IH = 941;

type Tri = Record<Locale, string>;
const tri = (ru: string, kk: string, en: string): Tri => ({ ru, kk, en });
/** Значение, одинаковое на всех языках (числа, единицы СИ). */
const same = (v: string): Tri => ({ ru: v, kk: v, en: v });

export interface Spot { key: string; cx: number; cy: number; r: number; name: Tri; kind: Tri; facts: [Tri, Tri][] }
export interface Scene { key: string; img: string; c1: string; c2: string; stars?: boolean; label: Tri; word: Tri; hint: Tri; spots: Spot[] }

const S = (key: string, name: Tri, kind: Tri, cx: number, cy: number, r: number, facts: [Tri, Tri][]): Spot =>
  ({ key, name, kind, cx, cy, r, facts });

const toSun = tri('До Солнца', 'Күнге дейін', 'From the Sun');
const year = tri('Год', 'Жыл', 'Year');
const moons = tri('Спутники', 'Серіктері', 'Moons');
const diameter = tri('Диаметр', 'Диаметрі', 'Diameter');
const material = tri('Материал', 'Материалы', 'Material');
const size = tri('Размер', 'Өлшемі', 'Size');
const temp = tri('Температура', 'Температура', 'Temperature');
const planet = tri('Планета', 'Планета', 'Planet');

/**
 * Сцены первого экрана. Фоны физики и инженерии в макете названы наоборот
 * (bg-eng — оптика, bg-phys — двигатель), поэтому имена файлов не совпадают с ключами.
 */
export const SCENES: Scene[] = [
  {
    key: 'space', img: '/landing/bg-space.webp', c1: '#6E9BFF', c2: '#A68BFF', stars: true,
    label: tri('Космос', 'Ғарыш', 'Space'), word: tri('космос', 'ғарышты', 'space'),
    hint: tri('Наведи на объект', 'Нысанға меңзерді апар', 'Hover over an object'),
    spots: [
      S('sun', tri('Солнце', 'Күн', 'Sun'), tri('Звезда', 'Жұлдыз', 'Star'), 1570, 253, 45, [
        [diameter, tri('1,39 млн км', '1,39 млн км', '1.39 million km')], [temp, same('5 500 °C')],
        [tri('Возраст', 'Жасы', 'Age'), tri('4,6 млрд лет', '4,6 млрд жыл', '4.6 billion years')]]),
      S('moon', tri('Луна', 'Ай', 'Moon'), tri('Спутник', 'Серік', 'Moon'), 1165, 185, 36, [
        [tri('До Земли', 'Жерге дейін', 'From Earth'), same('384 400 km')], [diameter, same('3 474 km')],
        [tri('Оборот', 'Айналымы', 'Orbit'), tri('27,3 дня', '27,3 тәулік', '27.3 days')]]),
      S('earth', tri('Земля', 'Жер', 'Earth'), planet, 1320, 470, 130, [
        [toSun, tri('149,6 млн км', '149,6 млн км', '149.6 million km')], [year, tri('365,25 дней', '365,25 тәулік', '365.25 days')], [moons, same('1')]]),
      S('atm', tri('Атмосфера', 'Атмосфера', 'Atmosphere'), tri('Оболочка Земли', 'Жер қабығы', 'Earth\'s envelope'), 1000, 404, 38, [
        [tri('Толщина', 'Қалыңдығы', 'Thickness'), tri('≈100 км', '≈100 км', '≈100 km')], [tri('Состав', 'Құрамы', 'Composition'), same('N₂ 78 % · O₂ 21 %')],
        [tri('Давление', 'Қысым', 'Pressure'), same('101 kPa')]]),
    ],
  },
  {
    key: 'phys', img: '/landing/bg-eng.webp', c1: '#7FD3FF', c2: '#B58CFF',
    label: tri('Физика', 'Физика', 'Physics'), word: tri('свет', 'жарықты', 'light'),
    hint: tri('Наведи на прибор', 'Құралға меңзерді апар', 'Hover over an instrument'),
    spots: [
      S('lens', tri('Линза', 'Линза', 'Lens'), tri('Оптика · фокусировка', 'Оптика · фокустау', 'Optics · focusing'), 930, 135, 105, [
        [tri('Фокус', 'Фокус', 'Focal length'), same('200 mm')], [diameter, same('50 mm')],
        [tri('Тип', 'Түрі', 'Type'), tri('Двояковыпуклая', 'Екі жағы дөңес', 'Biconvex')]]),
      S('beam', tri('Белый свет', 'Ақ жарық', 'White light'), tri('Падающий луч', 'Түскен сәуле', 'Incident beam'), 1060, 182, 36, [
        [tri('Состав', 'Құрамы', 'Composition'), tri('Все цвета', 'Барлық түстер', 'All colours')], [tri('В стекле', 'Шыныда', 'In glass'), same('1,97·10⁸ m/s')],
        [tri('Закон', 'Заңы', 'Law'), tri('Снеллиуса', 'Снеллиус', 'Snell\'s')]]),
      S('prism', tri('Призма', 'Призма', 'Prism'), tri('Оптика · дисперсия', 'Оптика · дисперсия', 'Optics · dispersion'), 1222, 290, 112, [
        [material, tri('Стекло BK7', 'BK7 шыны', 'BK7 glass')], [tri('Показатель n', 'Сыну көрсеткіші n', 'Index n'), tri('1,517', '1,517', '1.517')],
        [tri('Угол', 'Бұрышы', 'Angle'), same('60°')]]),
      S('spectrum', tri('Спектр', 'Спектр', 'Spectrum'), tri('Видимый свет', 'Көрінетін жарық', 'Visible light'), 1500, 430, 95, [
        [tri('Диапазон', 'Ауқымы', 'Range'), same('380–750 nm')], [tri('Цветов', 'Түстер', 'Colours'), same('7')],
        [tri('Скорость', 'Жылдамдығы', 'Speed'), same('3·10⁸ m/s')]]),
    ],
  },
  {
    key: 'bio', img: '/landing/bg-bio.webp', c1: '#8FA8FF', c2: '#E08BFF',
    label: tri('Биология', 'Биология', 'Biology'), word: tri('жизнь', 'тіршілікті', 'life'),
    hint: tri('Наведи на объект', 'Нысанға меңзерді апар', 'Hover over an object'),
    spots: [
      S('dna', tri('ДНК', 'ДНҚ', 'DNA'), tri('Двойная спираль', 'Қос спираль', 'Double helix'), 1010, 320, 150, [
        [tri('Шаг спирали', 'Спираль қадамы', 'Helix pitch'), same('3,4 nm')],
        [tri('Пар оснований', 'Негіз жұптары', 'Base pairs'), tri('3,2 млрд', '3,2 млрд', '3.2 billion')], [diameter, same('2 nm')]]),
      S('ab', tri('Антитело', 'Антидене', 'Antibody'), tri('Белок · иммунитет', 'Ақуыз · иммунитет', 'Protein · immunity'), 1115, 140, 58, [
        [tri('Масса', 'Массасы', 'Mass'), same('150 kDa')], [tri('Цепей', 'Тізбектер', 'Chains'), same('4')], [tri('Класс', 'Класы', 'Class'), same('IgG')]]),
      S('nucleus', tri('Ядро', 'Ядро', 'Nucleus'), tri('Хранилище ДНК', 'ДНҚ қоймасы', 'DNA storage'), 1435, 300, 125, [
        [size, same('5–10 µm')], [tri('Хромосом', 'Хромосомалар', 'Chromosomes'), same('46')],
        [tri('Оболочка', 'Қабығы', 'Envelope'), tri('Двойная мембрана', 'Қос мембрана', 'Double membrane')]]),
      S('mito', tri('Митохондрия', 'Митохондрия', 'Mitochondrion'), tri('Энергия клетки', 'Жасуша энергиясы', 'Cell\'s power plant'), 1262, 265, 42, [
        [size, same('0,5–1 µm')], [tri('Производит', 'Өндіреді', 'Produces'), tri('АТФ', 'АТФ', 'ATP')],
        [tri('Своя ДНК', 'Өз ДНҚ-сы', 'Own DNA'), tri('Да, 37 генов', 'Иә, 37 ген', 'Yes, 37 genes')]]),
    ],
  },
  {
    key: 'eng', img: '/landing/bg-phys.webp', c1: '#7FB2FF', c2: '#FFB067',
    label: tri('Инженерия', 'Инженерия', 'Engineering'), word: tri('механику', 'механиканы', 'mechanics'),
    hint: tri('Наведи на узел', 'Түйінге меңзерді апар', 'Hover over a part'),
    spots: [
      S('fan', tri('Вентилятор', 'Желдеткіш', 'Fan'), tri('Турбореактивный двигатель', 'Турбореактивті қозғалтқыш', 'Turbofan engine'), 810, 340, 190, [
        [tri('Лопаток', 'Қалақтар', 'Blades'), same('24')], [tri('Обороты', 'Айналым', 'Speed'), tri('3 600 об/мин', '3 600 айн/мин', '3,600 rpm')],
        [tri('Тяга', 'Тартылыс', 'Thrust'), same('120 kN')]]),
      S('comp', tri('Компрессор', 'Компрессор', 'Compressor'), tri('Сжатие воздуха', 'Ауаны сығу', 'Air compression'), 1120, 330, 78, [
        [tri('Степень сжатия', 'Сығу дәрежесі', 'Pressure ratio'), same('40 : 1')], [tri('Ступеней', 'Сатылар', 'Stages'), same('13')],
        [tri('На выходе', 'Шығуда', 'Outlet'), same('600 °C')]]),
      S('comb', tri('Камера сгорания', 'Жану камерасы', 'Combustor'), tri('Горячая часть', 'Ыстық бөлік', 'Hot section'), 1345, 350, 88, [
        [temp, same('1 700 °C')], [tri('Давление', 'Қысым', 'Pressure'), tri('40 атм', '40 атм', '40 atm')],
        [tri('Топливо', 'Отын', 'Fuel'), tri('Керосин', 'Керосин', 'Kerosene')]]),
      S('turbine', tri('Турбина', 'Турбина', 'Turbine'), tri('Привод вентилятора', 'Желдеткіш жетегі', 'Fan drive'), 1500, 370, 72, [
        [tri('Лопатки', 'Қалақтар', 'Blades'), tri('Никелевый сплав', 'Никель қорытпасы', 'Nickel superalloy')], [temp, same('1 100 °C')],
        [tri('Обороты', 'Айналым', 'Speed'), tri('12 000 об/мин', '12 000 айн/мин', '12,000 rpm')]]),
    ],
  },
  {
    key: 'chem', img: '/landing/bg-chem.webp', c1: '#7FE0D0', c2: '#9C8BFF',
    label: tri('Химия', 'Химия', 'Chemistry'), word: tri('вещество', 'затты', 'matter'),
    hint: tri('Наведи на объект', 'Нысанға меңзерді апар', 'Hover over an object'),
    spots: [
      S('flask', tri('Круглодонная колба', 'Дөңгелек түпті колба', 'Round-bottom flask'), tri('Нагрев раствора', 'Ерітіндіні қыздыру', 'Heating a solution'), 1067, 295, 105, [
        [tri('Объём', 'Көлемі', 'Volume'), same('500 ml')], [material, tri('Боросиликатное стекло', 'Боросиликат шыны', 'Borosilicate glass')],
        [tri('Выдерживает', 'Шыдайды', 'Withstands'), same('500 °C')]]),
      S('burner', tri('Горелка', 'Жанарғы', 'Burner'), tri('Пламя газа', 'Газ жалыны', 'Gas flame'), 1062, 450, 52, [
        [tri('Голубое пламя', 'Көк жалын', 'Blue flame'), same('≈1 500 °C')], [tri('Топливо', 'Отын', 'Fuel'), tri('Пропан', 'Пропан', 'Propane')],
        [tri('Горение', 'Жану', 'Combustion'), tri('Полное', 'Толық', 'Complete')]]),
      S('tubes', tri('Пробирки', 'Пробиркалар', 'Test tubes'), tri('Растворы солей', 'Тұз ерітінділері', 'Salt solutions'), 1448, 380, 105, [
        [tri('Зелёный', 'Жасыл', 'Green'), same('NiCl₂')], [tri('Оранжевый', 'Сарғылт', 'Orange'), same('K₂Cr₂O₇')],
        [tri('Фиолетовый', 'Күлгін', 'Violet'), same('KMnO₄')]]),
      S('h2o', tri('Молекула воды', 'Су молекуласы', 'Water molecule'), same('H₂O'), 1418, 600, 64, [
        [tri('Угол связи', 'Байланыс бұрышы', 'Bond angle'), same('104,5°')], [tri('Длина связи', 'Байланыс ұзындығы', 'Bond length'), same('96 pm')],
        [tri('Молярная масса', 'Молярлық масса', 'Molar mass'), same('18 g/mol')]]),
    ],
  },
  {
    key: 'math', img: '/landing/bg-math.webp', c1: '#FFD08A', c2: '#8FAEFF',
    label: tri('Математика', 'Математика', 'Mathematics'), word: tri('числа', 'сандарды', 'numbers'),
    hint: tri('Наведи на объект', 'Нысанға меңзерді апар', 'Hover over an object'),
    spots: [
      S('parabola', tri('Парабола', 'Парабола', 'Parabola'), tri('График функции', 'Функция графигі', 'Function graph'), 1078, 160, 110, [
        [tri('Уравнение', 'Теңдеуі', 'Equation'), same('y = x²')], [tri('Вершина', 'Төбесі', 'Vertex'), same('(0; 0)')],
        [tri('Где встречается', 'Қайда кездеседі', 'Found in'), tri('Траектория броска', 'Лақтыру траекториясы', 'Projectile path')]]),
      S('cube', tri('Куб', 'Куб', 'Cube'), tri('Правильный многогранник', 'Дұрыс көпжақ', 'Regular polyhedron'), 1140, 445, 95, [
        [tri('Граней', 'Жақтары', 'Faces'), same('6')], [tri('Рёбер', 'Қырлары', 'Edges'), same('12')], [tri('Объём', 'Көлемі', 'Volume'), same('V = a³')]]),
      S('shell', tri('Раковина наутилуса', 'Наутилус қабыршағы', 'Nautilus shell'), tri('Логарифмическая спираль', 'Логарифмдік спираль', 'Logarithmic spiral'), 1318, 512, 70, [
        [tri('Рост витка', 'Орам өсуі', 'Growth per turn'), same('≈ ×3')], [tri('Форма', 'Пішіні', 'Shape'), same('r = a·eᵇᶿ')],
        [tri('Родня', 'Туыстары', 'Related to'), tri('Числа Фибоначчи', 'Фибоначчи сандары', 'Fibonacci numbers')]]),
      S('sphere', tri('Шар', 'Шар', 'Sphere'), tri('Тело вращения', 'Айналу денесі', 'Solid of revolution'), 1505, 470, 82, [
        [tri('Объём', 'Көлемі', 'Volume'), same('V = 4/3·πr³')], [tri('Площадь', 'Ауданы', 'Area'), same('S = 4πr²')],
        [tri('Особенность', 'Ерекшелігі', 'Property'), tri('Минимум площади', 'Ең аз аудан', 'Least surface')]]),
    ],
  },
  {
    key: 'cs', img: '/landing/bg-cs.webp', c1: '#7FD3FF', c2: '#7CF0B0',
    label: tri('Информатика', 'Информатика', 'Computing'), word: tri('код', 'кодты', 'code'),
    hint: tri('Наведи на объект', 'Нысанға меңзерді апар', 'Hover over an object'),
    spots: [
      S('cpu', tri('Процессор', 'Процессор', 'Processor'), tri('Мозг компьютера', 'Компьютер миы', 'The computer\'s brain'), 1290, 440, 78, [
        [tri('Транзисторов', 'Транзисторлар', 'Transistors'), tri('≈ 20 млрд', '≈ 20 млрд', '≈ 20 billion')], [tri('Частота', 'Жиілігі', 'Clock'), same('5 GHz')],
        [tri('Техпроцесс', 'Техпроцесс', 'Process node'), same('3 nm')]]),
      S('ram', tri('Оперативная память', 'Жедел жад', 'Memory (RAM)'), tri('Рабочие данные', 'Жұмыс деректері', 'Working data'), 1500, 455, 72, [
        [tri('Объём модуля', 'Модуль көлемі', 'Module size'), same('32 GB')], [tri('Скорость', 'Жылдамдығы', 'Speed'), same('6 400 MT/s')],
        [tri('Без питания', 'Қуатсыз', 'Without power'), tri('Стирается', 'Өшеді', 'Erased')]]),
      S('fiber', tri('Оптоволокно', 'Оптикалық талшық', 'Optical fiber'), tri('Передача светом', 'Жарықпен беру', 'Data as light'), 1400, 215, 88, [
        [tri('Скорость сигнала', 'Сигнал жылдамдығы', 'Signal speed'), same('≈ 200 000 km/s')], [tri('Толщина жилы', 'Тал қалыңдығы', 'Core'), same('9 µm')],
        [tri('Принцип', 'Принципі', 'Principle'), tri('Полное отражение', 'Толық шағылу', 'Total reflection')]]),
      S('rack', tri('Серверная стойка', 'Сервер тірегі', 'Server rack'), tri('Дата-центр', 'Дата-орталық', 'Data centre'), 950, 130, 85, [
        [tri('Серверов', 'Серверлер', 'Servers'), tri('до 42', '42-ге дейін', 'up to 42')], [tri('Мощность', 'Қуаты', 'Power'), same('≈ 10 kW')],
        [tri('Работает', 'Жұмыс істейді', 'Uptime'), same('24/7')]]),
    ],
  },
];

/** Дисциплины под первым экраном; scene — индекс сцены, null — раздел ещё не готов. */
/** Каждая дисциплина переключает сцену первого экрана; scene: null — вела бы в витрину с фильтром по предмету. */
export const DISCIPLINES: { img: string; scene: number | null; name: Tri; subject?: Tri }[] = [
  { img: '/landing/disc-astro.webp', scene: 0, name: tri('Астрономия', 'Астрономия', 'Astronomy') },
  { img: '/landing/disc-phys.webp', scene: 1, name: tri('Физика', 'Физика', 'Physics') },
  { img: '/landing/disc-bio.webp', scene: 2, name: tri('Биология', 'Биология', 'Biology') },
  { img: '/landing/disc-eng.webp', scene: 3, name: tri('Инженерия', 'Инженерия', 'Engineering') },
  { img: '/landing/disc-chem.webp', scene: 4, name: tri('Химия', 'Химия', 'Chemistry') },
  { img: '/landing/disc-math.webp', scene: 5, name: tri('Математика', 'Математика', 'Math') },
  { img: '/landing/disc-cs.webp', scene: 6, name: tri('Информатика', 'Информатика', 'Computing') },
];

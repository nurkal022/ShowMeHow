/**
 * Встроенные VR-лаборатории. Сцены статичны и лежат в public/labs,
 * поэтому список — константа, а не таблица в базе: таблица появится вместе
 * с генерацией лабораторий. Четыре написаны руками, «нефтешлам» собирается
 * Vite из labs-src/oil-sludge (npm run build там же).
 */
export interface LabEntry {
  slug: string;
  title: string;
  subject: string;
  /** Что зритель увидит и сделает — одной-двумя фразами для карточки. */
  blurb: string;
  stations: string[];
  /** Подписи на казахском и английском; русские поля выше — исходные и запасные. */
  i18n?: Partial<Record<'kk' | 'en', LabText>>;
}

export interface LabText { title: string; subject: string; blurb: string; stations: string[] }

export const LABS: LabEntry[] = [
  {
    slug: 'biology', title: 'Внутри клетки', subject: 'Биология',
    blurb: 'Клетка живёт: мРНК выходит из ядра, рибосома собирает белок, везикула несёт его к мембране. Рядом — ДНК в три метра: расплетите и запустите транскрипцию.',
    stations: ['Клетка изнутри', 'Двойная спираль'],
    i18n: {
      kk: {
        title: 'Жасуша ішінде', subject: 'Биология',
        blurb: 'Жасуша тірі: мРНҚ ядродан шығады, рибосома ақуыз құрастырады, везикула оны мембранаға жеткізеді. Қасында — үш метрлік ДНҚ: оны тарқатып, транскрипцияны іске қосыңыз.',
        stations: ['Жасуша іші', 'Қос спираль'],
      },
      en: {
        title: 'Inside the cell', subject: 'Biology',
        blurb: 'The cell is alive: mRNA leaves the nucleus, a ribosome assembles a protein, a vesicle carries it to the membrane. Next to it is three metres of DNA: unwind it and start transcription.',
        stations: ['Inside the cell', 'Double helix'],
      },
    },
  },
  {
    slug: 'physics', title: 'Оптический стол', subject: 'Физика',
    blurb: 'Лазер, призма, линза и зеркало двигаются руками, луч виден в воздухе и раскладывается в спектр. Во второй комнате — броски при разной гравитации.',
    stations: ['Оптический стол', 'Гравитационная комната'],
    i18n: {
      kk: {
        title: 'Оптикалық үстел', subject: 'Физика',
        blurb: 'Лазерді, призманы, линзаны және айнаны қолмен жылжытуға болады, сәуле ауада көрінеді және спектрге жіктеледі. Екінші бөлмеде — әртүрлі гравитациядағы лақтырулар.',
        stations: ['Оптикалық үстел', 'Гравитация бөлмесі'],
      },
      en: {
        title: 'Optical bench', subject: 'Physics',
        blurb: 'Move the laser, prism, lens and mirror by hand; the beam is visible in the air and splits into a spectrum. In the second room — throws under different gravity.',
        stations: ['Optical bench', 'Gravity room'],
      },
    },
  },
  {
    slug: 'chemistry', title: 'Стол реакций', subject: 'Химия',
    blurb: 'Реагенты с полки льются в колбу: смена цвета, осадок, пузыри, пена. Соли металлов красят пламя горелки.',
    stations: ['Колба и реагенты', 'Пламя'],
    i18n: {
      kk: {
        title: 'Реакциялар үстелі', subject: 'Химия',
        blurb: 'Сөредегі реагенттер колбаға құйылады: түстің өзгеруі, тұнба, көпіршіктер, көбік. Металл тұздары жанарғы жалынын бояйды.',
        stations: ['Колба және реагенттер', 'Жалын'],
      },
      en: {
        title: 'Reaction bench', subject: 'Chemistry',
        blurb: 'Reagents from the shelf pour into a flask: colour changes, precipitate, bubbles, foam. Metal salts colour the burner flame.',
        stations: ['Flask and reagents', 'Flame'],
      },
    },
  },
  {
    slug: 'informatics', title: 'Зал алгоритмов', subject: 'Информатика',
    blurb: 'Четыре сортировки по шагам и гонка пузырька против быстрой; обход графа в ширину и в глубину; дерево поиска растёт на глазах.',
    stations: ['Сортировки', 'Обход графа', 'Дерево поиска'],
    i18n: {
      kk: {
        title: 'Алгоритмдер залы', subject: 'Информатика',
        blurb: 'Төрт сұрыптау қадам бойынша және көпіршік пен жылдам сұрыптаудың жарысы; графты еніне және тереңдігіне қарай аралау; іздеу ағашы көз алдыңызда өседі.',
        stations: ['Сұрыптаулар', 'Графты аралау', 'Іздеу ағашы'],
      },
      en: {
        title: 'Algorithm hall', subject: 'Computer science',
        blurb: 'Four sorting algorithms step by step and a race of bubble sort against quicksort; breadth-first and depth-first graph traversal; a search tree grows before your eyes.',
        stations: ['Sorting', 'Graph traversal', 'Search tree'],
      },
    },
  },
  {
    slug: 'oil-sludge', title: 'Термообработка нефтешлама', subject: 'Химическая технология',
    blurb: 'Куб нефтешлама прогревается потоком горячего воздуха: пар, капли нефти, кокс и тепловизор считает 3D-модель тепломассопереноса. Ставьте термопары, крутите T₀ и U₀, проходите шесть лабораторных работ.',
    stations: ['Установка с феном', 'Приборы и графики', 'Лабораторные работы'],
    i18n: {
      kk: {
        title: 'Мұнай шламын термиялық өңдеу', subject: 'Химиялық технология',
        blurb: 'Мұнай шламының текшесі ыстық ауа ағынымен қызады: бу, мұнай тамшылары, кокс пен тепловизорды жылу-масса алмасудың 3D-моделі есептейді. Термопараларды қойып, T₀ мен U₀-ды өзгертіп, алты зертханалық жұмысты орындаңыз.',
        stations: ['Фені бар қондырғы', 'Аспаптар мен графиктер', 'Зертханалық жұмыстар'],
      },
      en: {
        title: 'Oil sludge heat treatment', subject: 'Chemical engineering',
        blurb: 'A cube of oil sludge is heated by a hot air stream: steam, oil drops, coke and a thermal camera are computed by a 3D heat and mass transfer model. Place thermocouples, adjust T₀ and U₀ and work through six lab assignments.',
        stations: ['Heater rig', 'Instruments and charts', 'Lab assignments'],
      },
    },
  },
  {
    slug: 'climate', title: 'Климатическая станция', subject: 'Экология · климат',
    blurb: 'Под стеклянным куполом солнечный свет греет землю, а молекулы CO₂ и пара возвращают тепло: добавляйте газ из баллонов и смотрите на термометр и график. Рядом — ледник тает от рычага, море поднимается и затапливает прибрежный город.',
    stations: ['Парниковый эффект', 'Ледник и океан'],
    i18n: {
      kk: {
        title: 'Климаттық станция', subject: 'Экология · климат',
        blurb: 'Шыны күмбездің астында күн сәулесі жерді жылытады, ал CO₂ және бу молекулалары жылуды кері қайтарады: баллондардан газ қосып, термометр мен графикті бақылаңыз. Қасында — тұтқаны бұрасаңыз, мұздық ериді, теңіз деңгейі көтеріліп, жағалаудағы қаланы су басады.',
        stations: ['Парниктік әсер', 'Мұздық және мұхит'],
      },
      en: {
        title: 'Climate station', subject: 'Ecology · climate',
        blurb: 'Under a glass dome sunlight warms the ground while CO₂ and water vapour molecules send heat back: add gas from the canisters and watch the thermometer and chart. Next to it a lever melts the glacier, the sea rises and floods a coastal town.',
        stations: ['Greenhouse effect', 'Glacier and ocean'],
      },
    },
  },
  {
    slug: 'astronomy', title: 'Солнечная система', subject: 'Астрономия',
    blurb: 'Настольный планетарий: восемь планет идут по орбитам с настоящими периодами, время можно ускорить или остановить, а любую планету — взять в руку и узнать её радиус, год и расстояние. Рядом — стенд затмений: ведите Луну и смотрите, как её тень падает на Землю.',
    stations: ['Планетарий', 'Затмения'],
    i18n: {
      kk: {
        title: 'Күн жүйесі', subject: 'Астрономия',
        blurb: 'Үстел үстіндегі планетарий: сегіз планета нақты периодтарымен орбита бойынша жүреді, уақытты жылдамдатуға немесе тоқтатуға болады, ал кез келген планетаны қолға алып, оның радиусын, жылын және қашықтығын білуге болады. Қасында — тұтылу стенді: Айды жылжытып, оның көлеңкесі Жерге қалай түсетінін көріңіз.',
        stations: ['Планетарий', 'Тұтылулар'],
      },
      en: {
        title: 'Solar system', subject: 'Astronomy',
        blurb: 'A tabletop orrery: eight planets travel their orbits with real periods, time can be sped up or paused, and any planet can be picked up to reveal its radius, year and distance. Next to it is an eclipse rig: move the Moon and watch its shadow fall on the Earth.',
        stations: ['Orrery', 'Eclipses'],
      },
    },
  },
  {
    slug: 'electricity', title: 'Электрический стол', subject: 'Физика · электричество',
    blurb: 'Соберите цепь руками: батарейка, лампы, резисторы, ключ и провода встают в гнёзда платы, лампы горят по мощности, по проводам бегут электроны, мультиметр показывает U и I. Во второй комнате магнит проходит сквозь катушку — стрелка гальванометра отклоняется.',
    stations: ['Электрический стол', 'Индукция'],
    i18n: {
      kk: {
        title: 'Электр үстелі', subject: 'Физика · электр',
        blurb: 'Тізбекті қолмен құрастырыңыз: батарея, шамдар, резисторлар, кілт және сымдар тақта ұяларына орнатылады, шамдар қуатына қарай жанады, сымдармен электрондар жүгіреді, мультиметр U мен I көрсетеді. Екінші бөлмеде магнит катушка арқылы өтеді — гальванометр тілі ауытқиды.',
        stations: ['Электр үстелі', 'Индукция'],
      },
      en: {
        title: 'Circuit bench', subject: 'Physics · electricity',
        blurb: 'Build a circuit by hand: the battery, bulbs, resistors, switch and wires snap into the breadboard, bulbs glow by their power, electrons run along the wires, and a multimeter shows U and I. In the second room a magnet passes through a coil and the galvanometer needle swings.',
        stations: ['Circuit bench', 'Induction'],
      },
    },
  },
  {
    slug: 'anatomy', title: 'Сердце и кровоток', subject: 'Анатомия',
    blurb: 'Бьющееся сердце в руках: поверните его, откройте разрез — камеры сжимаются, клапаны хлопают, кровь течёт, а ЭКГ идёт в такт. Рядом — малый и большой круги: кровь краснеет в лёгких и синеет в органах.',
    stations: ['Сердце', 'Круги кровообращения'],
    i18n: {
      kk: {
        title: 'Жүрек және қан айналымы', subject: 'Анатомия',
        blurb: 'Соғып тұрған жүрек қолыңызда: оны бұрап, кесіндісін ашыңыз — қуыстар жиырылады, қақпақшалар жабылады, қан ағады, ал ЭКГ ырғақпен жүреді. Қасында — кіші және үлкен қан айналым шеңберлері: қан өкпеде қызарып, ағзаларда көгереді.',
        stations: ['Жүрек', 'Қан айналым шеңберлері'],
      },
      en: {
        title: 'Heart and circulation', subject: 'Anatomy',
        blurb: 'A beating heart in your hands: turn it, open the cutaway — chambers contract, valves snap shut, blood flows and the ECG keeps time. Next to it are the pulmonary and systemic circuits: blood turns red in the lungs and blue in the organs.',
        stations: ['Heart', 'Circulatory circuits'],
      },
    },
  },
  {
    slug: 'geology', title: 'Недра Земли', subject: 'География · геология',
    blurb: 'Метровый глобус раскрывается в разрезе: кора, мантия с конвекцией, жидкое и твёрдое ядро с глубинами и температурами. Рычаг двигает плиты — растут горы, раскрывается рифт с лавой, сдвиг срывается землетрясением на сейсмографе. Вулкан извергается, когда давление в очаге дойдёт до предела.',
    stations: ['Недра Земли', 'Тектоника', 'Вулкан'],
    i18n: {
      kk: {
        title: 'Жер қойнауы', subject: 'География · геология',
        blurb: 'Метрлік глобус қимада ашылады: қыртыс, конвекциясы бар мантия, сұйық және қатты ядро — тереңдігі мен температурасы көрсетілген. Тұтқа плиталарды қозғайды: таулар өседі, лавасы бар рифт ашылады, жылжу сейсмографта жер сілкінісіне айналады. Ошақтағы қысым шегіне жеткенде жанартау атқылайды.',
        stations: ['Жер қойнауы', 'Тектоника', 'Жанартау'],
      },
      en: {
        title: 'Inside the Earth', subject: 'Geography · geology',
        blurb: 'A one-metre globe opens in a cutaway: crust, a convecting mantle, the liquid and solid core with depths and temperatures. A lever moves the plates — mountains rise, a rift opens with lava, a fault slips into an earthquake on the seismograph. The volcano erupts when pressure in the chamber peaks.',
        stations: ['Inside the Earth', 'Tectonics', 'Volcano'],
      },
    },
  },
];

/** Лаборатория с подписями на языке интерфейса (русский — по умолчанию и запасной). */
export function localizeLab(lab: LabEntry, locale: 'ru' | 'kk' | 'en' = 'ru'): LabEntry {
  const text = locale === 'ru' ? undefined : lab.i18n?.[locale];
  return text ? { ...lab, ...text } : lab;
}

/** Весь список на нужном языке. */
export function labsFor(locale: 'ru' | 'kk' | 'en' = 'ru'): LabEntry[] {
  return LABS.map((lab) => localizeLab(lab, locale));
}

export function labUrl(slug: string): string {
  return `/lab/${slug}`;
}

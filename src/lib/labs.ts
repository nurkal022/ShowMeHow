/**
 * Четыре встроенные VR-лаборатории. Сцены статичны и лежат в public/labs,
 * поэтому список — константа, а не таблица в базе: таблица появится вместе
 * с генерацией лабораторий.
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

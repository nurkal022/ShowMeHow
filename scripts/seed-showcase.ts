import { closeDb, db } from '../src/lib/db/client';
import {
  createLoginUser, createUser, findUserByIdentifier, setTemporaryPassword, updatePassword, updateProfile,
  type AuthUser,
} from '../src/lib/auth/users';
import { addMember, createOrganization, findOrgBySlug, updateOrgSettings } from '../src/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup, findGroupByTitle } from '../src/lib/org/groups';
import { savePendingCredential } from '../src/lib/org/credentials';
import { candidateLogin } from '../src/lib/org/roster';
import { bundledThumbnail, listBundledDemos } from '../src/lib/demos';
import { instrument } from '../src/lib/artifact';
import { createSimulation, saveThumbnail } from '../src/lib/storage';
import {
  createCourse, createTopic, recordTopicView, setCourseGroups, setCourseStatus, setTopicDue, setTopicFormat,
} from '../src/lib/lms/courses';
import { createBlock, getBlock, type Block } from '../src/lib/lms/blocks';
import { sanitizeBlockBody, type BlockKind } from '../src/lib/lms/block-schema';
import { saveAnswer } from '../src/lib/lms/submissions';
import { gradeSubmission, returnSubmission } from '../src/lib/lms/grading';
import type { Answer } from '../src/lib/lms/answers';
import { notify } from '../src/lib/notifications';
import { answersHref } from '../src/lib/lms/links';

/**
 * Витрина платформы: одна школа, два класса, один большой курс на всех форматах и
 * типах заданий и три недели «прожитой» учёбы — сдачи, оценки, комментарии, возвраты,
 * сроки, контрольная. Нужна для показа: графики, журнал, «Сегодня» и колокольчик живые.
 *
 * Повторный запуск курс и историю не дублирует, но переставляет пароли взрослым и
 * выдаёт ученикам новые временные. Взрослым пароль известный — поэтому в продакшне
 * запускается только с явным --allow-production.
 */

export const SHOWCASE_PASSWORD = 'tesseract-demo-2026';
const ORG = { slug: 'lyceum', name: 'Лицей «Тессеракт»', kind: 'school' };
const COURSE_TITLE = 'Физика 8: колебания, волны и свет';

const STAFF = {
  director: { email: 'director@lyceum.demo', name: 'Гульнара Ахметова' },
  physics: { email: 'physics@lyceum.demo', name: 'Айдар Сапаров' },
  second: { email: 'nurlan@lyceum.demo', name: 'Нурлан Беков' },
  chemistry: { email: 'chemistry@lyceum.demo', name: 'Жанна Омарова' },
};
const INFO_TITLE = 'Информатика 8: алгоритмы';
const CHEM_TITLE = 'Химия 8: признаки реакций';

const CLASS_A: [string, string][] = [
  ['Абенов', 'Алихан'], ['Белова', 'Софья'], ['Жумабаев', 'Ерлан'], ['Ким', 'Алина'], ['Касымова', 'Дана'],
  ['Лебедев', 'Артём'], ['Мухамедова', 'Аружан'], ['Нуржанов', 'Тимур'], ['Орлова', 'Мария'], ['Сейткали', 'Айбек'],
  ['Токаева', 'Мадина'], ['Шевченко', 'Максим'],
];
const CLASS_B: [string, string][] = [
  ['Ахметов', 'Даурен'], ['Волкова', 'Ева'], ['Есенова', 'Камила'], ['Ибраев', 'Санжар'], ['Козлов', 'Илья'],
  ['Нурланова', 'Айша'], ['Петров', 'Глеб'], ['Сарсенбаев', 'Амир'], ['Утегенова', 'Жания'], ['Яковлева', 'Полина'],
];

/** Ученик и его «характер»: насколько он старается и насколько точен. Одинаковый при каждом запуске. */
interface Kid { user: AuthUser; login: string; password: string; group: string; diligence: number; skill: number }

function rng(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}

async function staff(email: string, name: string): Promise<AuthUser> {
  const user = (await findUserByIdentifier(email)) ?? await createUser(email, SHOWCASE_PASSWORD);
  await updatePassword(user.id, SHOWCASE_PASSWORD);
  await updateProfile(user.id, { displayName: name });
  await db().query('UPDATE users SET disabled_at = NULL WHERE id = $1', [user.id]);
  return user;
}

async function demoSimulation(ownerId: string, slug: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>('SELECT id FROM simulations WHERE owner_id = $1 AND demo = $2', [ownerId, slug]);
  if (rows[0]) return rows[0].id;
  const demo = listBundledDemos().find((d) => d.slug === slug);
  if (!demo) throw new Error(`Встроенный пример «${slug}» не найден.`);
  const meta = await createSimulation(ownerId,
    { title: demo.title, prompt: demo.prompt, subject: demo.subject, tags: demo.tags, demo: demo.slug }, instrument(demo.html));
  const thumb = bundledThumbnail(slug);
  if (thumb) await saveThumbnail(ownerId, meta.id, thumb);
  return meta.id;
}

async function add(topicId: string, kind: BlockKind, payload: unknown): Promise<Block> {
  const body = sanitizeBlockBody(kind, payload);
  return createBlock(topicId, kind, { payload: body.payload });
}

const task = (prompt: string, spec: unknown, extra: Record<string, unknown> = {}) =>
  ({ prompt, points: 10, stand: null, allowRetry: false, explanation: '', rubric: [], spec, ...extra });

interface Built {
  courseId: string;
  topics: { id: string; kind: 'lesson' | 'slides' | 'exam'; blocks: Block[] }[];
}

async function buildCourse(orgId: string, teacherId: string, groupIds: string[], sims: Record<string, string>): Promise<Built> {
  const course = await createCourse({
    orgId, ownerId: teacherId, title: COURSE_TITLE, subject: 'Физика',
    description: 'От маятника до радуги: колебания, волны и свет — с тренажёрами, лабораторией в VR и живыми экспериментами. '
      + 'Каждая тема: короткое объяснение, опыт своими руками и задания с мгновенной проверкой.',
  });
  const built: Built = { courseId: course.id, topics: [] };

  /* ---------- 1. Колебания: урок со всеми материалами и автопроверкой ---------- */
  const t1 = await createTopic(course.id, 'Что такое колебания');
  const b1: Block[] = [];
  b1.push(await add(t1.id, 'text', {
    title: 'Движение, которое повторяется',
    body: 'Качели, струна гитары, сердце, маятник в часах — все они **колеблются**: '
      + 'возвращаются в одно и то же положение снова и снова.\n\n'
      + '## Главные величины\n- **Амплитуда** $A$ — наибольшее отклонение от равновесия.\n'
      + '- **Период** $T$ — время одного полного колебания, в секундах.\n'
      + '- **Частота** $\\nu = 1/T$ — сколько колебаний за секунду, в герцах.',
  }));
  b1.push(await add(t1.id, 'callout', {
    tone: 'definition', title: 'Определение',
    body: '**Математический маятник** — груз на невесомой нерастяжимой нити, размеры которого малы по сравнению с длиной нити.',
  }));
  b1.push(await add(t1.id, 'simulation', {
    simulationId: sims.pendulum, caption: 'Длина нити закреплена на 1 м. Меняйте амплитуду и затухание — период почти не меняется.',
    preset: { 'Длина нити': 1, 'Начальная амплитуда': 15 }, locked: ['Длина нити'],
  }));
  b1.push(await add(t1.id, 'formula', { latex: 'T = 2\\pi\\sqrt{\\dfrac{L}{g}}', caption: 'Период малых колебаний математического маятника' }));
  b1.push(await add(t1.id, 'callout', {
    tone: 'important', title: 'Запомните',
    body: 'Период маятника **не зависит от массы груза** и почти не зависит от амплитуды — если она небольшая (до 15–20°).',
  }));
  b1.push(await add(t1.id, 'spoiler', {
    title: 'Разобранная задача: часы на Луне',
    body: 'На Луне $g$ в 6 раз меньше. Под корнем $L/g$ станет в 6 раз больше, значит период вырастет в $\\sqrt{6} \\approx 2{,}45$ раза. '
      + 'Маятниковые часы на Луне будут **отставать**.',
  }));
  b1.push(await add(t1.id, 'assignment', task('От чего зависит период математического маятника?', {
    type: 'choice', multiple: false, shuffle: true, options: [
      { id: 'len', text: 'От длины нити', correct: true }, { id: 'mass', text: 'От массы груза', correct: false },
      { id: 'amp', text: 'От начальной амплитуды (при любой амплитуде)', correct: false }, { id: 'col', text: 'От материала нити', correct: false },
    ] }, { explanation: 'В формулу $T = 2\\pi\\sqrt{L/g}$ входят только длина нити и ускорение свободного падения.' })));
  b1.push(await add(t1.id, 'assignment', task('Найдите период маятника длиной 1 м. Ответ округлите до десятых. Можно взять значение пипеткой из тренажёра.', {
    type: 'number', answer: 2, tolerance: 0.1, unit: 'с' }, { allowRetry: true, stand: { kind: 'simulation', simulationId: sims.pendulum },
    explanation: '$T = 2\\pi\\sqrt{1/9{,}8} \\approx 2{,}0$ с.' })));
  b1.push(await add(t1.id, 'assignment', task('Заполните пропуски.', {
    type: 'gaps', text: 'Время одного полного колебания называют {{периодом}}. Если нить удлинить в 4 раза, период {{увеличится|вырастет}} в {{2|два}} раза.',
  }, { allowRetry: true })));
  b1.push(await add(t1.id, 'assignment', task('Соедините величину и единицу измерения.', {
    type: 'match', pairs: [
      { left: 'Период', right: 'секунда' }, { left: 'Частота', right: 'герц' },
      { left: 'Амплитуда', right: 'метр' }, { left: 'Ускорение свободного падения', right: 'м/с²' },
    ] })));
  built.topics.push({ id: t1.id, kind: 'lesson', blocks: b1 });

  /* ---------- 2. Лабораторная работа: таблица измерений, критерии, срок ---------- */
  const t2 = await createTopic(course.id, 'Лабораторная: как период зависит от длины');
  const b2: Block[] = [];
  b2.push(await add(t2.id, 'text', {
    title: 'Ход работы',
    body: '1. Поставьте в тренажёре амплитуду 10° и затухание 0.\n2. Меняйте длину нити: 0,25 · 0,5 · 1 · 1,5 · 2 м.\n'
      + '3. Для каждой длины запишите измеренный период — пипеткой из тренажёра.\n4. Посмотрите на график и сделайте вывод.',
  }));
  b2.push(await add(t2.id, 'simulation', {
    simulationId: sims.pendulum, caption: 'Стенд лабораторной работы', preset: { 'Начальная амплитуда': 10, 'Затухание': 0 }, locked: ['Затухание'],
  }));
  b2.push(await add(t2.id, 'assignment', task('Заполните таблицу: длина нити и измеренный период.', {
    type: 'table', columns: [{ label: 'Длина нити', unit: 'м' }, { label: 'Период', unit: 'с' }], minRows: 5,
  }, { rubric: [{ label: 'Не меньше пяти измерений', points: 4 }, { label: 'Значения правдоподобны', points: 3 }, { label: 'Единицы и точность', points: 3 }] })));
  b2.push(await add(t2.id, 'assignment', task('Сделайте вывод: как период зависит от длины нити? Опирайтесь на свой график.', {
    type: 'text' }, { rubric: [{ label: 'Вывод следует из данных', points: 5 }, { label: 'Упомянут корень из длины', points: 3 }, { label: 'Грамотно и по делу', points: 2 }],
    explanation: 'Период растёт медленнее длины: при удлинении в 4 раза он растёт вдвое, $T \\sim \\sqrt{L}$.' })));
  built.topics.push({ id: t2.id, kind: 'lesson', blocks: b2 });

  /* ---------- 3. Волны: слайды для урока у доски ---------- */
  const t3 = await createTopic(course.id, 'Волны и интерференция');
  await setTopicFormat(t3.id, 'slides', null);
  const b3: Block[] = [];
  b3.push(await add(t3.id, 'callout', {
    tone: 'info', title: 'Волна — это бегущее колебание',
    body: 'Каждая точка среды колеблется на месте, а **форма** колебания бежит дальше и переносит энергию, но не вещество.',
  }));
  b3.push(await add(t3.id, 'formula', { latex: '\\lambda = v \\cdot T = \\dfrac{v}{\\nu}', caption: 'Длина волны, скорость и частота' }));
  b3.push(await add(t3.id, 'simulation', {
    simulationId: sims.interference, caption: 'Два источника: где гребни совпадают — усиление, где гребень встречает впадину — тишина.',
    preset: {}, locked: [],
  }));
  b3.push(await add(t3.id, 'callout', {
    tone: 'example', title: 'Где это видно в жизни',
    body: '- Радужные разводы на мыльном пузыре\n- «Мёртвые зоны» Wi-Fi в квартире\n- Шумоподавляющие наушники',
  }));
  b3.push(await add(t3.id, 'assignment', task('Расставьте по порядку, как возникает интерференционная картина.', {
    type: 'order', items: [
      { text: 'Два источника колеблются с одинаковой частотой' }, { text: 'От каждого расходятся волны' },
      { text: 'Волны встречаются в каждой точке' }, { text: 'Где гребни совпадают — амплитуда растёт' },
      { text: 'Получаются полосы усиления и ослабления' },
    ] }, { allowRetry: true })));
  b3.push(await add(t3.id, 'assignment', task('Как называется сложение волн, при котором в одних местах они усиливают, а в других гасят друг друга?', {
    type: 'short', accepted: ['интерференция', 'интерференцией'] })));
  built.topics.push({ id: t3.id, kind: 'slides', blocks: b3 });

  /* ---------- 4. Свет: тренажёр, VR-лаборатория, развёрнутый ответ ---------- */
  const t4 = await createTopic(course.id, 'Свет: преломление и радуга');
  const b4: Block[] = [];
  b4.push(await add(t4.id, 'text', {
    title: 'Почему соломинка в стакане «ломается»',
    body: 'На границе двух сред свет меняет скорость — и направление. Это **преломление**. '
      + 'Разные цвета преломляются по-разному, поэтому призма раскладывает белый свет в радугу.',
  }));
  b4.push(await add(t4.id, 'formula', { latex: 'n_1 \\sin\\alpha = n_2 \\sin\\beta', caption: 'Закон Снелла' }));
  b4.push(await add(t4.id, 'simulation', {
    simulationId: sims.refraction, caption: 'Увеличивайте угол падения — найдите момент полного внутреннего отражения.', preset: { 'Угол падения': 30 }, locked: [],
  }));
  b4.push(await add(t4.id, 'lab', { slug: 'physics', caption: 'Оптический стол: соберите призму и линзу своими руками. В очках Quest — по QR-коду.' }));
  b4.push(await add(t4.id, 'divider', {}));
  b4.push(await add(t4.id, 'assignment', task('Что произойдёт с лучом, если он переходит из воды в воздух под очень большим углом?', {
    type: 'choice', multiple: false, shuffle: true, options: [
      { id: 'a', text: 'Полностью отразится обратно в воду', correct: true },
      { id: 'b', text: 'Пройдёт без изменения направления', correct: false },
      { id: 'c', text: 'Разложится в спектр и исчезнет', correct: false },
    ] }, { explanation: 'Больше критического угла свет не может выйти в менее плотную среду — это полное внутреннее отражение.' })));
  b4.push(await add(t4.id, 'assignment', task('Объясните своими словами, откуда берётся радуга после дождя.', { type: 'text' }, {
    stand: { kind: 'lab', slug: 'physics' }, rubric: [{ label: 'Преломление в капле', points: 4 }, { label: 'Разные цвета — разные углы', points: 4 }, { label: 'Ясно изложено', points: 2 }],
  })));
  built.topics.push({ id: t4.id, kind: 'lesson', blocks: b4 });

  /* ---------- 5. Контрольная с таймером ---------- */
  const t5 = await createTopic(course.id, 'Контрольная: колебания и волны');
  await setTopicFormat(t5.id, 'exam', 20);
  const b5: Block[] = [];
  b5.push(await add(t5.id, 'assignment', task('Маятник совершает 30 колебаний за 60 с. Чему равен период?', { type: 'number', answer: 2, tolerance: 0, unit: 'с' })));
  b5.push(await add(t5.id, 'assignment', task('Частота колебаний 5 Гц. Чему равен период?', { type: 'number', answer: 0.2, tolerance: 0.001, unit: 'с' })));
  b5.push(await add(t5.id, 'assignment', task('Длину нити маятника увеличили в 9 раз. Как изменился период?', {
    type: 'choice', multiple: false, shuffle: true, options: [
      { id: 'x3', text: 'Увеличился в 3 раза', correct: true }, { id: 'x9', text: 'Увеличился в 9 раз', correct: false },
      { id: 'd3', text: 'Уменьшился в 3 раза', correct: false }, { id: 'eq', text: 'Не изменился', correct: false },
    ] })));
  b5.push(await add(t5.id, 'assignment', task('Выберите все верные утверждения о волнах.', {
    type: 'choice', multiple: true, shuffle: true, options: [
      { id: 'e', text: 'Волна переносит энергию', correct: true }, { id: 'm', text: 'Волна переносит вещество', correct: false },
      { id: 'l', text: 'λ = v · T', correct: true }, { id: 'v', text: 'Звук распространяется в вакууме', correct: false },
    ] })));
  b5.push(await add(t5.id, 'assignment', task('Заполните пропуск.', { type: 'gaps', text: 'Единица частоты — {{герц|Гц}}.' })));
  built.topics.push({ id: t5.id, kind: 'exam', blocks: b5 });

  await setCourseGroups(course.id, groupIds, new Set(groupIds));
  await setCourseStatus(course.id, 'published');
  return built;
}

async function buildInformatics(orgId: string, teacherId: string, groupIds: string[]): Promise<Built> {
  const course = await createCourse({ orgId, ownerId: teacherId, title: INFO_TITLE, subject: 'Информатика',
    description: 'Сортировки, поиск и графы — руками в «Зале алгоритмов» и на коде. Считаем шаги и сравниваем, кто быстрее.' });
  const built: Built = { courseId: course.id, topics: [] };
  const t1 = await createTopic(course.id, 'Сортировка пузырьком');
  const b1: Block[] = [];
  b1.push(await add(t1.id, 'text', { title: 'Идея', body: 'Идём по массиву и **меняем соседей местами**, если левый больше правого. '
    + 'После первого прохода самый большой элемент «всплывает» в конец — как пузырёк.\n\n'
    + 'Для массива из $n$ элементов в худшем случае нужно около $n^2/2$ сравнений.' }));
  b1.push(await add(t1.id, 'code', { language: 'Python', code: 'def bubble_sort(a):\n    n = len(a)\n    for i in range(n - 1):\n        for j in range(n - 1 - i):\n            if a[j] > a[j + 1]:\n                a[j], a[j + 1] = a[j + 1], a[j]\n    return a' }));
  b1.push(await add(t1.id, 'lab', { slug: 'informatics', caption: 'Станция «Сортировки»: запустите гонку пузырька против быстрой сортировки.' }));
  b1.push(await add(t1.id, 'callout', { tone: 'warning', title: 'Частая ошибка', body: 'Во внутреннем цикле граница — `n - 1 - i`: хвост уже отсортирован, сравнивать его заново незачем.' }));
  b1.push(await add(t1.id, 'assignment', task('Расставьте состояния массива [5, 2, 4, 1] после каждого прохода пузырька.', {
    type: 'order', items: [{ text: '[5, 2, 4, 1]' }, { text: '[2, 4, 1, 5]' }, { text: '[2, 1, 4, 5]' }, { text: '[1, 2, 4, 5]' }] }, { allowRetry: true })));
  b1.push(await add(t1.id, 'assignment', task('Сколько сравнений сделает пузырёк на массиве из 5 элементов в худшем случае?', {
    type: 'number', answer: 10, tolerance: 0, unit: '' }, { explanation: '$4 + 3 + 2 + 1 = 10$ — сумма первых $n-1$ чисел.' })));
  built.topics.push({ id: t1.id, kind: 'lesson', blocks: b1 });

  const t2 = await createTopic(course.id, 'Двоичный поиск');
  await setTopicFormat(t2.id, 'slides', null);
  const b2: Block[] = [];
  b2.push(await add(t2.id, 'callout', { tone: 'info', title: 'Игра «угадай число»', body: 'Загадано число от 1 до 100. Каждый раз называем середину оставшегося отрезка — и отбрасываем половину.' }));
  b2.push(await add(t2.id, 'formula', { latex: '\\text{шагов} \\le \\lceil \\log_2 n \\rceil', caption: 'Для 100 чисел хватит 7 вопросов' }));
  b2.push(await add(t2.id, 'code', { language: 'Python', code: 'def binary_search(a, x):\n    lo, hi = 0, len(a) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if a[mid] == x:\n            return mid\n        if a[mid] < x:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1' }));
  b2.push(await add(t2.id, 'assignment', task('Сколько шагов двоичного поиска нужно в худшем случае для 1000 элементов?', {
    type: 'number', answer: 10, tolerance: 0, unit: '' })));
  b2.push(await add(t2.id, 'assignment', task('Соедините алгоритм и его сложность.', { type: 'match', pairs: [
    { left: 'Пузырёк', right: 'O(n²)' }, { left: 'Двоичный поиск', right: 'O(log n)' }, { left: 'Линейный поиск', right: 'O(n)' }] })));
  built.topics.push({ id: t2.id, kind: 'slides', blocks: b2 });

  const t3 = await createTopic(course.id, 'Графы: обход в ширину');
  const b3: Block[] = [];
  b3.push(await add(t3.id, 'text', { title: 'Волна по графу', body: 'Обход в ширину идёт **слоями**: сначала все соседи, потом соседи соседей. '
    + 'Так соцсеть считает «друзей друзей», а навигатор — кратчайший путь без весов.' }));
  b3.push(await add(t3.id, 'lab', { slug: 'informatics', caption: 'Станция «Обход графа»: сравните BFS и DFS на одном графе.' }));
  b3.push(await add(t3.id, 'assignment', task('Какая структура данных нужна для обхода в ширину?', { type: 'short', accepted: ['очередь', 'queue'] },
    { explanation: 'Очередь: кто раньше найден, тот раньше обработан — поэтому обход идёт слоями.' })));
  b3.push(await add(t3.id, 'assignment', task('Объясните, чем обход в глубину отличается от обхода в ширину. Приведите пример из жизни.', { type: 'text' }, {
    rubric: [{ label: 'Верное отличие', points: 5 }, { label: 'Пример из жизни', points: 3 }, { label: 'Ясно изложено', points: 2 }] })));
  built.topics.push({ id: t3.id, kind: 'lesson', blocks: b3 });

  await setCourseGroups(course.id, groupIds, new Set(groupIds));
  await setCourseStatus(course.id, 'published');
  return built;
}

async function buildChemistry(orgId: string, teacherId: string, groupIds: string[]): Promise<Built> {
  const course = await createCourse({ orgId, ownerId: teacherId, title: CHEM_TITLE, subject: 'Химия',
    description: 'Как понять, что реакция идёт: осадок, газ, цвет, пламя. Всё — на «Столе реакций», в браузере и в очках.' });
  const built: Built = { courseId: course.id, topics: [] };
  const t1 = await createTopic(course.id, 'Четыре признака реакции');
  const b1: Block[] = [];
  b1.push(await add(t1.id, 'text', { title: 'Что меняется', body: '- **Выпадает осадок** — нерастворимое вещество.\n- **Выделяется газ** — пузырьки.\n'
    + '- **Меняется цвет.**\n- **Выделяется тепло или свет.**' }));
  b1.push(await add(t1.id, 'lab', { slug: 'chemistry', caption: 'Смешайте CuSO₄ и NaOH — что увидите? Затем попробуйте соду с уксусом.' }));
  b1.push(await add(t1.id, 'formula', { latex: '\\mathrm{CuSO_4 + 2NaOH \\rightarrow Cu(OH)_2\\downarrow + Na_2SO_4}', caption: 'Голубой осадок гидроксида меди' }));
  b1.push(await add(t1.id, 'assignment', task('Сопоставьте опыт и признак реакции.', { type: 'match', pairs: [
    { left: 'CuSO₄ + NaOH', right: 'голубой осадок' }, { left: 'Сода + уксус', right: 'пузырьки газа' },
    { left: 'Фенолфталеин + щёлочь', right: 'малиновый цвет' }, { left: 'Горение магния', right: 'яркий свет' }] })));
  b1.push(await add(t1.id, 'assignment', task('Заполните пропуски.', { type: 'gaps',
    text: 'Нерастворимое вещество, образующееся в растворе, называют {{осадком|осадок}}. Соли меди окрашивают пламя в {{зелёный|зеленый}} цвет.' }, { allowRetry: true })));
  built.topics.push({ id: t1.id, kind: 'lesson', blocks: b1 });

  const t2 = await createTopic(course.id, 'Окраска пламени');
  const b2: Block[] = [];
  b2.push(await add(t2.id, 'callout', { tone: 'example', title: 'Фейерверк — это химия', body: 'Цвет салюта задают соли металлов: натрий — жёлтый, стронций — красный, медь — зелёный, калий — фиолетовый.' }));
  b2.push(await add(t2.id, 'lab', { slug: 'chemistry', caption: 'Станция «Пламя»: внесите по очереди соли и запишите цвета.' }));
  b2.push(await add(t2.id, 'assignment', task('Какой металл окрашивает пламя в жёлтый цвет?', { type: 'choice', multiple: false, shuffle: true, options: [
    { id: 'na', text: 'Натрий', correct: true }, { id: 'cu', text: 'Медь', correct: false }, { id: 'k', text: 'Калий', correct: false }] })));
  b2.push(await add(t2.id, 'assignment', task('Опишите опыт с окраской пламени: что делали и что увидели.', { type: 'text' }, {
    stand: { kind: 'lab', slug: 'chemistry' }, rubric: [{ label: 'Порядок опыта', points: 4 }, { label: 'Наблюдения', points: 4 }, { label: 'Вывод', points: 2 }] })));
  built.topics.push({ id: t2.id, kind: 'lesson', blocks: b2 });

  await setCourseGroups(course.id, groupIds, new Set(groupIds));
  await setCourseStatus(course.id, 'published');
  return built;
}

/* ------------------------------ «прожитая» учёба ----------------------------- */

const TEXT_ANSWERS = {
  good: [
    'Период растёт медленнее длины: когда я увеличил длину с 0,5 до 2 м (в 4 раза), период вырос примерно вдвое. Значит T пропорционален корню из длины.',
    'По графику видно, что кривая загибается: чем длиннее нить, тем медленнее растёт период. Это совпадает с формулой T = 2π√(L/g).',
  ],
  ok: [
    'Чем длиннее нить, тем больше период. На графике линия идёт вверх.',
    'Период зависит от длины, если длина больше то и период больше.',
  ],
  rainbow: [
    'Солнечный свет заходит в капли дождя и преломляется. Разные цвета преломляются под разным углом, поэтому белый свет раскладывается, и мы видим радугу.',
    'Радуга появляется потому что капли воды как маленькие призмы. Свет в них преломляется и отражается, и цвета расходятся.',
    'Радуга бывает когда солнце и дождь одновременно.',
  ],
  graph: [
    'В ширину идём слоями — сначала все соседи, потом их соседи, для этого очередь. В глубину идём по одной ветке до конца и возвращаемся — стек. Пример: в ширину — рассылка друзьям друзей, в глубину — выход из лабиринта.',
    'Обход в глубину сначала уходит далеко по одному пути, а в ширину проверяет всё рядом. Как искать ключи: сначала вся комната, потом соседние.',
  ],
  flame: [
    'Брали проволоку, опускали в раствор соли и вносили в пламя горелки. Натрий дал жёлтое пламя, медь — зелёное, калий — фиолетовое. Вывод: цвет пламени зависит от металла.',
    'Вносили соли в огонь, пламя стало разного цвета.',
  ],
};

function answerFor(block: Block, kid: Kid, r: () => number): Answer | null {
  if (block.body.kind !== 'assignment') return null;
  const s = block.body.payload.spec;
  const right = r() < kid.skill;
  switch (s.type) {
    case 'choice': {
      const correct = s.options.filter((o) => o.correct).map((o) => o.id);
      const wrong = s.options.find((o) => !o.correct)?.id ?? correct[0];
      return { type: 'choice', selected: right ? correct : [wrong] };
    }
    case 'number': return { type: 'number', value: String(right ? s.answer : s.answer * (r() < 0.5 ? 2 : 0.5)).replace('.', ',') };
    case 'short': return { type: 'short', text: right ? s.accepted[0] : 'дифракция' };
    case 'gaps': {
      const n = (s.text.match(/\{\{/g) ?? []).length;
      const good = [...s.text.matchAll(/\{\{([^}|]*)/g)].map((m) => m[1]);
      return { type: 'gaps', values: Array.from({ length: n }, (_, i) => (right || r() < 0.5 ? good[i] : 'не знаю')) };
    }
    case 'match': {
      const pairs: Record<string, string> = {};
      const rights = s.pairs.map((p) => p.rightId);
      s.pairs.forEach((p, i) => { pairs[p.id] = right || r() < 0.6 ? p.rightId : rights[(i + 1) % rights.length]; });
      // Две строки на один правый вариант санация не пропустит — чиним коллизии.
      const used = new Set<string>();
      for (const p of s.pairs) { if (used.has(pairs[p.id])) pairs[p.id] = rights.find((x) => !used.has(x))!; used.add(pairs[p.id]); }
      return { type: 'match', pairs };
    }
    case 'order': {
      const ids = s.items.map((i) => i.id);
      if (!right) [ids[1], ids[2]] = [ids[2], ids[1]];
      return { type: 'order', order: ids };
    }
    case 'table': {
      const lens = [0.25, 0.5, 1, 1.5, 2];
      const rows = lens.map((L) => [String(L).replace('.', ','), (2 * Math.PI * Math.sqrt(L / 9.81) * (1 + (r() - 0.5) * (kid.skill > 0.7 ? 0.02 : 0.08))).toFixed(2).replace('.', ',')]);
      return { type: 'table', rows: kid.diligence > 0.45 ? rows : rows.slice(0, 4) };
    }
    case 'text': {
      const prompt = block.body.payload.prompt;
      const pool = prompt.includes('радуг') ? TEXT_ANSWERS.rainbow
        : prompt.includes('глубину') ? TEXT_ANSWERS.graph
        : prompt.includes('пламени') ? TEXT_ANSWERS.flame
        : kid.skill > 0.7 ? TEXT_ANSWERS.good : TEXT_ANSWERS.ok;
      return { type: 'text', text: pool[Math.floor(r() * pool.length)] };
    }
    default: return null;
  }
}

async function backdate(submissionId: string, at: Date): Promise<void> {
  await db().query(
    `UPDATE submissions SET submitted_at = $2, updated_at = $2,
       graded_at = CASE WHEN graded_at IS NOT NULL THEN $2::timestamptz + interval '1 day' * random() ELSE NULL END
     WHERE id = $1`, [submissionId, at]);
}

async function liveThrough(built: Built, kids: Kid[], teacherId: string): Promise<{ pending: number }> {
  const now = Date.now();
  const day = 86_400_000;
  // Когда тема была «пройдена»: первая — три недели назад, дальше ближе к сегодняшнему дню.
  const topicAge = built.topics.length >= 5 ? [20, 13, 8, 3, 1] : [18, 9, 3, 1];
  let pending = 0;
  for (const kid of kids) {
    // Своё зерно на курс: один и тот же ученик по разным предметам ведёт себя по-разному.
    const r = rng(kid.login + built.courseId);
    for (const [ti, topic] of built.topics.entries()) {
      // Контрольную пишут только самые старательные; свежие темы открыты не у всех.
      if (topic.kind === 'exam' && kid.diligence < 0.7) continue;
      if (r() > kid.diligence + (ti < 2 ? 0.35 : 0.05)) continue;
      const opened = new Date(now - topicAge[ti] * day + r() * day * 2);
      await recordTopicView(topic.id, kid.user.id);
      await db().query('UPDATE topic_views SET first_at = $3, last_at = $3 WHERE topic_id = $1 AND user_id = $2', [topic.id, kid.user.id, opened]);
      for (const block of topic.blocks) {
        const answer = answerFor(block, kid, r);
        if (!answer || r() > kid.diligence + 0.2) continue;
        let sub = await saveAnswer(block, kid.user.id, answer, true);
        const at = new Date(opened.getTime() + r() * day * 1.5);
        if (sub.status === 'submitted') {
          // Развёрнутые ответы: старые проверены, свежие ждут учителя — ему есть что делать.
          if (ti <= 1 && r() < 0.8) {
            const p = block.body.kind === 'assignment' ? block.body.payload : null;
            const max = p?.points ?? 10;
            if (r() < 0.12) {
              sub = await returnSubmission(sub, teacherId, 'Не хватает вывода по графику. Посмотри, как растёт период, и допиши.');
            } else {
              const score = Math.max(3, Math.min(max, Math.round(max * (0.45 + kid.skill * 0.55))));
              sub = await gradeSubmission(sub, max, teacherId, score,
                score >= 9 ? 'Отличная работа — вывод точный и опирается на данные.'
                  : score >= 7 ? 'Хорошо. Добавь, что зависимость — корень из длины.' : 'Вывод слишком общий. Опирайся на числа из таблицы.');
            }
          } else {
            pending += 1;
          }
        }
        await backdate(sub.id, at);
      }
    }
  }
  return { pending };
}

export async function seedShowcase(print: (line: string) => void, allowProduction = false): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error('seed:showcase ставит взрослым известный пароль. В продакшне — только с флагом --allow-production.');
  }
  const org = (await findOrgBySlug(ORG.slug)) ?? await createOrganization(ORG);
  await db().query('UPDATE organizations SET archived_at = NULL WHERE id = $1', [org.id]);
  await updateOrgSettings(org.id, { studentsCanGenerate: false });

  const director = await staff(STAFF.director.email, STAFF.director.name);
  const physics = await staff(STAFF.physics.email, STAFF.physics.name);
  const second = await staff(STAFF.second.email, STAFF.second.name);
  await addMember(org.id, director.id, 'org_admin');
  await addMember(org.id, physics.id, 'teacher');
  await addMember(org.id, second.id, 'teacher');
  const chem = await staff(STAFF.chemistry.email, STAFF.chemistry.name);
  await addMember(org.id, chem.id, 'teacher');

  const groups: { id: string; title: string; roster: [string, string][] }[] = [];
  for (const [title, roster] of [['8А', CLASS_A], ['8Б', CLASS_B]] as const) {
    const g = (await findGroupByTitle(org.id, title)) ?? await createGroup(org.id, title);
    await assignTeacher(g.id, physics.id);
    groups.push({ id: g.id, title, roster: [...roster] });
  }
  await assignTeacher(groups[1].id, second.id);
  for (const g of groups) await assignTeacher(g.id, chem.id);

  const kids: Kid[] = [];
  for (const g of groups) {
    for (const [last, first] of g.roster) {
      const login = candidateLogin(last, first, org.slug, 1);
      const password = 'lyceum-2026';
      const found = await findUserByIdentifier(login);
      const user = found ?? await createLoginUser({ login, displayName: `${last} ${first}`, password, mustChangePassword: false });
      // Витрина: ученики входят сразу, без смены пароля — показывать удобнее.
      await updatePassword(user.id, password);
      await addMember(org.id, user.id, 'student');
      await addToGroup(g.id, user.id);
      const r = rng(login);
      kids.push({ user, login, password, group: g.title, diligence: 0.35 + r() * 0.65, skill: 0.4 + r() * 0.6 });
    }
  }
  // Пара учеников ещё не входила — чтобы в листе паролей и на обзоре директора было что показать.
  for (const k of kids.slice(-2)) {
    const temp = 'новый-вход-2026';
    await setTemporaryPassword(k.user.id, temp);
    await savePendingCredential(k.user.id, temp);
    k.password = temp;
  }

  const sims = {
    pendulum: await demoSimulation(physics.id, 'pendulum'),
    interference: await demoSimulation(physics.id, 'interference'),
    refraction: await demoSimulation(physics.id, 'refraction'),
  };
  for (const slug of ['kepler', 'ideal-gas', 'engine']) await demoSimulation(physics.id, slug);

  const exists = await db().query<{ id: string }>('SELECT id FROM courses WHERE org_id = $1 AND title = $2', [org.id, COURSE_TITLE]);
  let pending = 0;
  if (!exists.rows[0]) {
    const built = await buildCourse(org.id, physics.id, groups.map((g) => g.id), sims);
    // Сроки: лабораторная — послезавтра, свет — через неделю.
    await setTopicDue(built.topics[1].id, new Date(Date.now() + 2 * 86_400_000).toISOString());
    await setTopicDue(built.topics[3].id, new Date(Date.now() + 7 * 86_400_000).toISOString());
    const active = kids.filter((k) => !k.user.mustChangePassword).slice(0, -2);
    ({ pending } = await liveThrough(built, active, physics.id));
    const firstPending = await db().query<{ block_id: string }>(
      `SELECT s.block_id FROM submissions s JOIN blocks b ON b.id = s.block_id JOIN topics t ON t.id = b.topic_id
       WHERE t.course_id = $1 AND s.status = 'submitted' LIMIT 1`, [built.courseId]);
    if (firstPending.rows[0]) {
      const block = await getBlock(firstPending.rows[0].block_id);
      await notify(physics.id, { key: `submitted:${firstPending.rows[0].block_id}`, kind: 'submitted',
        title: `Новые работы: ${pending}`, body: COURSE_TITLE, href: answersHref(built.courseId, block!.id, { pending: true }) });
    }
  }

  const extra: [string, () => Promise<Built>, string, Kid[]][] = [
    [INFO_TITLE, () => buildInformatics(org.id, second.id, [groups[1].id]), second.id, kids.filter((k) => k.group === '8Б')],
    [CHEM_TITLE, () => buildChemistry(org.id, chem.id, groups.map((g) => g.id)), chem.id, kids],
  ];
  for (const [title, build, owner, audience] of extra) {
    const has = await db().query('SELECT 1 FROM courses WHERE org_id = $1 AND title = $2', [org.id, title]);
    if (has.rowCount) continue;
    const built = await build();
    const active = audience.filter((k) => !kids.slice(-2).includes(k));
    const r = await liveThrough(built, active, owner);
    pending += r.pending;
  }

  print(`Витрина готова: ${org.name} (${org.slug}).`);
  print(`Директор:            ${STAFF.director.email} / ${SHOWCASE_PASSWORD}`);
  print(`Учитель физики:      ${STAFF.physics.email} / ${SHOWCASE_PASSWORD}`);
  print(`Информатика (8Б):   ${STAFF.second.email} / ${SHOWCASE_PASSWORD}`);
  print(`Химия:               ${STAFF.chemistry.email} / ${SHOWCASE_PASSWORD}`);
  print(`Ученики — пароль lyceum-2026, например: ${kids.slice(0, 3).map((k) => k.login).join(', ')}`);
  print(exists.rows[0] ? `Курс «${COURSE_TITLE}» уже был — оставлен как есть.`
    : `Курс «${COURSE_TITLE}»: 5 тем, ${kids.length} учеников, работ ждут проверки: ${pending}.`);
}

if (process.argv[1]?.endsWith('seed-showcase.ts')) {
  seedShowcase((line) => console.log(line), process.argv.includes('--allow-production'))
    .catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1; })
    .finally(() => closeDb());
}

import type { CatalogEntry } from './types';

/**
 * Сообщения сервера области «lms» (курсы, темы, блоки, ответы, помощник учителя,
 * наставник и разбор ошибок) на казахском и английском.
 */

/** Подписи полей, которые библиотека курсов подставляет в «Заполните поле «…»». {i} — номер. */
const FIELDS: [ru: string, kk: string, en: string][] = [
  ['Название', 'Атауы', 'Title'],
  ['Название темы', 'Тақырып атауы', 'Topic title'],
  ['Предмет', 'Пән', 'Subject'],
  ['Класс', 'Сынып', 'Grade'],
  ['Описание', 'Сипаттама', 'Description'],
  ['Заголовок', 'Тақырыпша', 'Heading'],
  ['Текст', 'Мәтін', 'Text'],
  ['Подпись', 'Жазу', 'Caption'],
  ['Формула', 'Формула', 'Formula'],
  ['Адрес картинки', 'Сурет мекенжайы', 'Image URL'],
  ['Ссылка на видео', 'Бейне сілтемесі', 'Video link'],
  ['Язык', 'Тіл', 'Language'],
  ['Текст задания', 'Тапсырма мәтіні', 'Assignment text'],
  ['Пояснение', 'Түсіндірме', 'Explanation'],
  ['Эталонный ответ', 'Эталон жауап', 'Model answer'],
  ['Комментарий', 'Пікір', 'Comment'],
  ['Единицы', 'Өлшем бірліктері', 'Units'],
  ['Текст с пропусками', 'Бос орындары бар мәтін', 'Text with gaps'],
  ['Вариант {i}', '{i}-нұсқа', 'Option {i}'],
  ['Пара {i}, слева', '{i}-жұп, сол жақ', 'Pair {i}, left'],
  ['Пара {i}, справа', '{i}-жұп, оң жақ', 'Pair {i}, right'],
  ['Шаг {i}', '{i}-қадам', 'Step {i}'],
  ['Столбец {i}', '{i}-баған', 'Column {i}'],
  ['Критерий {i}', '{i}-критерий', 'Criterion {i}'],
];

const fieldEntries: CatalogEntry[] = FIELDS.flatMap(([ru, kk, en]) => [
  { ru: `Заполните поле «${ru}».`, kk: `«${kk}» өрісін толтырыңыз.`, en: `Please fill in “${en}”.` },
  { ru: `Поле «${ru}» — не длиннее {n} символов.`, kk: `«${kk}» өрісі {n} таңбадан аспауы керек.`, en: `“${en}” must be at most {n} characters.` },
  { ru: `Поле «${ru}» должно быть текстом.`, kk: `«${kk}» өрісі мәтін болуы керек.`, en: `“${en}” must be text.` },
]);

export const catalog: CatalogEntry[] = [
  ...fieldEntries,
  // Запасные шаблоны для подписей, которых нет в списке выше: подпись остаётся как есть.
  { ru: 'Заполните поле «{label}».', kk: '«{label}» өрісін толтырыңыз.', en: 'Please fill in “{label}”.' },
  { ru: 'Поле «{label}» — не длиннее {n} символов.', kk: '«{label}» өрісі {n} таңбадан аспауы керек.', en: '“{label}” must be at most {n} characters.' },
  { ru: 'Поле «{label}» должно быть текстом.', kk: '«{label}» өрісі мәтін болуы керек.', en: '“{label}” must be text.' },

  /* ------------------------------ блоки и задания ------------------------------ */
  { ru: 'Некорректные данные блока.', kk: 'Блок деректері дұрыс емес.', en: 'Invalid block data.' },
  { ru: 'Стенд задания указан неверно.', kk: 'Тапсырма стенді қате көрсетілген.', en: 'The assignment setup is invalid.' },
  { ru: 'Вариантов должно быть от {min} до {max}.', kk: 'Нұсқалар саны {min} мен {max} аралығында болуы керек.', en: 'There must be from {min} to {max} options.' },
  { ru: 'Отметьте хотя бы один правильный вариант.', kk: 'Кемінде бір дұрыс нұсқаны белгілеңіз.', en: 'Mark at least one correct option.' },
  { ru: 'В задании с одним ответом правильный вариант должен быть один.', kk: 'Бір жауапты тапсырмада дұрыс нұсқа біреу болуы керек.', en: 'A single-answer assignment must have exactly one correct option.' },
  { ru: 'Укажите хотя бы один правильный ответ.', kk: 'Кемінде бір дұрыс жауапты көрсетіңіз.', en: 'Enter at least one correct answer.' },
  { ru: 'Вариантов ответа — не больше {n}.', kk: 'Жауап нұсқалары {n}-ден аспауы керек.', en: 'No more than {n} accepted answers.' },
  { ru: 'Ответ — не длиннее {n} символов.', kk: 'Жауап {n} таңбадан аспауы керек.', en: 'The answer must be at most {n} characters.' },
  { ru: 'Отметьте хотя бы один пропуск: {{правильное слово}}.', kk: 'Кемінде бір бос орынды белгілеңіз: {{дұрыс сөз}}.', en: 'Mark at least one gap: {{correct word}}.' },
  { ru: 'Пропусков — не больше {n}.', kk: 'Бос орындар {n}-ден аспауы керек.', en: 'No more than {n} gaps.' },
  { ru: 'В каждом пропуске должен быть ответ: {{слово}}.', kk: 'Әр бос орында жауап болуы керек: {{сөз}}.', en: 'Every gap needs an answer: {{the word}}.' },
  { ru: 'Пар должно быть от {min} до {max}.', kk: 'Жұптар саны {min} мен {max} аралығында болуы керек.', en: 'There must be from {min} to {max} pairs.' },
  { ru: 'Шагов должно быть от {min} до {max}.', kk: 'Қадамдар саны {min} мен {max} аралығында болуы керек.', en: 'There must be from {min} to {max} steps.' },
  { ru: 'Столбцов должно быть от {min} до {max}.', kk: 'Бағандар саны {min} мен {max} аралығында болуы керек.', en: 'There must be from {min} to {max} columns.' },
  { ru: 'Строк — целое число от 1 до {n}.', kk: 'Жолдар саны — 1-ден {n}-ге дейінгі бүтін сан.', en: 'Rows must be a whole number from 1 to {n}.' },
  { ru: 'Укажите правильное число.', kk: 'Дұрыс санды көрсетіңіз.', en: 'Enter the correct number.' },
  { ru: 'Допуск — неотрицательное число.', kk: 'Рұқсат етілген ауытқу теріс емес сан болуы керек.', en: 'Tolerance must be a non-negative number.' },
  { ru: 'Выберите симуляцию для задания.', kk: 'Тапсырмаға симуляция таңдаңыз.', en: 'Choose a simulation for the assignment.' },
  { ru: 'Неизвестный тип задания.', kk: 'Тапсырма түрі белгісіз.', en: 'Unknown assignment type.' },
  { ru: 'Критериев — не больше {n}.', kk: 'Критерийлер {n}-ден аспауы керек.', en: 'No more than {n} criteria.' },
  { ru: 'Критерий {i}: баллы — число больше нуля.', kk: '{i}-критерий: ұпай нөлден үлкен сан болуы керек.', en: 'Criterion {i}: points must be greater than zero.' },
  { ru: 'Тренажёр указан неверно.', kk: 'Тренажер қате көрсетілген.', en: 'The simulator is invalid.' },
  { ru: 'Выберите лабораторию из списка.', kk: 'Тізімнен зертхананы таңдаңыз.', en: 'Choose a lab from the list.' },
  { ru: 'Поддерживаются ссылки YouTube, Vimeo, Rutube и прямые ссылки на .mp4/.webm.', kk: 'YouTube, Vimeo, Rutube сілтемелері және .mp4/.webm файлдарына тікелей сілтемелер қолдау табады.', en: 'Supported links: YouTube, Vimeo, Rutube and direct links to .mp4/.webm.' },
  { ru: 'Код должен быть текстом.', kk: 'Код мәтін болуы керек.', en: 'Code must be text.' },
  { ru: 'Код — не длиннее {n} символов.', kk: 'Код {n} таңбадан аспауы керек.', en: 'Code must be at most {n} characters.' },
  { ru: 'Баллы — целое число от 0 до {n}.', kk: 'Ұпай — 0-ден {n}-ге дейінгі бүтін сан.', en: 'Points must be a whole number from 0 to {n}.' },
  { ru: 'В задании «Состояние симуляции» симуляцию выбирают в редакторе: к ней привязана цель.', kk: '«Симуляция күйі» тапсырмасында симуляция редакторда таңдалады: мақсат соған байланған.', en: 'In a “Simulation state” assignment the simulation is chosen in the editor: the target is tied to it.' },
  { ru: 'Тренажёр можно вставить только в блок «Тренажёр» или в стенд задания.', kk: 'Тренажерді тек «Тренажер» блогына немесе тапсырма стендіне қоюға болады.', en: 'A simulator can only be placed in a “Simulator” block or an assignment setup.' },
  { ru: 'Блок не найден.', kk: 'Блок табылмады.', en: 'Block not found.' },
  { ru: 'Неизвестный тип блока.', kk: 'Блок түрі белгісіз.', en: 'Unknown block type.' },

  /* ---------------------------------- ответы ---------------------------------- */
  { ru: 'Отвечать можно только на задание.', kk: 'Тек тапсырмаға жауап беруге болады.', en: 'You can only answer an assignment.' },
  { ru: 'Черновик нельзя сохранить: ответ уже сдан.', kk: 'Жобаны сақтау мүмкін емес: жауап тапсырылып қойған.', en: 'The draft cannot be saved: the answer has already been submitted.' },
  { ru: 'Ответ уже сдан. Сдать заново можно, если учитель вернёт работу или разрешит повторную сдачу.', kk: 'Жауап тапсырылып қойған. Мұғалім жұмысты қайтарса немесе қайта тапсыруға рұқсат берсе, қайта тапсыруға болады.', en: 'The answer has already been submitted. You can resubmit if the teacher returns the work or allows another attempt.' },
  { ru: 'Симуляция не передала значения параметров. Обновите страницу и попробуйте ещё раз.', kk: 'Симуляция параметр мәндерін жібермеді. Бетті жаңартып, қайталап көріңіз.', en: 'The simulation did not send its parameter values. Refresh the page and try again.' },
  { ru: 'Ответ пустой — заполните его перед сдачей.', kk: 'Жауап бос — тапсырмас бұрын толтырыңыз.', en: 'The answer is empty — fill it in before submitting.' },
  { ru: 'Ответ не подходит к заданию.', kk: 'Жауап тапсырмаға сәйкес келмейді.', en: 'The answer does not match the assignment.' },
  { ru: 'Выбран вариант, которого нет в задании.', kk: 'Тапсырмада жоқ нұсқа таңдалған.', en: 'The selected option is not in the assignment.' },
  { ru: 'В этом задании можно выбрать только один вариант.', kk: 'Бұл тапсырмада тек бір нұсқаны таңдауға болады.', en: 'Only one option can be selected in this assignment.' },
  { ru: 'Число — не длиннее {n} символов.', kk: 'Сан {n} таңбадан аспауы керек.', en: 'The number must be at most {n} characters.' },
  { ru: 'Балл — число от 0 до {n}.', kk: 'Ұпай — 0-ден {n}-ге дейінгі сан.', en: 'The score must be a number from 0 to {n}.' },
  { ru: 'Сначала нажмите «Начать контрольную».', kk: 'Алдымен «Бақылау жұмысын бастау» түймесін басыңыз.', en: 'First press “Start the test”.' },
  { ru: 'Время контрольной вышло — ответы больше не принимаются.', kk: 'Бақылау жұмысының уақыты бітті — жауаптар енді қабылданбайды.', en: 'Time for the test is up — answers are no longer accepted.' },

  /* ----------------------------- состояние симуляции ----------------------------- */
  { ru: 'Зафиксируйте цель: нужен хотя бы один параметр симуляции.', kk: 'Мақсатты бекітіңіз: симуляцияның кемінде бір параметрі керек.', en: 'Set the target: at least one simulation parameter is required.' },
  { ru: 'Параметров в цели — не больше {n}.', kk: 'Мақсаттағы параметрлер {n}-ден аспауы керек.', en: 'No more than {n} parameters in the target.' },
  { ru: 'Цель симуляции указана неверно.', kk: 'Симуляция мақсаты қате көрсетілген.', en: 'The simulation target is invalid.' },
  { ru: 'Параметр в цели повторяется.', kk: 'Мақсаттағы параметр қайталанады.', en: 'A parameter is repeated in the target.' },
  { ru: 'Цель «{label}» — укажите число.', kk: '«{label}» мақсаты — санды көрсетіңіз.', en: 'Target “{label}”: enter a number.' },
  { ru: 'Допуск для «{label}» — неотрицательное число.', kk: '«{label}» үшін рұқсат етілген ауытқу теріс емес сан болуы керек.', en: 'Tolerance for “{label}” must be a non-negative number.' },

  /* ------------------------------ курсы и темы ------------------------------ */
  { ru: 'Курс не найден.', kk: 'Курс табылмады.', en: 'Course not found.' },
  { ru: 'Эту группу нельзя выбрать: её нет среди ваших групп.', kk: 'Бұл топты таңдауға болмайды: ол Сіздің топтарыңыздың арасында жоқ.', en: 'This group cannot be selected: it is not one of your groups.' },
  { ru: 'Срок сдачи указан неверно.', kk: 'Тапсыру мерзімі қате көрсетілген.', en: 'The due date is invalid.' },
  { ru: 'Неизвестный формат темы.', kk: 'Тақырып форматы белгісіз.', en: 'Unknown topic format.' },
  { ru: 'Время на контрольную — от 1 до 300 минут.', kk: 'Бақылау жұмысының уақыты — 1-ден 300 минутқа дейін.', en: 'Test time must be from 1 to 300 minutes.' },
  { ru: 'По курсу уже есть ответы учеников ({n}) — удалить его нельзя, чтобы не пропали оценки. Отправьте курс в архив.', kk: 'Курс бойынша оқушылардың жауаптары бар ({n}) — бағалар жоғалмас үшін оны жоюға болмайды. Курсты мұрағатқа жіберіңіз.', en: 'The course already has student answers ({n}) — it cannot be deleted without losing grades. Archive the course instead.' },
  { ru: 'Статус курса — черновик, опубликован или в архиве.', kk: 'Курс мәртебесі — жоба, жарияланған немесе мұрағатта.', en: 'Course status must be draft, published or archived.' },
  { ru: 'В плане нет ни одной темы.', kk: 'Жоспарда бірде-бір тақырып жоқ.', en: 'The plan has no topics.' },
  { ru: 'Неизвестное действие.', kk: 'Белгісіз әрекет.', en: 'Unknown action.' },

  /* ---------------------------------- проверка ---------------------------------- */
  { ru: 'Черновик нельзя оценить: ученик ещё не сдал ответ.', kk: 'Жобаны бағалауға болмайды: оқушы жауапты әлі тапсырған жоқ.', en: 'A draft cannot be graded: the student has not submitted the answer yet.' },
  { ru: 'Черновик нельзя вернуть: ученик ещё не сдал ответ.', kk: 'Жобаны қайтаруға болмайды: оқушы жауапты әлі тапсырған жоқ.', en: 'A draft cannot be returned: the student has not submitted the answer yet.' },
  { ru: 'Пересчитать можно только задание.', kk: 'Тек тапсырманы қайта есептеуге болады.', en: 'Only an assignment can be recalculated.' },

  /* ------------------------------ файлы и заметки ------------------------------ */
  { ru: 'Файл пустой.', kk: 'Файл бос.', en: 'The file is empty.' },
  { ru: 'Картинка больше 4 МБ — уменьшите её и попробуйте снова.', kk: 'Сурет 4 МБ-тан үлкен — оны кішірейтіп, қайталап көріңіз.', en: 'The image is larger than 4 MB — make it smaller and try again.' },
  { ru: 'Подходят картинки PNG, JPEG, WebP и GIF.', kk: 'PNG, JPEG, WebP және GIF суреттері жарайды.', en: 'PNG, JPEG, WebP and GIF images are supported.' },
  { ru: 'Заметка — не длиннее {n} символов.', kk: 'Жазба {n} таңбадан аспауы керек.', en: 'The note must be at most {n} characters.' },
  { ru: 'Шаг недоступен — возможно, курс закрыли.', kk: 'Қадам қолжетімсіз — курс жабылған болуы мүмкін.', en: 'This step is unavailable — the course may have been closed.' },

  /* --------------------------------- обсуждение --------------------------------- */
  { ru: 'Напишите вопрос или мысль — пустое сообщение не отправляется.', kk: 'Сұрақ немесе ой жазыңыз — бос хабарлама жіберілмейді.', en: 'Write a question or a thought — an empty message cannot be sent.' },
  { ru: 'Сообщение — не длиннее {n} символов.', kk: 'Хабарлама {n} таңбадан аспауы керек.', en: 'The message must be at most {n} characters.' },
  { ru: 'Сообщение, на которое вы отвечаете, уже удалено.', kk: 'Сіз жауап беріп отырған хабарлама жойылған.', en: 'The message you are replying to has been deleted.' },
  { ru: 'Сообщение не найдено или его нельзя удалить.', kk: 'Хабарлама табылмады немесе оны жоюға болмайды.', en: 'The message was not found or cannot be deleted.' },

  /* ------------------------------ помощник учителя ------------------------------ */
  { ru: 'Помощник сейчас недоступен. Попробуйте через минуту.', kk: 'Көмекші қазір қолжетімсіз. Бір минуттан кейін қайталап көріңіз.', en: 'The assistant is unavailable right now. Try again in a minute.' },
  { ru: 'Помощник ответил не по формату. Попробуйте ещё раз.', kk: 'Көмекші дұрыс емес форматта жауап берді. Қайталап көріңіз.', en: 'The assistant replied in the wrong format. Please try again.' },
  { ru: 'Помощник не смог собрать ни одного годного блока. Уточните тему и попробуйте снова.', kk: 'Көмекші бірде-бір жарамды блок құрастыра алмады. Тақырыпты нақтылап, қайталап көріңіз.', en: 'The assistant could not build a single usable block. Refine the topic and try again.' },
  { ru: 'Помощник не нашёл тем в программе. Вставьте список тем или оглавление подробнее.', kk: 'Көмекші бағдарламадан тақырып таппады. Тақырыптар тізімін немесе мазмұнды толығырақ қойыңыз.', en: 'The assistant found no topics in the program. Paste a more detailed list of topics or table of contents.' },
  { ru: 'Помощник не смог составить критерии. Уточните текст задания.', kk: 'Көмекші критерийлерді құрастыра алмады. Тапсырма мәтінін нақтылаңыз.', en: 'The assistant could not draft the criteria. Refine the assignment text.' },
  { ru: 'Помощник не смог описать тренажёр. Попробуйте ещё раз.', kk: 'Көмекші тренажерді сипаттай алмады. Қайталап көріңіз.', en: 'The assistant could not describe the simulator. Please try again.' },
  { ru: 'Помощник не смог собрать урок. Уточните тему или материалы и попробуйте снова.', kk: 'Көмекші сабақты құрастыра алмады. Тақырыпты немесе материалдарды нақтылап, қайталап көріңіз.', en: 'The assistant could not build the lesson. Refine the topic or materials and try again.' },
  { ru: 'Помощник не смог написать описание. Попробуйте ещё раз.', kk: 'Көмекші сипаттама жаза алмады. Қайталап көріңіз.', en: 'The assistant could not write the description. Please try again.' },
  { ru: 'Помощник не смог сделать варианты этого задания. Попробуйте ещё раз.', kk: 'Көмекші бұл тапсырманың нұсқаларын жасай алмады. Қайталап көріңіз.', en: 'The assistant could not make variants of this assignment. Please try again.' },
  { ru: 'Задания составляются по текстовому блоку — в этом нет текста.', kk: 'Тапсырмалар мәтіндік блок бойынша құрастырылады — бұл блокта мәтін жоқ.', en: 'Assignments are drafted from a text block — this one has no text.' },
  { ru: 'Черновик оценки делается для развёрнутых ответов и таблиц.', kk: 'Бағаның жобасы толық жауаптар мен кестелер үшін жасалады.', en: 'A draft grade is only available for extended answers and tables.' },
  { ru: 'Напишите, о чём урок.', kk: 'Сабақ не туралы екенін жазыңыз.', en: 'Write what the lesson is about.' },
  { ru: 'Добавьте в урок хотя бы один блок.', kk: 'Сабаққа кемінде бір блок қосыңыз.', en: 'Add at least one block to the lesson.' },
  { ru: 'Вставьте программу: список тем, КТП или оглавление учебника.', kk: 'Бағдарламаны қойыңыз: тақырыптар тізімі, КТЖ немесе оқулықтың мазмұны.', en: 'Paste the program: a list of topics, a curriculum plan or a textbook’s table of contents.' },
  { ru: 'Сначала напишите текст задания.', kk: 'Алдымен тапсырма мәтінін жазыңыз.', en: 'Write the assignment text first.' },
  { ru: 'Укажите баллы за задание — критерии в сумме дадут столько же.', kk: 'Тапсырманың ұпайын көрсетіңіз — критерийлер жиынтығы соған тең болады.', en: 'Enter the points for the assignment — the criteria will add up to the same total.' },
  { ru: 'Неизвестное действие помощника.', kk: 'Көмекшінің белгісіз әрекеті.', en: 'Unknown assistant action.' },

  /* ------------------------- разбор урока и работа над ошибками ------------------------- */
  { ru: 'В этой теме нет заданий — разбирать нечего.', kk: 'Бұл тақырыпта тапсырма жоқ — талдайтын ештеңе жоқ.', en: 'This topic has no assignments — there is nothing to review.' },
  { ru: 'Ученики ещё ничего не сдали по этой теме. Разбор появится после первых ответов.', kk: 'Оқушылар бұл тақырып бойынша әлі ештеңе тапсырған жоқ. Талдау алғашқы жауаптардан кейін пайда болады.', en: 'Students have not submitted anything for this topic yet. The review will appear after the first answers.' },
  { ru: 'Сначала сделайте разбор темы.', kk: 'Алдымен тақырыпқа талдау жасаңыз.', en: 'Review the topic first.' },
  { ru: 'Наставник задумался и не ответил. Попробуйте ещё раз.', kk: 'Тәлімгер ойланып қалып, жауап бермеді. Қайталап көріңіз.', en: 'The tutor got lost in thought and did not reply. Please try again.' },
  { ru: 'Помощник не смог собрать задания для разбора. Попробуйте ещё раз через минуту.', kk: 'Көмекші талдауға арналған тапсырмаларды құрастыра алмады. Бір минуттан кейін қайталап көріңіз.', en: 'The assistant could not put together practice tasks. Try again in a minute.' },
  { ru: 'Задание не найдено.', kk: 'Тапсырма табылмады.', en: 'Assignment not found.' },
  { ru: 'Задание недоступно — возможно, курс закрыли.', kk: 'Тапсырма қолжетімсіз — курс жабылған болуы мүмкін.', en: 'The assignment is unavailable — the course may have been closed.' },
  { ru: 'Это не задание — разбирать нечего.', kk: 'Бұл тапсырма емес — талдайтын ештеңе жоқ.', en: 'This is not an assignment — there is nothing to review.' },
];

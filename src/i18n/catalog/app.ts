import type { CatalogEntry } from './types';

/**
 * Сообщения сервера области «app» на казахском и английском: вход и регистрация,
 * пароль, «Войти как», задания генерации, квота, воркер, запросы из клиентских форм.
 */
export const catalog: CatalogEntry[] = [
  // Вход, регистрация, пароль
  { ru: 'Неверный логин, почта или пароль.', kk: 'Логин, пошта немесе құпиясөз қате.', en: 'Wrong username, email or password.' },
  { ru: 'Аккаунт заблокирован. Обратитесь к администратору организации.', kk: 'Аккаунт бұғатталған. Ұйым әкімшісіне хабарласыңыз.', en: 'The account is blocked. Contact your organization administrator.' },
  { ru: 'Слишком много попыток входа. Попробуйте через пятнадцать минут.', kk: 'Кіру әрекеттері тым көп. Он бес минуттан кейін көріңіз.', en: 'Too many sign-in attempts. Try again in fifteen minutes.' },
  { ru: 'Введите корректный адрес почты.', kk: 'Дұрыс пошта мекенжайын енгізіңіз.', en: 'Enter a valid email address.' },
  { ru: 'Адрес почты должен быть не длиннее {n} символов.', kk: 'Пошта мекенжайы {n} таңбадан аспауы керек.', en: 'The email address must be at most {n} characters.' },
  { ru: 'Пароль должен быть не короче {n} символов.', kk: 'Құпиясөз кемінде {n} таңбадан тұруы керек.', en: 'The password must be at least {n} characters.' },
  { ru: 'Новый пароль должен быть не короче {n} символов.', kk: 'Жаңа құпиясөз кемінде {n} таңбадан тұруы керек.', en: 'The new password must be at least {n} characters.' },
  { ru: 'Пароли не совпадают.', kk: 'Құпиясөздер сәйкес келмейді.', en: 'The passwords do not match.' },
  { ru: 'Новый пароль должен отличаться от временного.', kk: 'Жаңа құпиясөз уақытша құпиясөзден өзгеше болуы керек.', en: 'The new password must differ from the temporary one.' },
  { ru: 'Текущий пароль указан неверно.', kk: 'Ағымдағы құпиясөз қате көрсетілген.', en: 'The current password is incorrect.' },
  { ru: 'Такая почта уже зарегистрирована.', kk: 'Бұл пошта тіркелген.', en: 'This email is already registered.' },
  { ru: 'Такая почта уже зарегистрирована', kk: 'Бұл пошта тіркелген', en: 'This email is already registered' },
  { ru: 'Логин «{login}» уже занят.', kk: '«{login}» логині бос емес.', en: 'The username “{login}” is already taken.' },
  {
    ru: 'Логин может содержать только строчные латинские буквы, цифры, точку, дефис и подчёркивание, от 3 до 40 символов, и начинаться с буквы или цифры.',
    kk: 'Логин тек кіші латын әріптерінен, сандардан, нүктеден, сызықшадан және астын сызудан тұруы, ұзындығы 3-тен 40 таңбаға дейін болуы және әріппен не цифрмен басталуы керек.',
    en: 'A username may contain only lowercase Latin letters, digits, dots, hyphens and underscores, be 3 to 40 characters long, and start with a letter or digit.',
  },
  {
    ru: 'Регистрация закрыта. Аккаунт выдаёт ваша школа или администратор платформы.',
    kk: 'Тіркелу жабық. Аккаунтты мектебіңіз немесе платформа әкімшісі береді.',
    en: 'Registration is closed. Your school or the platform administrator issues accounts.',
  },

  // «Войти как»
  { ru: 'Человек не найден или заблокирован.', kk: 'Адам табылмады немесе бұғатталған.', en: 'The person was not found or is blocked.' },
  { ru: 'Это вы.', kk: 'Бұл — сіз.', en: 'That is you.' },
  { ru: 'Войти от имени другого админа платформы нельзя.', kk: 'Платформаның басқа әкімшісінің атынан кіруге болмайды.', en: 'You cannot sign in as another platform administrator.' },
  { ru: 'Вы и так в своём аккаунте.', kk: 'Сіз онсыз да өз аккаунтыңыздасыз.', en: 'You are already in your own account.' },

  // Задания генерации и доработки
  { ru: 'У вас уже идёт генерация. Дождитесь её окончания или отмените.', kk: 'Сізде генерация жүріп жатыр. Оның аяқталуын күтіңіз немесе тоқтатыңыз.', en: 'You already have a generation running. Wait for it to finish or cancel it.' },
  { ru: 'У вас уже идёт доработка. Дождитесь её окончания или отмените.', kk: 'Сізде жетілдіру жүріп жатыр. Оның аяқталуын күтіңіз немесе тоқтатыңыз.', en: 'You already have a refinement running. Wait for it to finish or cancel it.' },
  { ru: 'Опишите, какую симуляцию нужно создать.', kk: 'Қандай симуляция жасау керегін сипаттаңыз.', en: 'Describe the simulation you want to create.' },
  { ru: 'Опишите, что нужно изменить в симуляции.', kk: 'Симуляцияда нені өзгерту керегін сипаттаңыз.', en: 'Describe what to change in the simulation.' },
  { ru: 'Задание не найдено.', kk: 'Тапсырма табылмады.', en: 'Job not found.' },
  { ru: 'Симуляция не найдена.', kk: 'Симуляция табылмады.', en: 'Simulation not found.' },
  { ru: 'Не удалось прочитать запрос. Обновите страницу и попробуйте ещё раз.', kk: 'Сұрауды оқу мүмкін болмады. Бетті жаңартып, қайтадан көріңіз.', en: 'Could not read the request. Reload the page and try again.' },
  { ru: 'Прикрепите картинку в обычном формате (PNG, JPEG и т. п.) размером не больше 6 МБ.', kk: 'Кәдімгі форматтағы (PNG, JPEG және т.б.) көлемі 6 МБ-тан аспайтын суретті тіркеңіз.', en: 'Attach an image in a common format (PNG, JPEG, etc.) no larger than 6 MB.' },
  { ru: 'Описание слишком длинное: сократите его до 20 000 символов.', kk: 'Сипаттама тым ұзын: оны 20 000 таңбаға дейін қысқартыңыз.', en: 'The description is too long: shorten it to 20,000 characters.' },
  { ru: 'Просьба слишком длинная: сократите её до 4000 символов.', kk: 'Өтініш тым ұзын: оны 4000 таңбаға дейін қысқартыңыз.', en: 'The request is too long: shorten it to 4000 characters.' },
  { ru: 'У этой генерации ещё нет версии, которую можно оставить.', kk: 'Бұл генерацияда әзірге қалдыруға болатын нұсқа жоқ.', en: 'This generation has no version to keep yet.' },
  { ru: 'Сохранена по ходу генерации: полировка остановлена вручную.', kk: 'Генерация барысында сақталды: жетілдіру қолмен тоқтатылды.', en: 'Saved mid-generation: polishing was stopped manually.' },
  { ru: 'С такими настройками тренажёр не запускается: {errors}', kk: 'Мұндай баптаулармен тренажер іске қосылмайды: {errors}', en: 'The simulator does not run with these settings: {errors}' },
  { ru: 'Генерация недоступна для учеников вашей организации.', kk: 'Ұйымыңыздың оқушыларына генерация қолжетімсіз.', en: 'Generation is not available to students in your organization.' },
  { ru: 'Воркер перезапущен, генерация начата заново.', kk: 'Воркер қайта іске қосылды, генерация қайтадан басталды.', en: 'The worker restarted; generation started over.' },
  { ru: 'Генерация прервалась дважды. Попробуйте ещё раз.', kk: 'Генерация екі рет үзілді. Қайтадан көріңіз.', en: 'Generation was interrupted twice. Please try again.' },
  { ru: 'Генерация завершилась без результата. Попробуйте ещё раз.', kk: 'Генерация нәтижесіз аяқталды. Қайтадан көріңіз.', en: 'Generation finished without a result. Please try again.' },
  { ru: 'Ошибка генерации.', kk: 'Генерация қатесі.', en: 'Generation failed.' },
  { ru: 'Не удалось записать результат генерации.', kk: 'Генерация нәтижесін жазу мүмкін болмады.', en: 'Could not save the generation result.' },
  { ru: 'Попытка устарела: задание выполняется заново.', kk: 'Әрекет ескірді: тапсырма қайтадан орындалуда.', en: 'The attempt is outdated: the job is running again.' },

  // Переписка по симуляции из истории заданий
  { ru: 'Готово, обновил.', kk: 'Дайын, жаңарттым.', en: 'Done, updated.' },
  { ru: 'Симуляция готова.', kk: 'Симуляция дайын.', en: 'The simulation is ready.' },
  { ru: 'Доработка отменена.', kk: 'Жетілдіру тоқтатылды.', en: 'Refinement cancelled.' },
  { ru: 'Полировка остановлена — оставлена версия с экрана.', kk: 'Жетілдіру тоқтатылды — экрандағы нұсқа қалдырылды.', en: 'Polishing stopped — the version on screen was kept.' },
  { ru: 'Не получилось: {error}', kk: 'Сәтсіз болды: {error}', en: 'Failed: {error}' },

  // Квота
  {
    ru: 'Лимит генераций от вашей организации исчерпан: использовано {limit} из {limit}. Доработка уже созданных симуляций по-прежнему доступна.',
    kk: 'Ұйымыңыз берген генерация лимиті таусылды: {limit} ішінен {limit} пайдаланылды. Бұрын жасалған симуляцияларды жетілдіру әлі де қолжетімді.',
    en: 'Your organization’s generation limit is used up: {limit} of {limit} used. You can still refine simulations you have already created.',
  },
  {
    ru: 'Лимит пробной версии исчерпан: использовано {limit} из {limit} генераций. Доработка уже созданных симуляций по-прежнему доступна.',
    kk: 'Сынақ нұсқасының лимиті таусылды: {limit} генерацияның {limit}-і пайдаланылды. Бұрын жасалған симуляцияларды жетілдіру әлі де қолжетімді.',
    en: 'The trial limit is used up: {limit} of {limit} generations used. You can still refine simulations you have already created.',
  },

  // Ответы роутов без перевода в коде и ошибки клиентских запросов
  { ru: 'not found', kk: 'Табылмады', en: 'Not found' },
  { ru: 'invalid request', kk: 'Сұрау дұрыс емес', en: 'Invalid request' },
  { ru: 'Сеть недоступна. Проверьте соединение и попробуйте снова.', kk: 'Желі қолжетімсіз. Байланысты тексеріп, қайта көріңіз.', en: 'Network unavailable. Check your connection and try again.' },
  { ru: 'Сессия закончилась. Войдите снова.', kk: 'Сессия аяқталды. Қайта кіріңіз.', en: 'Your session has expired. Please sign in again.' },
  { ru: 'Не найдено. Обновите страницу.', kk: 'Табылмады. Бетті жаңартыңыз.', en: 'Not found. Reload the page.' },
  { ru: 'Ошибка сервера ({status}). Попробуйте ещё раз.', kk: 'Сервер қатесі ({status}). Қайтадан көріңіз.', en: 'Server error ({status}). Please try again.' },
];

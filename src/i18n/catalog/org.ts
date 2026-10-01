import type { CatalogEntry } from './types';

/** Сообщения сервера области «org» (кабинет организации, админка, общие ответы роутов) на казахском и английском. */
export const catalog: CatalogEntry[] = [
  // общие ответы роутов (lib/http)
  { ru: 'Не найдено.', kk: 'Табылмады.', en: 'Not found.' },
  { ru: 'Некорректный запрос.', kk: 'Сұрау дұрыс емес.', en: 'Invalid request.' },
  { ru: 'Неизвестное действие.', kk: 'Белгісіз әрекет.', en: 'Unknown action.' },
  { ru: 'Слишком часто: дождитесь окончания предыдущего запроса и попробуйте через минуту.', kk: 'Тым жиі: алдыңғы сұрау аяқталғанын күтіп, бір минуттан кейін қайталаңыз.', en: 'Too many requests: wait for the previous one to finish and try again in a minute.' },

  // человек: почта или логин (lib/org/person-input)
  { ru: 'Имя — не длиннее {n} символов.', kk: 'Аты {n} таңбадан аспауы керек.', en: 'Name must be at most {n} characters.' },
  { ru: 'Почта указана неверно.', kk: 'Пошта қате көрсетілген.', en: 'The email address is invalid.' },
  { ru: 'Укажите почту или логин.', kk: 'Поштаны немесе логинді көрсетіңіз.', en: 'Enter an email or a login.' },
  { ru: 'Логин может содержать только строчные латинские буквы, цифры, точку, дефис и подчёркивание, от 3 до 40 символов.', kk: 'Логин тек кіші латын әріптерінен, сандардан, нүктеден, сызықшадан және астын сызудан тұруы керек, 3-тен 40 таңбаға дейін.', en: 'A login may contain only lowercase Latin letters, digits, dot, hyphen and underscore, 3 to 40 characters.' },
  { ru: 'Для входа по логину укажите имя человека.', kk: 'Логин арқылы кіру үшін адамның атын көрсетіңіз.', en: 'For login-based sign-in, enter the person’s name.' },
  { ru: 'Логин «{login}» уже занят. Укажите другой.', kk: '«{login}» логині бос емес. Басқасын көрсетіңіз.', en: 'The login “{login}” is already taken. Choose another one.' },
  { ru: 'Этот человек уже состоит в организации: администратор.', kk: 'Бұл адам ұйымда бар: әкімші.', en: 'This person is already in the organization: administrator.' },
  { ru: 'Этот человек уже состоит в организации: учитель.', kk: 'Бұл адам ұйымда бар: мұғалім.', en: 'This person is already in the organization: teacher.' },
  { ru: 'Этот человек уже состоит в организации: ученик.', kk: 'Бұл адам ұйымда бар: оқушы.', en: 'This person is already in the organization: student.' },
  { ru: 'Этот человек не состоит в организации.', kk: 'Бұл адам ұйымда жоқ.', en: 'This person is not in the organization.' },

  // список учеников (lib/org/roster, bulk)
  { ru: 'Список слишком длинный: не больше {n} символов.', kk: 'Тізім тым ұзын: {n} таңбадан аспауы керек.', en: 'The list is too long: at most {n} characters.' },
  { ru: 'В списке больше {n} строк. Разделите его на части.', kk: 'Тізімде {n} жолдан көп. Оны бөліктерге бөліңіз.', en: 'The list has more than {n} lines. Split it into parts.' },
  { ru: 'Не удалось подобрать логин для «{name}». Попробуйте ещё раз.', kk: '«{name}» үшін логин таңдау мүмкін болмады. Қайталап көріңіз.', en: 'Could not generate a login for “{name}”. Please try again.' },

  // группы (lib/org/groups)
  { ru: 'Укажите название группы.', kk: 'Топтың атауын көрсетіңіз.', en: 'Enter a group name.' },
  { ru: 'Название группы должно быть не длиннее {n} символов.', kk: 'Топ атауы {n} таңбадан аспауы керек.', en: 'The group name must be at most {n} characters.' },
  { ru: 'Группа «{title}» уже есть в этой организации.', kk: '«{title}» тобы бұл ұйымда бұрыннан бар.', en: 'The group “{title}” already exists in this organization.' },
  { ru: 'Группа не найдена.', kk: 'Топ табылмады.', en: 'Group not found.' },
  { ru: 'Добавить в группу можно только члена организации этой группы.', kk: 'Топқа тек осы топ ұйымының мүшесін қосуға болады.', en: 'Only a member of this group’s organization can be added to the group.' },
  { ru: 'Учителем группы можно назначить только учителя или администратора её организации.', kk: 'Топ мұғалімі етіп тек оның ұйымының мұғалімін немесе әкімшісін тағайындауға болады.', en: 'Only a teacher or administrator of the group’s organization can be assigned as its teacher.' },
  { ru: 'Ученика нет в этой группе.', kk: 'Оқушы бұл топта жоқ.', en: 'The student is not in this group.' },

  // организации (lib/org/orgs)
  { ru: 'Слаг может содержать только строчные латинские буквы, цифры и дефис, от 2 до 32 символов.', kk: 'Слаг тек кіші латын әріптерінен, сандардан және сызықшадан тұруы керек, 2-ден 32 таңбаға дейін.', en: 'A slug may contain only lowercase Latin letters, digits and hyphens, 2 to 32 characters.' },
  { ru: 'Укажите название организации.', kk: 'Ұйымның атауын көрсетіңіз.', en: 'Enter the organization name.' },
  { ru: 'Название организации — не длиннее {n} символов.', kk: 'Ұйым атауы {n} таңбадан аспауы керек.', en: 'The organization name must be at most {n} characters.' },
  { ru: 'Тип организации — school, college или university.', kk: 'Ұйым түрі — school, college немесе university.', en: 'Organization type must be school, college or university.' },
  { ru: 'Слаг «{slug}» уже занят.', kk: '«{slug}» слагы бос емес.', en: 'The slug “{slug}” is already taken.' },
  { ru: 'Организация не найдена.', kk: 'Ұйым табылмады.', en: 'Organization not found.' },

  // люди организации (api/org/[slug]/members)
  { ru: 'Действия над администраторами организации доступны только администратору платформы.', kk: 'Ұйым әкімшілеріне қатысты әрекеттер тек платформа әкімшісіне қолжетімді.', en: 'Only a platform administrator can act on organization administrators.' },
  { ru: 'Этот человек состоит и в других организациях или администрирует платформу — это действие доступно только администратору платформы.', kk: 'Бұл адам басқа ұйымдарда да бар немесе платформаны басқарады — бұл әрекет тек платформа әкімшісіне қолжетімді.', en: 'This person also belongs to other organizations or administers the platform — only a platform administrator can do this.' },
  { ru: 'Убрать из организации можно только учителя. Учеников блокируют.', kk: 'Ұйымнан тек мұғалімді шығаруға болады. Оқушылар бұғатталады.', en: 'Only teachers can be removed from the organization. Students are blocked instead.' },
  { ru: 'Переводить между группами можно только учеников.', kk: 'Топтар арасында тек оқушыларды ауыстыруға болады.', en: 'Only students can be moved between groups.' },

  // помощник администрации (api/org/[slug]/insights, lib/org/ai)
  { ru: 'Ученик не найден.', kk: 'Оқушы табылмады.', en: 'Student not found.' },
  { ru: 'Сформулируйте вопрос, например: «Какие классы отстают по физике?»', kk: 'Сұрақты тұжырымдаңыз, мысалы: «Физикадан қай сыныптар артта қалып жатыр?»', en: 'Phrase a question, for example: “Which classes are falling behind in physics?”' },
  { ru: 'Не понял, по каким данным ответить. Спросите про учеников, классы, учителей, курсы, задания или динамику по дням.', kk: 'Қандай деректер бойынша жауап беру керектігін түсінбедім. Оқушылар, сыныптар, мұғалімдер, курстар, тапсырмалар немесе күндер бойынша динамика туралы сұраңыз.', en: 'I could not tell which data to use. Ask about students, classes, teachers, courses, assignments or daily trends.' },

  // админка (api/admin, lib/auth/impersonation — показываются в админке)
  { ru: 'Нельзя заблокировать самого себя.', kk: 'Өзіңізді бұғаттай алмайсыз.', en: 'You cannot block yourself.' },
  { ru: 'Нельзя снять права администратора с самого себя.', kk: 'Өзіңізден әкімші құқықтарын ала алмайсыз.', en: 'You cannot revoke your own administrator rights.' },
  { ru: 'Человек не найден или заблокирован.', kk: 'Адам табылмады немесе бұғатталған.', en: 'The person was not found or is blocked.' },
  { ru: 'Это вы.', kk: 'Бұл — Сіз.', en: 'That is you.' },
  { ru: 'Войти от имени другого админа платформы нельзя.', kk: 'Платформаның басқа әкімшісінің атынан кіруге болмайды.', en: 'You cannot sign in as another platform administrator.' },
  { ru: 'Вы и так в своём аккаунте.', kk: 'Сіз өз аккаунтыңыздасыз.', en: 'You are already in your own account.' },
  // журнал админки: подписи, записанные в базу (lib/admin/actions, api/admin/settings)
  { ru: 'удалённый пользователь', kk: 'жойылған пайдаланушы', en: 'deleted user' },
  { ru: 'открыта', kk: 'ашық', en: 'open' },
  { ru: 'закрыта', kk: 'жабық', en: 'closed' },
  // расход по организациям (lib/platform-settings): люди без организации
  { ru: 'Частные пользователи', kk: 'Жеке пайдаланушылар', en: 'Individual users' },

  // причины риска (lib/org/reports) — приходят данными, в том числе из сохранённых отчётов
  { ru: 'ни разу не входил', kk: 'бірде-бір рет кірмеген', en: 'has never signed in' },
  { ru: 'не открывал уроки', kk: 'сабақтарды ашпаған', en: 'has not opened lessons' },
  { ru: 'не заходит {n} дн.', kk: '{n} күн кірмей жүр', en: 'inactive for {n} d' },
  { ru: 'пропущено сроков: {n}', kk: 'өткізіп алған мерзімдер: {n}', en: 'missed deadlines: {n}' },
  { ru: 'средний балл {n}%', kk: 'орташа ұпай {n}%', en: 'average score {n}%' },
  { ru: 'балл упал: {a}% → {b}%', kk: 'ұпай төмендеді: {a}% → {b}%', en: 'score dropped: {a}% → {b}%' },
  { ru: 'на доработке: {n}', kk: 'жетілдіруде: {n}', en: 'returned for revision: {n}' },
  { ru: 'сдано {a} из {b}', kk: '{b} ішінен {a} тапсырылды', en: '{a} of {b} submitted' },

  // значения в таблицах «Спросить ИИ» (lib/org/datasets)
  { ru: 'опубликован', kk: 'жарияланған', en: 'published' },
  { ru: 'черновик', kk: 'жоба', en: 'draft' },
  { ru: 'высокий', kk: 'жоғары', en: 'high' },
  { ru: 'средний', kk: 'орташа', en: 'medium' },
  { ru: 'низкий', kk: 'төмен', en: 'low' },
];

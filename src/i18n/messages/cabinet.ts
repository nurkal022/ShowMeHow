import { defineMessages } from '../core';

/**
 * Оболочка кабинетов: боковая панель, меню (lib/cabinet/menu.ts — по ключам), хлебные крошки,
 * меню аккаунта и общие кусочки кабинетов (графики, окна, поля человека, роли и типы организаций).
 */
export const cabinet = defineMessages({
  ru: {
    // рамка
    sidebar: 'Меню кабинета', toSite: 'На сайт', closeMenu: 'Закрыть меню', menu: 'Меню', brandSub: 'кабинет',
    crumbs: 'Хлебные крошки', org: 'Организация', themeGroup: 'Тема оформления', languageGroup: 'Язык интерфейса',
    accountMenu: 'Меню аккаунта', platformAdmin: 'Администратор платформы', profileSettings: 'Профиль и настройки',
    logout: 'Выйти', loginAs: 'Войти как', otherPerson: 'Другой человек…', sections: 'Разделы кабинета',
    // группы меню
    group_platform: 'Платформа', group_org: 'Организация', group_teach: 'Преподавание',
    // пункты меню
    item_overview: 'Обзор', item_orgs: 'Организации', item_users: 'Пользователи', item_catalog: 'Каталог', item_log: 'Журнал',
    item_settings: 'Настройки', item_report: 'Отчёт недели', item_risk: 'Риски', item_ask: 'Спросить ИИ',
    item_teachers: 'Учителя', item_groups: 'Группы', item_today: 'Сегодня', item_courses: 'Курсы', item_review: 'Проверка',
    // хлебные крошки
    seg_admin: 'Платформа', seg_orgs: 'Организации', seg_users: 'Пользователи', seg_catalog: 'Каталог', seg_log: 'Журнал',
    seg_org: 'Организация', seg_teachers: 'Учителя', seg_groups: 'Группы', seg_settings: 'Настройки', seg_credentials: 'Лист паролей',
    seg_teach: 'Преподавание', seg_account: 'Профиль', seg_courses: 'Курсы', seg_review: 'Проверка', seg_generate: 'Курс из программы',
    seg_debrief: 'Разбор', seg_reports: 'Отчёт недели', seg_risk: 'Риски', seg_ask: 'Спросить ИИ', seg_journal: 'Журнал',
    seg_progress: 'Прогресс', seg_answers: 'Ответы', seg_analytics: 'Аналитика',
    id_orgs: 'Организация', id_users: 'Пользователь', id_groups: 'Группа', id_courses: 'Курс', id_answers: 'Задание', id_students: 'Ученик',
    courseSettings: 'О курсе',
    // вкладки курса
    tab_settings: 'О курсе', tab_editor: 'Редактор', tab_journal: 'Журнал', tab_progress: 'Прогресс', tab_answers: 'Ответы',
    tab_debrief: 'Разбор', tab_analytics: 'Аналитика', courseSections: 'Разделы курса',
    // 404
    nfTitle: 'Страница не найдена', nfText: 'Адрес неверный, или у вас нет доступа к этой странице.',
    // роли и типы организаций
    role_org_admin: 'администратор', role_teacher: 'учитель', role_student: 'ученик',
    kind_school: 'Школа', kind_college: 'Колледж', kind_university: 'Университет',
    // статус человека
    status_disabled: 'заблокирован', status_mustChange: 'ждёт смены пароля', status_active: 'активен',
    // графики
    period: 'Период', periodDays: '{n} дней', lastDays: '{title}, последние {n} дней', perDay: 'В среднем в день', day: 'День',
    chartHint: '{label}. Стрелки влево и вправо — выбор дня.', sparkLabel: '{label}: динамика за {n} дней',
    hmLess: 'меньше', hmMore: 'больше', mon: 'пн', wed: 'ср', fri: 'пт',
    // окна и поля
    closePanel: 'Закрыть панель', secretOnce: 'Пароль показывается один раз. Запишите или передайте его сейчас.',
    copy: 'Скопировать', copied: 'Скопировано', done: 'Готово',
    howLogin: 'Как входит человек', byEmail: 'По почте', byLogin: 'По логину',
    loginHint: 'Строчные латинские буквы, цифры, точка, дефис и подчёркивание',
    email_admin: 'Почта администратора', login_admin: 'Логин администратора', name_admin: 'Имя администратора',
    email_teacher: 'Почта учителя', login_teacher: 'Логин учителя', name_teacher: 'Имя учителя',
    // сеть
    netDown: 'Сеть недоступна. Проверьте соединение и попробуйте снова.', sessionEnded: 'Сессия закончилась. Войдите снова.',
    notFoundRefresh: 'Не найдено. Обновите страницу.', serverError: 'Ошибка сервера ({n}). Попробуйте ещё раз.',
    // настройки организации
    set_generate: 'Ученики могут генерировать', set_generateHint: 'Без этого раздел «Создать» ученикам не показывается.',
    set_long: 'Длинные сессии учеников', set_longHint: 'Ученики остаются в системе 30 дней вместо одного учебного дня.',
    set_limit: 'Лимит генераций учителя', set_limitHint: 'Сколько симуляций может создать каждый учитель за всё время.',
    set_limitError: 'Лимит — целое число от 0 до 100 000.', saved: 'Сохранено',
  },
  kk: {
    sidebar: 'Кабинет мәзірі', toSite: 'Сайтқа', closeMenu: 'Мәзірді жабу', menu: 'Мәзір', brandSub: 'кабинет',
    crumbs: 'Навигация жолы', org: 'Ұйым', themeGroup: 'Безендіру тақырыбы', languageGroup: 'Интерфейс тілі',
    accountMenu: 'Аккаунт мәзірі', platformAdmin: 'Платформа әкімшісі', profileSettings: 'Профиль және баптаулар',
    logout: 'Шығу', loginAs: 'Кім ретінде кіру', otherPerson: 'Басқа адам…', sections: 'Кабинет бөлімдері',
    group_platform: 'Платформа', group_org: 'Ұйым', group_teach: 'Оқыту',
    item_overview: 'Шолу', item_orgs: 'Ұйымдар', item_users: 'Пайдаланушылар', item_catalog: 'Каталог', item_log: 'Журнал',
    item_settings: 'Баптаулар', item_report: 'Апта есебі', item_risk: 'Тәуекелдер', item_ask: 'ЖИ-ден сұрау',
    item_teachers: 'Мұғалімдер', item_groups: 'Топтар', item_today: 'Бүгін', item_courses: 'Курстар', item_review: 'Тексеру',
    seg_admin: 'Платформа', seg_orgs: 'Ұйымдар', seg_users: 'Пайдаланушылар', seg_catalog: 'Каталог', seg_log: 'Журнал',
    seg_org: 'Ұйым', seg_teachers: 'Мұғалімдер', seg_groups: 'Топтар', seg_settings: 'Баптаулар', seg_credentials: 'Құпиясөздер парағы',
    seg_teach: 'Оқыту', seg_account: 'Профиль', seg_courses: 'Курстар', seg_review: 'Тексеру', seg_generate: 'Бағдарламадан курс',
    seg_debrief: 'Талдау', seg_reports: 'Апта есебі', seg_risk: 'Тәуекелдер', seg_ask: 'ЖИ-ден сұрау', seg_journal: 'Журнал',
    seg_progress: 'Үлгерім', seg_answers: 'Жауаптар', seg_analytics: 'Аналитика',
    id_orgs: 'Ұйым', id_users: 'Пайдаланушы', id_groups: 'Топ', id_courses: 'Курс', id_answers: 'Тапсырма', id_students: 'Оқушы',
    courseSettings: 'Курс туралы',
    tab_settings: 'Курс туралы', tab_editor: 'Редактор', tab_journal: 'Журнал', tab_progress: 'Үлгерім', tab_answers: 'Жауаптар',
    tab_debrief: 'Талдау', tab_analytics: 'Аналитика', courseSections: 'Курс бөлімдері',
    nfTitle: 'Бет табылмады', nfText: 'Мекенжай қате немесе бұл бетке кіруге рұқсатыңыз жоқ.',
    role_org_admin: 'әкімші', role_teacher: 'мұғалім', role_student: 'оқушы',
    kind_school: 'Мектеп', kind_college: 'Колледж', kind_university: 'Университет',
    status_disabled: 'бұғатталған', status_mustChange: 'құпиясөзді ауыстыруды күтуде', status_active: 'белсенді',
    period: 'Кезең', periodDays: '{n} күн', lastDays: '{title}, соңғы {n} күн', perDay: 'Күніне орта есеппен', day: 'Күн',
    chartHint: '{label}. Күнді солға және оңға бағыттауыштармен таңдаңыз.', sparkLabel: '{label}: {n} күндегі өзгеріс',
    hmLess: 'аз', hmMore: 'көп', mon: 'дс', wed: 'ср', fri: 'жм',
    closePanel: 'Панельді жабу', secretOnce: 'Құпиясөз бір рет қана көрсетіледі. Оны қазір жазып алыңыз немесе беріңіз.',
    copy: 'Көшіру', copied: 'Көшірілді', done: 'Дайын',
    howLogin: 'Адам қалай кіреді', byEmail: 'Пошта арқылы', byLogin: 'Логин арқылы',
    loginHint: 'Кіші латын әріптері, сандар, нүкте, сызықша және астын сызу',
    email_admin: 'Әкімшінің поштасы', login_admin: 'Әкімшінің логині', name_admin: 'Әкімшінің аты',
    email_teacher: 'Мұғалімнің поштасы', login_teacher: 'Мұғалімнің логині', name_teacher: 'Мұғалімнің аты',
    netDown: 'Желі қолжетімсіз. Байланысты тексеріп, қайталап көріңіз.', sessionEnded: 'Сессия аяқталды. Қайта кіріңіз.',
    notFoundRefresh: 'Табылмады. Бетті жаңартыңыз.', serverError: 'Сервер қатесі ({n}). Қайталап көріңіз.',
    set_generate: 'Оқушылар генерациялай алады', set_generateHint: 'Онсыз «Жасау» бөлімі оқушыларға көрсетілмейді.',
    set_long: 'Оқушылардың ұзақ сессиялары', set_longHint: 'Оқушылар жүйеде бір оқу күнінің орнына 30 күн қалады.',
    set_limit: 'Мұғалімнің генерация лимиті', set_limitHint: 'Әр мұғалім барлық уақытта қанша симуляция жасай алады.',
    set_limitError: 'Лимит — 0-ден 100 000-ға дейінгі бүтін сан.', saved: 'Сақталды',
  },
  en: {
    sidebar: 'Workspace menu', toSite: 'Back to site', closeMenu: 'Close menu', menu: 'Menu', brandSub: 'workspace',
    crumbs: 'Breadcrumbs', org: 'Organization', themeGroup: 'Theme', languageGroup: 'Interface language',
    accountMenu: 'Account menu', platformAdmin: 'Platform administrator', profileSettings: 'Profile and settings',
    logout: 'Sign out', loginAs: 'Sign in as', otherPerson: 'Someone else…', sections: 'Workspace sections',
    group_platform: 'Platform', group_org: 'Organization', group_teach: 'Teaching',
    item_overview: 'Overview', item_orgs: 'Organizations', item_users: 'Users', item_catalog: 'Catalog', item_log: 'Activity log',
    item_settings: 'Settings', item_report: 'Weekly report', item_risk: 'Risks', item_ask: 'Ask AI',
    item_teachers: 'Teachers', item_groups: 'Groups', item_today: 'Today', item_courses: 'Courses', item_review: 'Review',
    seg_admin: 'Platform', seg_orgs: 'Organizations', seg_users: 'Users', seg_catalog: 'Catalog', seg_log: 'Activity log',
    seg_org: 'Organization', seg_teachers: 'Teachers', seg_groups: 'Groups', seg_settings: 'Settings', seg_credentials: 'Password sheet',
    seg_teach: 'Teaching', seg_account: 'Profile', seg_courses: 'Courses', seg_review: 'Review', seg_generate: 'Course from syllabus',
    seg_debrief: 'Debrief', seg_reports: 'Weekly report', seg_risk: 'Risks', seg_ask: 'Ask AI', seg_journal: 'Gradebook',
    seg_progress: 'Progress', seg_answers: 'Answers', seg_analytics: 'Analytics',
    id_orgs: 'Organization', id_users: 'User', id_groups: 'Group', id_courses: 'Course', id_answers: 'Assignment', id_students: 'Student',
    courseSettings: 'About the course',
    tab_settings: 'About', tab_editor: 'Editor', tab_journal: 'Gradebook', tab_progress: 'Progress', tab_answers: 'Answers',
    tab_debrief: 'Debrief', tab_analytics: 'Analytics', courseSections: 'Course sections',
    nfTitle: 'Page not found', nfText: 'The address is wrong, or you do not have access to this page.',
    role_org_admin: 'administrator', role_teacher: 'teacher', role_student: 'student',
    kind_school: 'School', kind_college: 'College', kind_university: 'University',
    status_disabled: 'blocked', status_mustChange: 'awaiting password change', status_active: 'active',
    period: 'Period', periodDays: '{n} days', lastDays: '{title}, last {n} days', perDay: 'Daily average', day: 'Day',
    chartHint: '{label}. Use the left and right arrows to pick a day.', sparkLabel: '{label}: trend over {n} days',
    hmLess: 'less', hmMore: 'more', mon: 'Mon', wed: 'Wed', fri: 'Fri',
    closePanel: 'Close panel', secretOnce: 'The password is shown only once. Write it down or hand it over now.',
    copy: 'Copy', copied: 'Copied', done: 'Done',
    howLogin: 'How the person signs in', byEmail: 'By email', byLogin: 'By login',
    loginHint: 'Lowercase Latin letters, digits, dot, hyphen and underscore',
    email_admin: 'Administrator email', login_admin: 'Administrator login', name_admin: 'Administrator name',
    email_teacher: 'Teacher email', login_teacher: 'Teacher login', name_teacher: 'Teacher name',
    netDown: 'Network unavailable. Check your connection and try again.', sessionEnded: 'Your session has ended. Please sign in again.',
    notFoundRefresh: 'Not found. Refresh the page.', serverError: 'Server error ({n}). Please try again.',
    set_generate: 'Students can generate', set_generateHint: 'Without this, the “Create” section is hidden from students.',
    set_long: 'Long student sessions', set_longHint: 'Students stay signed in for 30 days instead of one school day.',
    set_limit: 'Teacher generation limit', set_limitHint: 'How many simulations each teacher can create in total.',
    set_limitError: 'The limit must be a whole number from 0 to 100,000.', saved: 'Saved',
  },
});

export type CabinetKey = keyof typeof cabinet.ru;

/** Ключ словаря, если он есть, — иначе запасная русская подпись (для ключей, пришедших из данных). */
export function hasCabinetKey(key: string | undefined): key is CabinetKey {
  return !!key && key in cabinet.ru;
}

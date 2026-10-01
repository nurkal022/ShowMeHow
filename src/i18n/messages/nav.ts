import { defineMessages } from '../core';

/** Шапка сайта и меню аккаунта. Ключи разделов совпадают с NavSectionKey. */
export const nav = defineMessages({
  ru: {
    learn: 'Моё обучение', catalog: 'Каталог курсов', teach: 'Преподавание', create: 'Создать', research: 'Исследования',
    library: 'Библиотека', labs: 'Лаборатории', org: 'Организация', admin: 'Админка',
    login: 'Войти', logout: 'Выйти', accountMenu: 'Меню аккаунта', admin_role: 'Администратор', user_role: 'Пользователь',
    accountSettings: 'Настройки аккаунта', themeGroup: 'Тема оформления', languageGroup: 'Язык интерфейса',
    studentProfile: 'Профиль ученика', grades: 'Мои оценки', mistakes: 'Работа над ошибками', notes: 'Заметки и закладки',
  },
  kk: {
    learn: 'Менің оқуым', catalog: 'Курстар каталогы', teach: 'Оқыту', create: 'Жасау', research: 'Зерттеулер',
    library: 'Кітапхана', labs: 'Зертханалар', org: 'Ұйым', admin: 'Әкімшілік',
    login: 'Кіру', logout: 'Шығу', accountMenu: 'Аккаунт мәзірі', admin_role: 'Әкімші', user_role: 'Пайдаланушы',
    accountSettings: 'Аккаунт баптаулары', themeGroup: 'Безендіру тақырыбы', languageGroup: 'Интерфейс тілі',
    studentProfile: 'Оқушы профилі', grades: 'Менің бағаларым', mistakes: 'Қателермен жұмыс', notes: 'Жазбалар мен бетбелгілер',
  },
  en: {
    learn: 'My learning', catalog: 'Course catalog', teach: 'Teaching', create: 'Create', research: 'Research',
    library: 'Library', labs: 'Labs', org: 'Organization', admin: 'Admin',
    login: 'Sign in', logout: 'Sign out', accountMenu: 'Account menu', admin_role: 'Administrator', user_role: 'User',
    accountSettings: 'Account settings', themeGroup: 'Theme', languageGroup: 'Interface language',
    studentProfile: 'Student profile', grades: 'My grades', mistakes: 'Review mistakes', notes: 'Notes and bookmarks',
  },
});

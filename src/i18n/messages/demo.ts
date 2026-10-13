import { defineMessages } from '../core';

/** Демо-режим: личный демо-университет и переключатель ролей. */
export const demo = defineMessages({
  ru: {
    label: 'Демо-университет', lookAs: 'Посмотреть как:', aria: 'Демо-режим',
    org: 'Руководство', teacher: 'Преподаватель', student: 'Студент', research: 'Исследователь', create: 'Генератор',
    hint: 'Данные учебные — нажимайте и меняйте смело.',
    invite: 'Хотите увидеть все возможности? Создадим демо-университет с курсами, группами и студентами.',
    inviteBtn: 'Открыть демо', preparing: 'Готовим…', failed: 'Не получилось — попробуйте ещё раз.',
  },
  kk: {
    label: 'Демо-университет', lookAs: 'Кім ретінде қарау:', aria: 'Демо-режим',
    org: 'Басшылық', teacher: 'Оқытушы', student: 'Студент', research: 'Зерттеуші', create: 'Генератор',
    hint: 'Деректер оқу үшін — батыл басып, өзгерте беріңіз.',
    invite: 'Барлық мүмкіндікті көргіңіз келе ме? Курстары, топтары мен студенттері бар демо-университет құрамыз.',
    inviteBtn: 'Демоны ашу', preparing: 'Дайындап жатырмыз…', failed: 'Болмады — қайталап көріңіз.',
  },
  en: {
    label: 'Demo university', lookAs: 'View as:', aria: 'Demo mode',
    org: 'Administration', teacher: 'Instructor', student: 'Student', research: 'Researcher', create: 'Generator',
    hint: 'This is sample data — click and change anything.',
    invite: 'Want to see everything? We’ll set up a demo university with courses, groups and students.',
    inviteBtn: 'Open demo', preparing: 'Preparing…', failed: 'Something went wrong — try again.',
  },
});

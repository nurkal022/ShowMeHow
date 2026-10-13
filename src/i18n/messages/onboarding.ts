import { defineMessages } from '../core';

/** «С чего начать» в кабинетах преподавателя и руководства. */
export const onboarding = defineMessages({
  ru: {
    title: 'С чего начать', hide: 'Скрыть', progress: '{done} из {total}',
    teachSub: 'Пять шагов до первой проверенной работы. Шаги отмечаются сами.',
    orgSub: 'Пять шагов, чтобы университет заработал. Шаги отмечаются сами.',
    // преподаватель
    tGroup: 'Получить группу', tGroupHint: 'Группы назначает руководство университета — попросите добавить вас к своей группе.',
    tGroupAdmin: 'Создать группу', tGroupAdminHint: 'Создайте группу и вставьте список студентов — логины появятся сами.',
    tCourse: 'Создать первый курс', tCourseHint: 'Загрузите программу дисциплины — ИИ соберёт темы и уроки. Или начните с пустого курса.',
    tPublish: 'Опубликовать курс и открыть группе', tPublishHint: 'Пока курс в черновике или без группы, студенты его не видят.',
    tLogin: 'Раздать студентам логины', tLoginHint: 'Распечатайте листы с логинами и паролями в карточке группы.',
    tReview: 'Проверить первую работу', tReviewHint: 'Сданные ответы собираются в одной очереди проверки.',
    // руководство
    oTeachers: 'Добавить преподавателей', oTeachersHint: 'По почте или логину — каждый получит свой кабинет.',
    oGroups: 'Создать группы', oGroupsHint: 'Например, «ИС-21»: по группе на каждый поток.',
    oStudents: 'Добавить студентов', oStudentsHint: 'Вставьте список ФИО — логины и пароли создадутся сами.',
    oCourses: 'Опубликовать первый курс', oCoursesHint: 'Курсы создают преподаватели, можно и самому.',
    oLogin: 'Студенты вошли в систему', oLoginHint: 'Раздайте листы с логинами — их можно распечатать в карточке группы.',
    // кнопки
    create: 'Создать', add: 'Добавить', toCourses: 'К курсам', toGroups: 'К группам', toReview: 'К проверке',
  },
  kk: {
    title: 'Неден бастау керек', hide: 'Жасыру', progress: '{total} ішінен {done}',
    teachSub: 'Алғашқы тексерілген жұмысқа дейін бес қадам. Қадамдар өздігінен белгіленеді.',
    orgSub: 'Университет жұмыс істеуі үшін бес қадам. Қадамдар өздігінен белгіленеді.',
    tGroup: 'Топ алу', tGroupHint: 'Топтарды университет басшылығы тағайындайды — өз тобыңызға қосуды сұраңыз.',
    tGroupAdmin: 'Топ құру', tGroupAdminHint: 'Топ құрып, студенттер тізімін қойыңыз — логиндер өздігінен жасалады.',
    tCourse: 'Алғашқы курсты құру', tCourseHint: 'Пән бағдарламасын жүктеңіз — ЖИ тақырыптар мен сабақтарды жинайды. Немесе бос курстан бастаңыз.',
    tPublish: 'Курсты жариялап, топқа ашу', tPublishHint: 'Курс жоба күйінде не топсыз болса, студенттер оны көрмейді.',
    tLogin: 'Студенттерге логиндерді тарату', tLoginHint: 'Топ карточкасында логиндер мен құпиясөздер парақтарын басып шығарыңыз.',
    tReview: 'Алғашқы жұмысты тексеру', tReviewHint: 'Тапсырылған жауаптар бір тексеру кезегіне жиналады.',
    oTeachers: 'Оқытушыларды қосу', oTeachersHint: 'Пошта не логин арқылы — әрқайсысы өз кабинетін алады.',
    oGroups: 'Топтарды құру', oGroupsHint: 'Мысалы, «ИС-21»: әр ағынға бір топ.',
    oStudents: 'Студенттерді қосу', oStudentsHint: 'Аты-жөндер тізімін қойыңыз — логиндер мен құпиясөздер өздігінен жасалады.',
    oCourses: 'Алғашқы курсты жариялау', oCoursesHint: 'Курстарды оқытушылар жасайды, өзіңіз де жасай аласыз.',
    oLogin: 'Студенттер жүйеге кірді', oLoginHint: 'Логиндер парақтарын таратыңыз — оларды топ карточкасында басып шығаруға болады.',
    create: 'Құру', add: 'Қосу', toCourses: 'Курстарға', toGroups: 'Топтарға', toReview: 'Тексеруге',
  },
  en: {
    title: 'Getting started', hide: 'Hide', progress: '{done} of {total}',
    teachSub: 'Five steps to your first graded work. Steps tick themselves off.',
    orgSub: 'Five steps to get your university running. Steps tick themselves off.',
    tGroup: 'Get a group', tGroupHint: 'Groups are assigned by the university administration — ask them to add you to yours.',
    tGroupAdmin: 'Create a group', tGroupAdminHint: 'Create a group and paste the student list — logins are generated for you.',
    tCourse: 'Create your first course', tCourseHint: 'Upload the syllabus and AI will build topics and lessons. Or start from an empty course.',
    tPublish: 'Publish the course and open it to a group', tPublishHint: 'Students can’t see a course while it is a draft or has no group.',
    tLogin: 'Hand out student logins', tLoginHint: 'Print the login and password sheets from the group page.',
    tReview: 'Grade the first work', tReviewHint: 'Submitted answers are collected in a single review queue.',
    oTeachers: 'Add instructors', oTeachersHint: 'By email or login — each gets their own workspace.',
    oGroups: 'Create groups', oGroupsHint: 'For example “IS-21”: one group per cohort.',
    oStudents: 'Add students', oStudentsHint: 'Paste a list of names — logins and passwords are generated for you.',
    oCourses: 'Publish the first course', oCoursesHint: 'Instructors create courses, and so can you.',
    oLogin: 'Students have signed in', oLoginHint: 'Hand out the login sheets — print them from the group page.',
    create: 'Create', add: 'Add', toCourses: 'Courses', toGroups: 'Groups', toReview: 'Review',
  },
});

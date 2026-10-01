/**
 * Язык подписей кита. Флаг — атрибут data-sim-lang на <html> артефакта: его ставит
 * instrument(html, lang) при генерации, он живёт вне блока рантайма и переживает
 * пере-инструментирование. Нет флага (все старые симуляции) — русский, как раньше.
 * Атрибут lang не годится: модели пишут <html lang="en"> по привычке.
 */
export const KIT_I18N_JS = `
window.__simT = (function () {
  var T = {
    ru: {
      params: '⚙ Параметры', closeParams: 'Закрыть параметры', pause: '⏸ Пауза', play: '▶ Пуск',
      reset: '↺ Сброс', collapse: 'Свернуть или развернуть панель', chart: 'График', series: 'ряд {n}',
      readouts: 'Величины', legend: 'Легенда', formula: 'Как это работает', on: 'вкл', off: 'выкл',
      speed: 'Скорость времени', goals: 'Чему учит', lesson: 'Урок', steps: 'Шаги урока',
      back: '← Назад', next: 'Далее →', stepOf: 'Шаг {i} из {n}: ', task: 'Задание',
      correct: 'Верно ✓', notYet: 'Пока нет.', hint: ' Подсказка: ', answer: 'ответ', check: 'Проверить',
      measurements: 'Измерения', record: '● Записать', clear: 'Очистить',
      locked: 'Учитель зафиксировал этот параметр'
    },
    kk: {
      params: '⚙ Параметрлер', closeParams: 'Параметрлерді жабу', pause: '⏸ Кідірту', play: '▶ Жүргізу',
      reset: '↺ Басынан', collapse: 'Панельді жию немесе ашу', chart: 'График', series: '{n}-қатар',
      readouts: 'Шамалар', legend: 'Шартты белгілер', formula: 'Бұл қалай жұмыс істейді', on: 'қосулы', off: 'өшірулі',
      speed: 'Уақыт жылдамдығы', goals: 'Не үйретеді', lesson: 'Сабақ', steps: 'Сабақ қадамдары',
      back: '← Артқа', next: 'Келесі →', stepOf: '{i}/{n}-қадам: ', task: 'Тапсырма',
      correct: 'Дұрыс ✓', notYet: 'Әзірге дұрыс емес.', hint: ' Кеңес: ', answer: 'жауап', check: 'Тексеру',
      measurements: 'Өлшеулер', record: '● Жазу', clear: 'Тазалау',
      locked: 'Мұғалім бұл параметрді бекітті'
    },
    en: {
      params: '⚙ Parameters', closeParams: 'Close parameters', pause: '⏸ Pause', play: '▶ Play',
      reset: '↺ Reset', collapse: 'Collapse or expand panel', chart: 'Chart', series: 'series {n}',
      readouts: 'Values', legend: 'Legend', formula: 'How it works', on: 'on', off: 'off',
      speed: 'Time speed', goals: 'What it teaches', lesson: 'Lesson', steps: 'Lesson steps',
      back: '← Back', next: 'Next →', stepOf: 'Step {i} of {n}: ', task: 'Task',
      correct: 'Correct ✓', notYet: 'Not yet.', hint: ' Hint: ', answer: 'answer', check: 'Check',
      measurements: 'Measurements', record: '● Record', clear: 'Clear',
      locked: 'The teacher locked this parameter'
    }
  };
  function lang() {
    var l = '';
    try { l = document.documentElement.getAttribute('data-sim-lang') || ''; } catch (e) {}
    return T[l] ? l : 'ru';
  }
  function t(key, vars) {
    var s = T[lang()][key];
    if (s == null) s = T.ru[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\\{(\\w+)\\}/g, function (_, k) { return vars[k] != null ? String(vars[k]) : ''; });
    return s;
  }
  t.lang = lang;
  return t;
})();
`;

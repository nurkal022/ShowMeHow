import { UIKIT_CSS, UIKIT_JS } from '@/lib/runtime';

/**
 * Документ для превью приборов. Внутри работает НАСТОЯЩИЙ кит SimUI — тот же,
 * что окажется в готовой симуляции, — поэтому панель на стенде и панель в
 * результате совпадут, а не будут похожи.
 *
 * Фон прозрачный: под iframe лежит образ, и приборы должны докироваться прямо
 * поверх него, ровно так же, как они докируются поверх сцены в симуляции.
 *
 * Набор приборов меняется без перезагрузки кадра. У кита нет операции «убрать
 * виджет» — он рассчитан на то, что симуляция строит панель один раз, — поэтому
 * пересборка вычищает body и заново исполняет исходник кита, получая чистый
 * SimUI. Это дешевле перезагрузки iframe и не даёт панели мигать.
 */
function scriptSafe(source: string): string {
  return JSON.stringify(source).replace(/<\//g, '<\\/');
}

export function kitPreviewDoc(): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>${UIKIT_CSS}</style>
<style>
  /* Схема кадра должна СОВПАДАТЬ со схемой сцены (у .stage она тоже dark).
     Под sandbox схема страницы внутрь кадра не передаётся, и «light dark»
     здесь разошлось бы с тёмным окружением: браузер подложил бы под кадр
     непрозрачный холст, и тот закрыл бы собой образ. Только явный dark. */
  :root { color-scheme: dark; }
  html, body { background: transparent; overflow: hidden; }
  /* Панель на стенде уже, чем в симуляции: рядом с ней должен остаться образ.
     И ниже: сцена стенда — не полное окно, и в настоящей симуляции панель
     такой высоты поместилась бы, а здесь упиралась бы в край кадра и
     обрезалась. Внутренняя прокрутка оставляет её целой. */
  /* border-box: предел высоты ниже задаётся по внешнему краю панели, а с
     content-box отступы прибавлялись бы сверх него, и панель всё равно
     доставала бы до графика. */
  .sim-panel { width: 204px; overflow-y: auto; box-sizing: border-box; gap: 7px; padding: 12px; }
  .sim-panel h1 { font-size: 14px; }
  .sim-control label { margin-bottom: 2px; }
  /* Компактнее, чем в симуляции: сцена стенда меньше окна, и приборы полного
     размера съедали бы её целиком. Это те же виджеты, только ужатые. */
  .sim-side-panel { max-width: 236px; padding: 10px 12px; }
  .sim-formula-tex { font-size: 14px; }
  /* Предел высоты панели ставится скриптом: она не должна дотягиваться до
     нижнего угла, где лежит график — иначе перекрывала бы его кнопки. */
  .sim-panel, .sim-corner > * { animation: kit-in .22s ease-out; }
  @keyframes kit-in { from { opacity: 0; transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
</head><body>
<script>
var KIT_SOURCE = ${scriptSafe(UIKIT_JS)};
var chart = null, readouts = [], frame = 0, t0 = Date.now();

function post(msg) { parent.postMessage(msg, '*'); }

function build(cfg) {
  document.body.innerHTML = '';
  chart = null; readouts = [];
  // Свежий SimUI: замыкание кита держит ссылки на снятые узлы, переиспользовать нельзя.
  (0, eval)(KIT_SOURCE);
  var K = window.SimUI;
  var has = function (name) { return cfg.instruments.indexOf(name) !== -1; };

  K.title(cfg.title || 'Симуляция');

  if (has('slider')) {
    for (var i = 0; i < cfg.parameters.length; i++) {
      (function (p, index) {
        K.slider({
          name: 'p' + index, label: p, min: 0, max: 100, step: 1, value: 40,
          onChange: function (v) { if (index === 0) post({ type: 'knob', value: v / 100 }); },
        });
      })(cfg.parameters[i], i);
    }
  }
  if (has('presets')) {
    // onApply, а не только values: без ползунков пресет двигать нечего, и кнопка
    // молчала бы в ответ на нажатие. Здесь она в любом случае крутит образ —
    // ровно так же, как в готовой симуляции крутила бы её параметры.
    var preset = function (label, v) {
      return { label: label, values: { p0: v }, onApply: function () { post({ type: 'knob', value: v / 100 }); } };
    };
    K.presets({ items: [preset('Медленно', 15), preset('Обычно', 40), preset('Быстро', 85)] });
  }
  if (has('steps')) {
    K.button({ name: 'step', label: 'Следующий шаг', onClick: function () {} });
  }
  K.speed({ values: [0.5, 1, 2], value: 1 });
  K.playPause({ onPlay: function () {}, onPause: function () {}, onReset: function () {} });

  if (has('readout')) {
    readouts.push(K.readout({ label: cfg.readoutLabel || 'Величина', unit: cfg.readoutUnit || '', digits: 2, corner: 'bl' }));
    readouts.push(K.readout({ label: 'Время', unit: 'с', digits: 1, corner: 'bl' }));
  }
  if (has('chart')) {
    chart = K.chart({ title: cfg.chartTitle || 'График', xLabel: 't, с', yLabel: cfg.chartY || '',
      width: 220, height: 118,
      mode: 'time', series: [{ name: cfg.chartTitle || 'величина', color: '#4f8ff7' }], corner: 'br' });
  }
  if (has('formula') && cfg.tex) {
    K.formula({ title: 'Как это работает', tex: cfg.tex, corner: 'tl' });
  }
}

// Приборы должны жить: цифры бегут, график рисуется. Иначе панель выглядит макетом.
// Но не у всех: тот, кто просил систему не двигать картинку, не должен получить
// бесконечно ползущий график — ему приборы показываются заполненными и статичными.
var calm = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function tick() {
  frame++;
  var t = calm ? 4 : (Date.now() - t0) / 1000;
  var v = 50 + 40 * Math.sin(t * 1.1);
  for (var i = 0; i < readouts.length; i++) readouts[i].set(i === 0 ? v : t);
  if (chart && frame % 4 === 0) chart.push(t, [v]);
  if (!calm) requestAnimationFrame(tick);
}

// В спокойном режиме приборы всё равно должны быть не пустыми: рисуем короткий
// отрезок графика один раз, чтобы панель выглядела работающей, а не сломанной.
function fillCalm() {
  if (!chart) return;
  for (var i = 0; i <= 40; i++) chart.push(i * 0.2, [50 + 40 * Math.sin(i * 0.22)]);
}

// Рукопожатие повторяется, пока не придёт ответ: кадр может успеть загрузиться
// раньше, чем страница подпишется на сообщения, и один-единственный запрос
// тогда пропал бы в пустоту, оставив стенд без приборов.
// Занятые края. Приборы докируются по углам фиксированного размера, а сцена
// стенда меньше окна — поэтому не образ должен угадывать, где приборы, а
// кадр сообщает наружу, сколько места они заняли слева и справа. Родитель
// отдаёт образу чистый прямоугольник между ними; выключили график — образ
// расширяется в освободившееся место.
function widthOf(sel) {
  var el = document.querySelector(sel);
  if (!el) return 0;
  var r = el.getBoundingClientRect();
  return r.width && r.height ? r.width : 0;
}
function heightOf(sel) {
  var el = document.querySelector(sel);
  if (!el) return 0;
  var r = el.getBoundingClientRect();
  return r.width && r.height ? r.height : 0;
}
function report() {
  // Панель не должна дотягиваться до нижнего правого угла: там график, и его
  // кнопка «развернуть» оказывалась под панелью. Предел — высота кадра минус угол.
  var panel = document.querySelector('.sim-panel');
  if (panel) {
    var reserve = Math.max(64, heightOf('.sim-corner-br') + 36);
    var cap = Math.max(160, innerHeight - 12 - reserve) + 'px';
    // Записывать только при изменении: наблюдатель ниже следит за style, и
    // безусловная запись зацикливала бы его на собственном отчёте.
    if (panel.style.maxHeight !== cap) panel.style.maxHeight = cap;
  }
  var edge = 12;
  post({
    type: 'layout',
    left: Math.max(widthOf('.sim-corner-tl'), widthOf('.sim-corner-bl')) + (widthOf('.sim-corner-tl') || widthOf('.sim-corner-bl') ? edge : 0),
    right: Math.max(widthOf('.sim-panel'), widthOf('.sim-corner-tr'), widthOf('.sim-corner-br'))
      + (widthOf('.sim-panel') || widthOf('.sim-corner-tr') || widthOf('.sim-corner-br') ? edge : 0),
  });
}
// Не отложенный вызов, а троттлинг: отчёт уходит не чаще раза в 80 мс, но
// уходит обязательно. Отложенный вызов со сбросом таймера здесь не работал
// вовсе — показания переписывают textContent каждый кадр, и таймер сбрасывался
// быстрее, чем успевал сработать.
var reportTimer = 0;
function reportSoon() {
  if (reportTimer) return;
  reportTimer = setTimeout(function () { reportTimer = 0; report(); }, 80);
}
// Размеры меняются не только при пересборке: подгружается KaTeX, сворачивается
// угол, меняется окно. Наблюдаем за всем этим, а не за одним моментом.
// Наблюдатель ставится заново после каждой пересборки тела кадра: поставленный
// один раз при загрузке он переставал срабатывать после первой же пересборки.
var bodyWatch = null;
function watchBody() {
  if (bodyWatch) bodyWatch.disconnect();
  bodyWatch = new MutationObserver(reportSoon);
  // Только класс: сворачивание угла — это класс. childList наблюдать нельзя:
  // показания переписывают текст каждый кадр, и это был бы сплошной шторм.
  // Новые виджеты появляются только через build(), а формула — по таймерам.
  bodyWatch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}
new ResizeObserver(reportSoon).observe(document.documentElement);
addEventListener('resize', reportSoon);

var handshake = setInterval(function () { post({ type: 'ready' }); }, 250);
addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'sync') return;
  clearInterval(handshake);
  build(e.data.config);
  watchBody();
  if (calm) { fillCalm(); tick(); }
  requestAnimationFrame(report);
  // Формула приходит с KaTeX позже — перемеряем, когда она отрисуется.
  setTimeout(report, 500); setTimeout(report, 1500);
});
requestAnimationFrame(tick);
post({ type: 'ready' });
</script>
</body></html>`;
}

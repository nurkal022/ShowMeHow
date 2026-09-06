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
  /* Панель на стенде уже, чем в симуляции: рядом с ней должен остаться образ. */
  .sim-panel { width: 216px; }
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
    K.presets({ items: [
      { label: 'Медленно', values: { p0: 15 } },
      { label: 'Обычно', values: { p0: 40 } },
      { label: 'Быстро', values: { p0: 85 } },
    ] });
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
var handshake = setInterval(function () { post({ type: 'ready' }); }, 250);
addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'sync') return;
  clearInterval(handshake);
  build(e.data.config);
  if (calm) { fillCalm(); tick(); }
});
requestAnimationFrame(tick);
post({ type: 'ready' });
</script>
</body></html>`;
}

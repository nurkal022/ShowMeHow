/**
 * Страховка от выдуманного API. Слабая модель пишет SimUI.addSlider, SimUI.gauge или
 * chart.setOptions — раньше это TypeError и чёрный экран. Теперь неизвестный метод
 * возвращает «пустой» виджет, который проглатывает любые вызовы, а в консоль уходит
 * ошибка с подсказкой: проверка увидит её и отдаст фиксеру, студент — живой тренажёр.
 * Частые выдумки сразу переадресуются на настоящие примитивы.
 */
export const KIT_GUARD_JS = `
(function () {
  var K = window.SimUI;
  var ALIASES = {
    addSlider: 'slider', range: 'slider', addRange: 'slider', parameter: 'slider', param: 'slider',
    addButton: 'button', btn: 'button', addToggle: 'toggle', checkbox: 'toggle', switch: 'toggle', addCheckbox: 'toggle',
    dropdown: 'select', addSelect: 'select', choice: 'select', radio: 'select',
    addReadout: 'readout', value: 'readout', display: 'readout', stat: 'readout', indicator: 'readout', info: 'note', text: 'note', hint: 'note', description: 'note',
    graph: 'chart', addChart: 'chart', lineChart: 'chart', plotter: 'chart', addGraph: 'chart',
    gauge: 'meter', bar: 'meter', progress: 'meter',
    equation: 'formula', math: 'formula', latex: 'formula', addFormula: 'formula',
    setTitle: 'title', heading: 'title', header: 'title',
    phase: 'banner', status: 'banner', stage: 'banner',
    message: 'toast', notify: 'toast', alert: 'toast', flash: 'toast',
    loop: 'run', animate: 'run', simulate: 'run',
    scene: 'view2d', canvas2d: 'view2d', world: 'view2d', view: 'view2d', view3d: 'scene3d', three: 'scene3d',
    steps: 'steps', lesson: 'steps', quiz: 'task', question: 'task', measurements: 'table',
    controls: 'playPause', playButton: 'playPause', timeSpeed: 'speed', speedControl: 'speed',
    preset: 'presets', addPreset: 'presets', legendPanel: 'legend', goal: 'goals', objectives: 'goals', addAction: 'action',
  };
  function blackhole(path) {
    var fn = function () { return proxy; };
    var proxy = typeof Proxy === 'function' ? new Proxy(fn, {
      get: function (t, k) {
        if (k === 'then' || k === 'toJSON' || typeof k === 'symbol') return undefined;
        if (k === 'valueOf') return function () { return 0; };
        if (k === 'toString') return function () { return ''; };
        return proxy;
      },
      apply: function () { return proxy; },
    }) : fn;
    return proxy;
  }
  var warned = {};
  function complain(name, hint) {
    if (warned[name]) return;
    warned[name] = 1;
    try { console.error('SimUI.' + name + ' не существует' + (hint ? ' — используй SimUI.' + hint : '') + '. Справочник кита — в правилах генерации.'); } catch (e) {}
  }
  if (typeof Proxy !== 'function') return;
  window.SimUI = new Proxy(K, {
    get: function (t, k) {
      if (typeof k === 'symbol' || k in t) return t[k];
      if (k === 'then' || k === 'toJSON' || k === 'constructor') return undefined;
      var alias = ALIASES[k];
      if (alias && typeof t[alias] === 'function') { complain(k, alias); return t[alias]; }
      complain(k, null);
      return blackhole(k);
    },
  });
})();
`;

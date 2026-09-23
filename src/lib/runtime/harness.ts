/** Инжектится в каждый артефакт. Ошибки → parent через postMessage; пауза/пуск/сброс; ответ на sim-state-request. */
export const HARNESS_JS = `
(function () {
  function report(msg) {
    try { parent.postMessage({ type: 'sim-error', message: String(msg) }, '*'); } catch (e) {}
  }
  // Задание «состояние симуляции»: страница урока спрашивает значения контролов.
  function replyState(id) {
    var out = { type: 'sim-state', id: id, ok: false, hasExpose: false, controls: [], state: null };
    try {
      var smh = window.__smh;
      if (!smh) {
        out.reason = 'no-kit';
      } else {
        out.hasExpose = !!smh.hasExpose();
        var cs = smh.controls() || [];
        for (var i = 0; i < cs.length; i++) {
          out.controls.push({ name: cs[i].name, label: cs[i].label, kind: cs[i].kind,
            min: cs[i].min, max: cs[i].max, value: cs[i].value });
        }
        out.state = smh.state();
        out.ok = out.controls.length > 0;
        if (!out.ok) out.reason = 'no-controls';
      }
    } catch (e) {
      out.ok = false;
      out.reason = 'error: ' + (e && e.message || e);
    }
    try { parent.postMessage(out, '*'); } catch (e2) {
      try { out.state = null; parent.postMessage(out, '*'); } catch (e3) {}
    }
  }
  // Урок: учитель задал стартовые значения и закрыл часть ползунков от ученика.
  function applyPreset(d) {
    var out = { type: 'sim-applied', id: d.id, ok: false, applied: 0 };
    try {
      var smh = window.__smh;
      var cs = smh && window.SimUI && window.SimUI.__controls ? window.SimUI.__controls() : [];
      if (cs.length) {
        var values = d.controls || {};
        var locked = d.locked || [];
        for (var i = 0; i < cs.length; i++) {
          var c = cs[i];
          if (Object.prototype.hasOwnProperty.call(values, c.name) && c.set) {
            c.set(c.kind === 'toggle' ? !!values[c.name] : values[c.name]);
            out.applied++;
          }
          if (c.el) {
            var lock = locked.indexOf(c.name) !== -1;
            c.el.style.pointerEvents = lock ? 'none' : '';
            c.el.style.opacity = lock ? '.45' : '';
            c.el.title = lock ? 'Учитель зафиксировал этот параметр' : '';
          }
        }
        out.ok = true;
      }
    } catch (e) { out.ok = false; }
    try { parent.postMessage(out, '*'); } catch (e2) {}
  }
  // «Взять значение из тренажёра»: показания приборов читаются прямо с экрана.
  function replyReadouts(id) {
    var out = { type: 'sim-readouts', id: id, readouts: [] };
    try {
      var rows = document.querySelectorAll('.sim-readout');
      for (var i = 0; i < rows.length && i < 40; i++) {
        var l = rows[i].querySelector('.sim-readout-label');
        var v = rows[i].querySelector('.sim-readout-value');
        if (l && v) out.readouts.push({ label: (l.textContent || '').slice(0, 120), text: (v.textContent || '').slice(0, 60) });
      }
    } catch (e) {}
    try { parent.postMessage(out, '*'); } catch (e2) {}
  }
  // «Покажи и скажи»: следующий клик по тренажёру не уходит в него, а сообщает родителю,
  // куда показали и что там лежит — виджет кита с заголовком или сцена.
  function describeAt(x, y, skip) {
    var els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === skip) continue;
      var box = el.closest ? el.closest('.sim-side-panel, .sim-panel, .sim-banner, .sim-control') : null;
      if (box) {
        if (box.classList.contains('sim-control')) {
          var l = box.querySelector('label');
          return 'контрол «' + ((l && l.textContent) || '').trim().slice(0, 60) + '» на панели параметров';
        }
        if (box.classList.contains('sim-panel')) return 'панель параметров';
        if (box.classList.contains('sim-banner')) return 'баннер фазы «' + (box.textContent || '').trim().slice(0, 60) + '»';
        var h = box.querySelector('.sim-side-title');
        return 'панель «' + ((h && h.textContent) || '').trim().slice(0, 60) + '»';
      }
      if (el.tagName === 'CANVAS') return 'сцена (canvas)';
    }
    return '';
  }
  var picker = null;
  function startPick() {
    if (picker) return;
    picker = document.createElement('div');
    picker.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;' +
      'background:rgba(79,143,247,.06);outline:2px dashed rgba(79,143,247,.7);outline-offset:-4px';
    picker.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var target = describeAt(e.clientX, e.clientY, picker);
      var msg = { type: 'smh-pick', x: e.clientX / innerWidth, y: e.clientY / innerHeight, target: target };
      stopPick();
      try { parent.postMessage(msg, '*'); } catch (err) {}
    }, true);
    document.body.appendChild(picker);
  }
  function stopPick() {
    if (picker && picker.parentNode) picker.parentNode.removeChild(picker);
    picker = null;
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && picker) {
      stopPick();
      try { parent.postMessage({ type: 'smh-pick', cancelled: true }, '*'); } catch (err) {}
    }
  });
  window.addEventListener('error', function (e) {
    report(e.message + ' @' + (e.filename || '') + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    report('unhandledrejection: ' + (e.reason && e.reason.message || e.reason));
  });
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'sim-pause') window.dispatchEvent(new CustomEvent('sim-pause'));
    if (d.type === 'sim-play') window.dispatchEvent(new CustomEvent('sim-play'));
    if (d.type === 'sim-reset') window.dispatchEvent(new CustomEvent('sim-reset'));
    if (d.type === 'sim-state-request') replyState(d.id);
    if (d.type === 'sim-apply') applyPreset(d);
    if (d.type === 'sim-readouts-request') replyReadouts(d.id);
    if (d.type === 'smh-pick-start') startPick();
    if (d.type === 'smh-pick-stop') stopPick();
  });
})();
`;

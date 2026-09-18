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
  });
})();
`;

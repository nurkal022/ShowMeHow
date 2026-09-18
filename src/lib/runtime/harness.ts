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
  });
})();
`;

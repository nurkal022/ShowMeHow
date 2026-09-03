/**
 * Мост интроспекции. Симуляция объявляет своё состояние через SimUI.expose,
 * а headless-сессия читает его и дёргает контролы через window.__smh —
 * так пробы проверяют реальное поведение, а не только картинку.
 */
export const KIT_EXPOSE_JS = `
(function () {
  var api = {};
  window.SimUI.expose = function (o) { api = o || {}; };

  function scanBad(v, path, out, depth) {
    if (depth > 4 || v == null) return;
    if (typeof v === 'number') { if (!isFinite(v)) out.push((path || 'значение') + ' = ' + v); return; }
    if (typeof v === 'object') {
      for (var k in v) {
        if (Object.prototype.hasOwnProperty.call(v, k)) {
          scanBad(v[k], path ? path + '.' + k : k, out, depth + 1);
        }
      }
    }
  }

  window.__smh = {
    hasExpose: function () { return typeof api.getState === 'function'; },
    state: function () {
      if (typeof api.getState !== 'function') return null;
      try { return JSON.parse(JSON.stringify(api.getState())); } catch (e) { return null; }
    },
    badNumbers: function () {
      var out = [];
      if (typeof api.getState === 'function') {
        try { scanBad(api.getState(), '', out, 0); } catch (e) { out.push('getState() бросил: ' + e); }
      }
      var els = document.querySelectorAll('.sim-value, .sim-readout-value, .sim-formula-nums');
      for (var i = 0; i < els.length; i++) {
        var t = els[i].textContent || '';
        if (/NaN|Infinity|undefined/.test(t)) out.push('подпись: ' + t.slice(0, 60));
      }
      return out;
    },
    controls: function () {
      var cs = window.SimUI.__controls();
      var out = [];
      for (var i = 0; i < cs.length; i++) {
        var v = null;
        try { v = cs[i].get ? cs[i].get() : null; } catch (e) { v = null; }
        out.push({ kind: cs[i].kind, name: cs[i].name, label: cs[i].label,
          min: cs[i].min, max: cs[i].max, value: v });
      }
      return out;
    },
    setControl: function (name, value) {
      try { return window.SimUI.__set(name, value); } catch (e) { return false; }
    },
    activate: function (name) {
      var cs = window.SimUI.__controls();
      for (var i = 0; i < cs.length; i++) {
        if (cs[i].name === name && cs[i].activate) { cs[i].activate(); return true; }
      }
      return false;
    },
    reset: function () { if (typeof api.reset === 'function') api.reset(); },
  };
})();
`;

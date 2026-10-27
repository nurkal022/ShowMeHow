/** Инжектится в каждый артефакт. Ошибки → parent через postMessage; пауза/пуск/сброс; ответ на sim-state-request. */
export const HARNESS_JS = `
(function () {
  // iframe тренажёра — sandbox без same-origin: любое обращение к localStorage бросает
  // SecurityError и роняет весь скрипт. Подменяем хранилища памятью — страница работает, просто не помнит.
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { if (window[name]) window[name].getItem('smh'); return; } catch (e) {}
    var data = {};
    var mem = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
    };
    Object.defineProperty(mem, 'length', { get: function () { return Object.keys(data).length; } });
    try { Object.defineProperty(window, name, { value: mem, configurable: true }); } catch (e2) {}
  });
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
            min: cs[i].min, max: cs[i].max, step: cs[i].step, options: cs[i].options, value: cs[i].value });
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
  // Урок: преподаватель задал стартовые значения и закрыл часть ползунков от студента.
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
            c.el.title = lock ? (window.__simT ? window.__simT('locked') : 'Преподаватель зафиксировал этот параметр') : '';
          }
        }
        out.ok = true;
      }
    } catch (e) { out.ok = false; }
    try { parent.postMessage(out, '*'); } catch (e2) {}
  }
  // «Взять значение из тренажёра»: показания приборов читаются прямо с экрана.
  function replyReadouts(id) {
    var out = { type: 'sim-readouts', id: id, readouts: [], notes: [] };
    try {
      // Смысловое состояние для наставника: итог от самой страницы, фаза, отклик заданий.
      var sum = window.__smh && window.__smh.summary ? window.__smh.summary() : '';
      if (sum) out.notes.push(String(sum).slice(0, 300));
      var tx = document.querySelectorAll('.sim-banner, .sim-task-fb');
      for (var j = 0; j < tx.length && j < 6; j++) {
        var s1 = (tx[j].textContent || '').trim();
        if (s1) out.notes.push(s1.slice(0, 160));
      }
    } catch (e0) {}
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
      var box = el.closest ? el.closest('.sim-readout, .sim-side-panel, .sim-panel, .sim-banner, .sim-control') : null;
      if (box) {
        if (box.classList.contains('sim-readout')) {
          var rl = box.querySelector('.sim-readout-label');
          var rv = box.querySelector('.sim-readout-value');
          return 'прибор «' + ((rl && rl.textContent) || '').trim().slice(0, 60) + '» = ' + ((rv && rv.textContent) || '').trim().slice(0, 40);
        }
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
  // Наставник показывает, куда смотреть: контур у ползунка или прибора и короткая пометка рядом.
  function highlight(d) {
    var q = String(d.target || '').toLowerCase().trim();
    var out = { type: 'sim-highlighted', id: d.id, ok: false };
    if (q) {
      var els = document.querySelectorAll('.sim-control, .sim-readout');
      var hit = null;
      for (var i = 0; i < els.length && !hit; i++) {
        var lab = els[i].querySelector('label, .sim-readout-label');
        var txt = ((lab && lab.textContent) || '').toLowerCase().trim();
        if (txt && (txt === q || txt.indexOf(q) !== -1 || q.indexOf(txt) !== -1)) hit = els[i];
      }
      if (hit) {
        if (!document.getElementById('smh-spot-css')) {
          var st = document.createElement('style');
          st.id = 'smh-spot-css';
          st.textContent = '.smh-spot{outline:2px solid #ffd166;outline-offset:3px;border-radius:8px;animation:smh-spot .9s ease-in-out 4}' +
            '@keyframes smh-spot{50%{outline-color:rgba(255,209,102,.15)}}' +
            '.smh-note{position:fixed;z-index:2147483646;max-width:240px;padding:6px 10px;border-radius:8px;background:#ffd166;color:#1d2333;' +
            'font:600 12.5px/1.35 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35);pointer-events:none}';
          document.head.appendChild(st);
        }
        try { hit.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        hit.classList.add('smh-spot');
        setTimeout(function () { hit.classList.remove('smh-spot'); }, 3800);
        if (d.note) {
          var r = hit.getBoundingClientRect();
          var n = document.createElement('div');
          n.className = 'smh-note';
          n.textContent = String(d.note).slice(0, 140);
          n.style.left = Math.max(8, Math.min(innerWidth - 250, r.left)) + 'px';
          n.style.top = (r.bottom + 50 < innerHeight ? r.bottom + 8 : Math.max(8, r.top - 44)) + 'px';
          document.body.appendChild(n);
          setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 4500);
        }
        out.ok = true;
      }
    }
    try { parent.postMessage(out, '*'); } catch (e2) {}
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
    // Хост рисует кнопки тренажёра у себя (урок, показ) и нажимает их по имени.
    if (d.type === 'sim-activate' && window.__smh) {
      var okA = false;
      try { okA = window.__smh.activate(String(d.name)); } catch (e) {}
      try { parent.postMessage({ type: 'sim-activated', id: d.id, name: d.name, ok: okA }, '*'); } catch (e2) {}
    }
    if (d.type === 'sim-set' && window.__smh) {
      var okS = false;
      try { okS = window.__smh.setControl(String(d.name), d.value); } catch (e) {}
      try { parent.postMessage({ type: 'sim-set-done', id: d.id, name: d.name, ok: okS }, '*'); } catch (e2) {}
    }
    if (d.type === 'sim-readouts-request') replyReadouts(d.id);
    if (d.type === 'sim-highlight') highlight(d);
    if (d.type === 'smh-pick-start') startPick();
    if (d.type === 'smh-pick-stop') stopPick();
  });
})();
`;

/**
 * Виджеты урока и наложение настроек.
 *
 * Урок: шаги сценария, задание с проверкой ответа и таблица измерений. Раньше модели
 * приходилось рисовать это руками — и сценарий почти никогда не появлялся: кода
 * слишком много для одного ответа. Теперь это три вызова кита.
 *
 * Наложение настроек: <script type="application/json" id="sim-config"> в артефакте
 * переопределяет подписи, диапазоны и начальные значения слайдеров, пресеты и название.
 * Так учитель меняет параметры тренажёра без модели — правится только JSON, код не трогается.
 */
export const KIT_LESSON_JS = `
(function () {
  var K = window.SimUI;

  // ---------- Наложение настроек ----------
  var cfg = null;
  function config() {
    if (cfg !== null) return cfg;
    cfg = {};
    try {
      var el = document.getElementById('sim-config');
      if (el) cfg = JSON.parse(el.textContent || '{}') || {};
    } catch (e) { cfg = {}; }
    return cfg;
  }
  function later(fn) {
    try { fn(); } catch (e) { setTimeout(function () { try { fn(); } catch (e2) {} }, 0); }
  }
  var origSlider = K.slider;
  K.slider = function (o) {
    var ov = (config().parameters || {})[o.name];
    if (!ov) return origSlider(o);
    var m = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) m[k] = o[k];
    var keys = ['label', 'min', 'max', 'step', 'value', 'unit'];
    for (var i = 0; i < keys.length; i++) if (ov[keys[i]] != null) m[keys[i]] = ov[keys[i]];
    var inp = origSlider(m);
    if (ov.value != null && Number(ov.value) !== Number(o.value)) {
      later(function () { o.onChange(Number(ov.value)); });
    }
    return inp;
  };
  var origPresets = K.presets;
  K.presets = function (o) {
    var items = config().presets;
    if (Array.isArray(items) && items.length) return origPresets({ items: items });
    return origPresets(o);
  };
  var origTitle = K.title;
  K.title = function (t) { return origTitle(config().title || t); };
  K.config = function () { return config(); };
  // Публичный способ выставить контрол по имени: шаги урока двигают слайдеры так же, как пресеты.
  K.set = function (name, value) { return K.__set(name, value); };

  // ---------- Шаги урока ----------
  function steps(o) {
    o = o || {};
    var items = o.items || [];
    var body = K.panel({ title: o.title || 'Урок', corner: o.corner || 'tl' });
    var head = document.createElement('div'); head.className = 'sim-step-head';
    var text = document.createElement('div'); text.className = 'sim-step-text';
    var nav = document.createElement('div'); nav.className = 'sim-btns';
    var prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '← Назад';
    var next = document.createElement('button'); next.type = 'button'; next.textContent = 'Далее →';
    var dots = document.createElement('div'); dots.className = 'sim-step-dots';
    nav.appendChild(prev); nav.appendChild(next);
    body.appendChild(head); body.appendChild(text); body.appendChild(dots); body.appendChild(nav);
    var cur = -1;
    function set(i) {
      if (!items.length) return;
      i = Math.max(0, Math.min(items.length - 1, Number(i) || 0));
      if (i === cur) return;
      cur = i;
      head.textContent = 'Шаг ' + (i + 1) + ' из ' + items.length + ': ' + (items[i].title || '');
      text.textContent = items[i].text || '';
      dots.innerHTML = '';
      for (var d = 0; d < items.length; d++) {
        var dot = document.createElement('i');
        if (d === i) dot.className = 'on'; else if (d < i) dot.className = 'done';
        dots.appendChild(dot);
      }
      prev.disabled = i === 0;
      next.disabled = i === items.length - 1;
      if (o.onStep) later(function () { o.onStep(i, items[i]); });
    }
    prev.onclick = function () { set(cur - 1); };
    next.onclick = function () { set(cur + 1); };
    set(0);
    K.__register({ kind: 'steps', name: o.name || 'steps', label: 'Шаги урока',
      min: 0, max: Math.max(0, items.length - 1),
      get: function () { return cur; }, set: set });
    return { set: set, get: function () { return cur; }, element: body };
  }

  // ---------- Задание с проверкой ответа ----------
  function task(o) {
    o = o || {};
    var body = K.panel({ title: o.title || 'Задание', corner: o.corner || 'tl' });
    var q = document.createElement('div'); q.className = 'sim-task-q'; q.textContent = o.question || '';
    body.appendChild(q);
    var fb = document.createElement('div'); fb.className = 'sim-task-fb';
    var value = null;
    var solved = false;
    function verdict(ok) {
      solved = ok;
      fb.className = 'sim-task-fb ' + (ok ? 'ok' : 'no');
      fb.textContent = ok ? ('Верно ✓' + (o.explain ? ' ' + o.explain : ''))
        : ('Пока нет.' + (o.hint ? ' Подсказка: ' + o.hint : ''));
      if (o.onAnswer) later(function () { o.onAnswer(ok, value); });
    }
    function check() {
      if (typeof o.check === 'function') { try { verdict(!!o.check(value)); } catch (e) { verdict(false); } return; }
      if (o.options) { verdict(Number(value) === Number(o.correct)); return; }
      var want = typeof o.answer === 'function' ? o.answer() : Number(o.answer);
      var got = Number(value);
      var tol = o.tolerance == null ? 0.05 : Number(o.tolerance);
      verdict(isFinite(got) && isFinite(want) && Math.abs(got - want) <= Math.abs(want) * tol + 1e-9);
    }
    if (o.options) {
      var box = document.createElement('div'); box.className = 'sim-presets';
      for (var i = 0; i < o.options.length; i++) {
        (function (idx) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = o.options[idx];
          b.onclick = function () { value = idx; check(); };
          box.appendChild(b);
        })(i);
      }
      body.appendChild(box);
    } else {
      var row = document.createElement('div'); row.className = 'sim-task-row';
      var inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any';
      inp.className = 'sim-task-input'; inp.placeholder = 'ответ' + (o.unit ? ', ' + o.unit : '');
      var go = document.createElement('button'); go.type = 'button'; go.textContent = 'Проверить';
      go.onclick = function () { value = inp.value === '' ? NaN : Number(inp.value); check(); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.onclick(); });
      row.appendChild(inp); row.appendChild(go); body.appendChild(row);
    }
    body.appendChild(fb);
    K.__register({ kind: 'task', name: o.name || ('task' + Math.random().toString(36).slice(2, 6)),
      label: o.question || 'Задание', get: function () { return solved ? 1 : 0; },
      set: function (v) { value = v; check(); } });
    return { check: check, solved: function () { return solved; }, element: body };
  }

  // ---------- Таблица измерений ----------
  function table(o) {
    o = o || {};
    var cols = o.columns || [];
    var max = o.max || 12;
    var body = K.panel({ title: o.title || 'Измерения', corner: o.corner || 'bl' });
    var t = document.createElement('table'); t.className = 'sim-table';
    var thead = document.createElement('tr');
    for (var i = 0; i < cols.length; i++) {
      var th = document.createElement('th');
      th.textContent = cols[i].label + (cols[i].unit ? ', ' + cols[i].unit : '');
      thead.appendChild(th);
    }
    t.appendChild(thead);
    body.appendChild(t);
    var rows = [];
    var digits = o.digits == null ? 2 : o.digits;
    function add(row) {
      rows.push(row);
      if (rows.length > max) { rows.shift(); t.removeChild(t.children[1]); }
      var tr = document.createElement('tr');
      for (var j = 0; j < cols.length; j++) {
        var td = document.createElement('td');
        var v = row[j];
        td.textContent = (typeof v === 'number' && isFinite(v)) ? v.toFixed(digits) : String(v == null ? '—' : v);
        tr.appendChild(td);
      }
      t.appendChild(tr);
    }
    function clear() {
      rows = [];
      while (t.children.length > 1) t.removeChild(t.lastChild);
    }
    if (typeof o.record === 'function') {
      var btns = document.createElement('div'); btns.className = 'sim-btns';
      var rec = document.createElement('button'); rec.type = 'button'; rec.textContent = '● Записать';
      rec.onclick = function () { try { add(o.record()); } catch (e) {} };
      var clr = document.createElement('button'); clr.type = 'button'; clr.textContent = 'Очистить';
      clr.onclick = clear;
      btns.appendChild(rec); btns.appendChild(clr); body.appendChild(btns);
      K.__register({ kind: 'table', name: o.name || 'table', label: o.title || 'Измерения',
        get: function () { return rows.length; }, activate: rec.onclick });
    }
    return { add: add, clear: clear, rows: function () { return rows.slice(); }, element: body };
  }

  K.steps = steps;
  K.task = task;
  K.table = table;
})();
`;

export const KIT_LESSON_CSS = `
.sim-step-head { font-size:13px; font-weight:600; color:var(--sim-text); }
.sim-step-text { font-size:12px; color:var(--sim-muted); line-height:1.5; max-width:300px; }
.sim-step-dots { display:flex; gap:5px; }
.sim-step-dots i { width:8px; height:8px; border-radius:50%; background:#2a3341; display:inline-block; }
.sim-step-dots i.done { background:color-mix(in srgb, var(--sim-accent) 45%, #2a3341); }
.sim-step-dots i.on { background:var(--sim-accent); }
.sim-btns button:disabled { opacity:.4; cursor:default; }
.sim-task-q { font-size:12.5px; line-height:1.5; max-width:300px; }
.sim-task-row { display:flex; gap:6px; }
.sim-task-input { flex:1; min-width:0; padding:6px 8px; border-radius:8px; border:1px solid #2a3341;
  background:var(--sim-bg); color:var(--sim-text); font:inherit; font-size:13px; }
.sim-task-row button { padding:6px 10px; border-radius:8px; border:1px solid #2a3341;
  background:var(--sim-panel); color:var(--sim-text); cursor:pointer; font:inherit; font-size:12px; }
.sim-task-fb { font-size:12px; line-height:1.45; min-height:1em; }
.sim-task-fb.ok { color:#4fd18b; } .sim-task-fb.no { color:#f7b24f; }
.sim-table { border-collapse:collapse; font-size:11.5px; font-variant-numeric:tabular-nums; }
.sim-table th { color:var(--sim-muted); font-weight:500; text-align:right; padding:2px 6px; border-bottom:1px solid #2a3341; }
.sim-table td { text-align:right; padding:2px 6px; }
`;

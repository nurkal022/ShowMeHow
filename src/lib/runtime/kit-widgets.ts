import { CDN_WHITELIST } from '../cdn';

/**
 * Виджеты SimUI 2.0. Всё, что раньше модель рисовала руками через position:fixed
 * (показания, формулы, баннер такта, легенда), теперь примитив кита: единый вид,
 * докировка по углам, сворачивание и мобильный лейаут — бесплатно.
 */
export const KIT_WIDGETS_JS = `
(function () {
  var K = window.SimUI;

  // ---------- Показания величин: одна панель «Величины» на угол ----------
  var readoutBodies = {};
  function readout(o) {
    o = o || {};
    var corner = o.corner || 'bl';
    if (!readoutBodies[corner]) {
      readoutBodies[corner] = K.panel({ title: o.panelTitle || 'Величины', corner: corner });
    }
    var row = document.createElement('div');
    row.className = 'sim-readout';
    var lab = document.createElement('span');
    lab.className = 'sim-readout-label';
    lab.textContent = o.label;
    var val = document.createElement('b');
    val.className = 'sim-readout-value';
    val.textContent = '—';
    row.appendChild(lab);
    row.appendChild(val);
    readoutBodies[corner].appendChild(row);
    var digits = o.digits == null ? 2 : o.digits;
    return {
      set: function (v) {
        var t = (typeof v === 'number' && isFinite(v)) ? v.toFixed(digits) : String(v);
        val.textContent = t + (o.unit ? ' ' + o.unit : '');
      },
      element: row,
    };
  }

  // ---------- Легенда цветов ----------
  function legend(o) {
    o = o || {};
    var body = K.panel({ title: o.title || 'Легенда', corner: o.corner || 'bl' });
    var wrap = document.createElement('div');
    wrap.className = 'sim-legend';
    var items = o.items || [];
    for (var i = 0; i < items.length; i++) {
      var sp = document.createElement('span');
      var sw = document.createElement('i');
      sw.style.background = items[i].color;
      sp.appendChild(sw);
      sp.appendChild(document.createTextNode(items[i].label));
      wrap.appendChild(sp);
    }
    body.appendChild(wrap);
    return wrap;
  }

  // ---------- Баннер фазы/такта: крупная плашка сверху по центру ----------
  function banner(o) {
    o = o || {};
    var el = document.createElement('div');
    el.className = 'sim-banner';
    var name = document.createElement('div');
    name.className = 'sim-banner-name';
    var sub = document.createElement('div');
    sub.className = 'sim-banner-sub';
    el.appendChild(name);
    el.appendChild(sub);
    document.body.appendChild(el);
    var items = o.items || [];
    var cur = -1;
    function set(i) {
      if (i === cur || !items[i]) return;
      cur = i;
      name.textContent = items[i].name;
      sub.textContent = items[i].sub || '';
      el.style.setProperty('--sim-banner-color', items[i].color || '#4f8ff7');
    }
    set(0);
    return { set: set, element: el };
  }

  // ---------- Формула KaTeX с подстановкой живых значений ----------
  var katexState = 0; // 0 — не грузили, 1 — грузится, 2 — готово/провалилось
  var katexQueue = [];
  function withKatex(cb) {
    if (katexState === 2 || window.katex) { cb(); return; }
    katexQueue.push(cb);
    if (katexState === 1) return;
    katexState = 1;
    function flush() {
      katexState = 2;
      for (var i = 0; i < katexQueue.length; i++) katexQueue[i]();
      katexQueue = [];
    }
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '${CDN_WHITELIST.katexCss}';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = '${CDN_WHITELIST.katexJs}';
    js.onload = flush;
    js.onerror = flush; // CDN недоступен — остаёмся на текстовом виде формулы
    document.head.appendChild(js);
  }

  function formula(o) {
    o = o || {};
    var body = K.panel({ title: o.title || 'Как это работает', corner: o.corner || 'bl' });
    var tex = document.createElement('div');
    tex.className = 'sim-formula-tex';
    tex.textContent = o.tex || '';
    var nums = document.createElement('div');
    nums.className = 'sim-formula-nums';
    body.appendChild(tex);
    body.appendChild(nums);
    if (o.note) {
      var note = document.createElement('div');
      note.className = 'sim-formula-note';
      note.textContent = o.note;
      body.appendChild(note);
    }
    if (o.tex) {
      withKatex(function () {
        if (!window.katex) return;
        try { window.katex.render(o.tex, tex, { throwOnError: false }); } catch (e) {}
      });
    }
    var vars = o.vars || {};
    return {
      set: function (values) {
        var parts = [];
        for (var k in values) {
          if (!Object.prototype.hasOwnProperty.call(values, k)) continue;
          var meta = vars[k] || {};
          var v = values[k];
          var t = (typeof v === 'number' && isFinite(v)) ? (Math.round(v * 1000) / 1000) : v;
          parts.push((meta.label || k) + ' = ' + t + (meta.unit ? ' ' + meta.unit : ''));
        }
        nums.textContent = parts.join('   ·   ');
      },
      element: body,
    };
  }

  // ---------- Дискретные контролы в панели управления ----------
  function controlRow(labelText) {
    var wrap = document.createElement('div');
    wrap.className = 'sim-control';
    var lab = document.createElement('label');
    lab.textContent = labelText;
    wrap.appendChild(lab);
    return { wrap: wrap, label: lab };
  }

  function select(o) {
    var p = K.__panel();
    var row = controlRow(o.label);
    var sel = document.createElement('select');
    sel.className = 'sim-select';
    var opts = o.options || [];
    for (var i = 0; i < opts.length; i++) {
      var op = document.createElement('option');
      var raw = opts[i];
      op.value = String(raw && raw.value !== undefined ? raw.value : raw);
      op.textContent = String(raw && raw.label !== undefined ? raw.label : raw);
      sel.appendChild(op);
    }
    if (o.value !== undefined) sel.value = String(o.value);
    sel.addEventListener('change', function () { o.onChange(sel.value); });
    row.wrap.appendChild(sel);
    p.appendChild(row.wrap);
    K.__register({
      kind: 'select', name: o.name || o.label, label: o.label,
      get: function () { return sel.value; },
      set: function (v) { sel.value = String(v); o.onChange(sel.value); },
    });
    return sel;
  }

  function toggle(o) {
    var p = K.__panel();
    var row = controlRow(o.label);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sim-toggle';
    var on = !!o.value;
    function sync() {
      btn.textContent = on ? 'вкл' : 'выкл';
      btn.className = on ? 'sim-toggle sim-toggle-on' : 'sim-toggle';
    }
    btn.onclick = function () { on = !on; sync(); o.onChange(on); };
    sync();
    row.wrap.appendChild(btn);
    p.appendChild(row.wrap);
    K.__register({
      kind: 'toggle', name: o.name || o.label, label: o.label,
      get: function () { return on; },
      set: function (v) { on = !!v; sync(); o.onChange(on); },
      activate: function () { btn.onclick(); },
    });
    return btn;
  }

  function button(o) {
    var p = K.__panel();
    var box = document.createElement('div');
    box.className = 'sim-btns';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    b.onclick = function () { o.onClick(); };
    box.appendChild(b);
    p.appendChild(box);
    K.__register({
      kind: 'button', name: o.name || o.label, label: o.label,
      activate: function () { b.onclick(); },
    });
    return b;
  }

  function presets(o) {
    var p = K.__panel();
    var box = document.createElement('div');
    box.className = 'sim-presets';
    var items = o.items || [];
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.label;
        b.onclick = function () {
          for (var k in item.values) {
            if (Object.prototype.hasOwnProperty.call(item.values, k)) K.__set(k, item.values[k]);
          }
          if (item.onApply) item.onApply();
        };
        box.appendChild(b);
      })(items[i]);
    }
    p.appendChild(box);
    return box;
  }

  function speed(o) {
    o = o || {};
    var values = o.values || [0.25, 0.5, 1, 2];
    var cur = o.value == null ? 1 : o.value;
    var p = K.__panel();
    var wrap = document.createElement('div');
    wrap.className = 'sim-control';
    var lab = document.createElement('label');
    var val = document.createElement('span');
    val.className = 'sim-value';
    lab.textContent = 'Скорость времени';
    lab.appendChild(val);
    var box = document.createElement('div');
    box.className = 'sim-btns';
    function sync() { val.textContent = cur + '×'; }
    for (var i = 0; i < values.length; i++) {
      (function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = v + '×';
        b.onclick = function () { cur = v; sync(); if (o.onChange) o.onChange(v); };
        box.appendChild(b);
      })(values[i]);
    }
    sync();
    wrap.appendChild(lab);
    wrap.appendChild(box);
    p.appendChild(wrap);
    K.__register({
      kind: 'speed', name: o.name || 'speed', label: 'Скорость времени',
      get: function () { return cur; },
      set: function (v) { cur = Number(v); sync(); if (o.onChange) o.onChange(cur); },
    });
    return { get: function () { return cur; } };
  }

  function goals(list) {
    var body = K.panel({ title: 'Чему учит', corner: 'tl', collapsed: true });
    var ul = document.createElement('ul');
    ul.className = 'sim-goals';
    for (var i = 0; i < list.length; i++) {
      var li = document.createElement('li');
      li.textContent = list[i];
      ul.appendChild(li);
    }
    body.appendChild(ul);
    return ul;
  }

  K.readout = readout;
  K.legend = legend;
  K.banner = banner;
  K.formula = formula;
  K.select = select;
  K.toggle = toggle;
  K.button = button;
  K.presets = presets;
  K.speed = speed;
  K.goals = goals;
})();
`;

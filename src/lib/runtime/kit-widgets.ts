import { CDN_WHITELIST } from '../cdn';

/**
 * Виджеты SimUI. Всё, что раньше модель рисовала руками через position:fixed
 * (показания, формулы, баннер такта, легенда), — примитив кита: единый вид,
 * докировка по углам, сворачивание и мобильный лейаут — бесплатно.
 *
 * Привязка: у прибора может быть key ('h' — поле PHYS.observe или параметр P) или
 * value: function (o, P) {…}. Тогда SimUI.run обновляет его сам каждый кадр, и модели
 * не нужно писать updateInstruments. Ручной .set() по-прежнему работает.
 */
export const KIT_WIDGETS_JS = `
(function () {
  var K = window.SimUI;
  var bound = [];
  /** Прибор, который SimUI.run обновляет сам: tick(o, P) каждый кадр (с троттлингом внутри). */
  function bind(w) { bound.push(w); return w; }
  K.__bound = function () { return bound; };

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  /** Значение привязки: key — из o, затем из P; value — функция (o, P). */
  function resolve(src, o, P) {
    if (typeof src === 'function') return src(o || {}, P || {});
    if (typeof src === 'string') {
      if (o && o[src] !== undefined) return o[src];
      if (P && P[src] !== undefined) return P[src];
      return undefined;
    }
    return src;
  }
  K.__resolve = resolve;

  /** Число для подписи: фиксированные знаки, если заданы; иначе 3 значащие цифры без «-0». */
  function fmtNum(v, digits) {
    if (typeof v !== 'number') return v == null ? '—' : String(v);
    if (!isFinite(v)) return '—';
    if (digits != null) { var s = v.toFixed(digits); return /^-0(\\.0+)?$/.test(s) ? s.slice(1) : s; }
    var a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e5 || a < 1e-3) return v.toExponential(2).replace('e+', 'e');
    var d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return v.toFixed(d);
  }
  K.fmt = fmtNum;

  /** Запись текста не чаще раза в 90 мс и только если он изменился: цифры не мельтешат и не грузят кадр. */
  function throttledText(el) {
    var last = null, pending = null, at = 0, timer = null;
    function write() { timer = null; if (pending !== last) { el.textContent = pending; last = pending; } at = now(); }
    return function (t) {
      pending = t;
      if (t === last) return;
      if (now() - at >= 90) write();
      else if (!timer) timer = setTimeout(write, 90);
    };
  }

  // ---------- Показания величин: одна панель «Величины» на угол ----------
  var readoutBodies = {};
  function readout(o) {
    if (typeof o === 'string') o = { label: arguments[0], unit: arguments[1], digits: arguments[2] };
    o = o || {};
    var corner = o.corner || 'bl';
    if (!readoutBodies[corner]) {
      readoutBodies[corner] = K.panel({ title: o.panelTitle || __simT('readouts'), corner: corner });
    }
    var row = document.createElement('div');
    row.className = 'sim-readout';
    if (o.color) row.style.setProperty('--sim-dot', K.color ? K.color(o.color) : o.color);
    var lab = document.createElement('span');
    lab.className = 'sim-readout-label';
    lab.textContent = K.uni(o.label || o.name || o.key || '');
    var val = document.createElement('b');
    val.className = 'sim-readout-value';
    if (o.unit) o.unit = K.uni(o.unit);
    val.textContent = '—';
    row.appendChild(lab);
    row.appendChild(val);
    readoutBodies[corner].appendChild(row);
    var write = throttledText(val);
    function set(v) {
      var t = typeof v === 'number' ? fmtNum(v, o.digits) : (v == null ? '—' : String(v));
      write(t + (o.unit && typeof v === 'number' && isFinite(v) ? ' ' + o.unit : ''));
    }
    var api = { set: set, setValue: set, update: set, setText: set, element: row };
    var src = o.value !== undefined && typeof o.value === 'function' ? o.value : o.key;
    if (src !== undefined) { api.key = typeof src === 'string' ? src : null; api.label = lab.textContent; bind({ widget: api, tick: function (oo, P) { set(resolve(src, oo, P)); }, keys: typeof src === 'string' ? [src] : [] }); }
    return api;
  }

  /** Несколько показаний сразу: {h: {label, unit}, v: 'Скорость, м/с'} или массив опций readout. */
  function readouts(map, opts) {
    opts = opts || {};
    var out = {};
    if (Array.isArray(map)) {
      for (var i = 0; i < map.length; i++) { var m = map[i]; if (opts.corner && !m.corner) m.corner = opts.corner; out[m.key || m.label] = readout(m); }
      return out;
    }
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var d = typeof map[k] === 'string' ? { label: map[k] } : (map[k] || {});
      var r = {};
      for (var q in d) r[q] = d[q];
      if (r.key === undefined && r.value === undefined) r.key = k;
      if (opts.corner && !r.corner) r.corner = opts.corner;
      out[k] = readout(r);
    }
    return out;
  }

  // ---------- Легенда цветов ----------
  function legend(o) {
    if (Array.isArray(o)) o = { items: o };
    o = o || {};
    var body = K.panel({ title: o.title || __simT('legend'), corner: o.corner || 'bl' });
    var wrap = document.createElement('div');
    wrap.className = 'sim-legend';
    var items = o.items || [];
    for (var i = 0; i < items.length; i++) {
      var sp = document.createElement('span');
      var sw = document.createElement('i');
      sw.style.background = K.color ? K.color(items[i].color) : items[i].color;
      sp.appendChild(sw);
      sp.appendChild(document.createTextNode(K.uni(items[i].label || items[i].name || '')));
      wrap.appendChild(sp);
    }
    body.appendChild(wrap);
    return wrap;
  }

  // ---------- Баннер фазы/такта: крупная плашка сверху по центру ----------
  function banner(o) {
    if (Array.isArray(o)) o = { items: o };
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
    for (var j = 0; j < items.length; j++) if (typeof items[j] === 'string') items[j] = { name: items[j] };
    var cur = -1;
    function set(i) {
      if (typeof i === 'string') { // имя фазы вместо номера
        for (var q = 0; q < items.length; q++) if (items[q].name === i) { i = q; break; }
        if (typeof i === 'string') { items.push({ name: i }); i = items.length - 1; }
      }
      i = Math.round(Number(i));
      if (i === cur || !items[i]) return;
      cur = i;
      name.textContent = K.uni(items[i].name);
      sub.textContent = K.uni(items[i].sub || '');
      el.style.setProperty('--sim-banner-color', K.color ? K.color(items[i].color || 'blue') : (items[i].color || '#4f8ff7'));
      el.classList.remove('sim-pulse');
      void el.offsetWidth;
      el.classList.add('sim-pulse');
    }
    set(0);
    var api = { set: set, get: function () { return cur; }, element: el };
    var src = o.phase || o.value || o.key;
    if (src !== undefined) bind({ widget: api, tick: function (oo, P) { var v = resolve(src, oo, P); if (v != null) set(v); }, keys: typeof src === 'string' ? [src] : [] });
    return api;
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
      for (var i = 0; i < katexQueue.length; i++) { try { katexQueue[i](); } catch (e) {} }
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
  K.__katex = withKatex;
  /** Кириллица внутри формулы — в \\text{}: иначе KaTeX ставит её курсивом-«математикой» или ругается. */
  function texSafe(tex) {
    // Уже обёрнутое в \\text{…} не трогаем, остальную кириллицу оборачиваем.
    var CYR = /([А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі][А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі.,]*(?:\\s+[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі][А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі.,]*)*)/g;
    var parts = String(tex).split(/(\\\\text\\s*\\{[^{}]*\\})/);
    for (var i = 0; i < parts.length; i += 2) parts[i] = parts[i].replace(CYR, '\\\\text{$1}');
    return parts.join('');
  }
  K.texSafe = texSafe;
  function renderTex(el, tex, display) {
    // Разделители \\[ \\], $$ и \\( \\) модели пишут по привычке — KaTeX их не ждёт.
    tex = String(tex).trim().replace(/^\\$\\$?|\\$\\$?$/g, '').replace(/^\\\\\\[|\\\\\\]$/g, '').replace(/^\\\\\\(|\\\\\\)$/g, '');
    tex = texSafe(tex);
    el.textContent = K.uni ? K.uni(tex) : tex;
    withKatex(function () {
      if (!window.katex) return;
      try { window.katex.render(tex, el, { throwOnError: true, displayMode: !!display, strict: 'ignore' }); }
      catch (e) {
        // Формула не разобралась — читаемый текст вместо красной простыни исходника.
        el.textContent = K.uni ? K.uni(tex) : tex;
      }
    });
  }
  K.tex = renderTex;

  function formula(o) {
    if (typeof o === 'string') o = { tex: o };
    o = o || {};
    var body = K.panel({ title: o.title || __simT('formula'), corner: o.corner || 'bl' });
    var texList = Array.isArray(o.tex) ? o.tex : (o.tex ? [o.tex] : []);
    for (var t = 0; t < texList.length; t++) {
      var tex = document.createElement('div');
      tex.className = 'sim-formula-tex';
      body.appendChild(tex);
      renderTex(tex, texList[t], true);
    }
    var nums = document.createElement('div');
    nums.className = 'sim-formula-nums';
    body.appendChild(nums);
    if (o.note) {
      var note = document.createElement('div');
      note.className = 'sim-formula-note';
      note.textContent = o.note;
      body.appendChild(note);
    }
    var vars = o.vars || {};
    var chips = {};
    function chip(k) {
      if (chips[k]) return chips[k];
      var meta = vars[k] || {};
      var c = document.createElement('span');
      c.className = 'sim-chip';
      var n = document.createElement('i');
      var lab = String(meta.label || k);
      if (/[\\\\^_]/.test(lab)) { var tx = document.createElement('span'); renderTex(tx, lab, false); n.appendChild(tx); n.appendChild(document.createTextNode(' = ')); }
      else n.textContent = lab + ' = ';
      var v = document.createElement('b');
      c.appendChild(n); c.appendChild(v);
      nums.appendChild(c);
      chips[k] = { el: c, write: throttledText(v), meta: meta };
      return chips[k];
    }
    var api = {
      set: function (values) {
        for (var k in values) {
          if (!Object.prototype.hasOwnProperty.call(values, k)) continue;
          var ch = chip(k), v = values[k];
          var txt = typeof v === 'number' ? fmtNum(v, ch.meta.digits) : String(v);
          ch.write(txt + (ch.meta.unit ? ' ' + ch.meta.unit : ''));
        }
      },
      element: body,
    };
    api.update = api.set;
    api.setValues = api.set;
    // Переменные формулы с ключами из observe/P подставляются сами.
    var keys = [];
    for (var vk in vars) if (Object.prototype.hasOwnProperty.call(vars, vk)) keys.push(vk);
    if (keys.length && o.live !== false) {
      bind({ widget: api, keys: [], tick: function (oo, P) {
        var vals = {}, any = false;
        for (var i = 0; i < keys.length; i++) {
          var meta = vars[keys[i]] || {};
          var v = resolve(meta.value || meta.key || keys[i], oo, P);
          if (v !== undefined) { vals[keys[i]] = v; any = true; }
        }
        if (any) api.set(vals);
      } });
    }
    return api;
  }

  // ---------- Заметка: короткий текст с пояснением ----------
  function note(o) {
    if (typeof o === 'string') o = { text: o };
    o = o || {};
    var body = K.panel({ title: o.title || __simT('note'), corner: o.corner || 'tl', collapsed: !!o.collapsed });
    var p = document.createElement('div');
    p.className = 'sim-note';
    p.textContent = o.text || '';
    body.appendChild(p);
    return { set: function (t) { p.textContent = t; }, element: body };
  }

  // ---------- Шкала-прибор: горизонтальная полоса с зонами ----------
  var meterBodies = {};
  function meter(o) {
    o = o || {};
    var corner = o.corner || 'bl';
    if (!meterBodies[corner]) meterBodies[corner] = K.panel({ title: o.panelTitle || __simT('meters'), corner: corner });
    var min = Number(o.min == null ? 0 : o.min), max = Number(o.max == null ? 1 : o.max);
    if (!(max > min)) max = min + 1;
    var row = document.createElement('div'); row.className = 'sim-meter';
    var head = document.createElement('div'); head.className = 'sim-meter-head';
    var lab = document.createElement('span'); lab.textContent = K.uni(o.label || o.key || '');
    var val = document.createElement('b'); val.textContent = '—';
    head.appendChild(lab); head.appendChild(val);
    var bar = document.createElement('div'); bar.className = 'sim-meter-bar';
    var fill = document.createElement('i');
    bar.appendChild(fill);
    row.appendChild(head); row.appendChild(bar);
    meterBodies[corner].appendChild(row);
    var color = K.color ? K.color(o.color || 'blue') : (o.color || '#4f8ff7');
    var write = throttledText(val);
    function set(v) {
      var n = Number(v);
      if (!isFinite(n)) { write('—'); return; }
      var k = Math.max(0, Math.min(1, (n - min) / (max - min)));
      var c = color;
      if (o.zones) for (var z = 0; z < o.zones.length; z++) { if (n <= o.zones[z].to) { c = K.color ? K.color(o.zones[z].color) : o.zones[z].color; break; } }
      fill.style.transform = 'scaleX(' + k.toFixed(4) + ')';
      fill.style.background = c;
      write(fmtNum(n, o.digits) + (o.unit ? ' ' + o.unit : ''));
    }
    var api = { set: set, element: row };
    var src = typeof o.value === 'function' ? o.value : o.key;
    if (src !== undefined) bind({ widget: api, tick: function (oo, P) { set(resolve(src, oo, P)); }, keys: typeof src === 'string' ? [src] : [] });
    return api;
  }

  // ---------- Всплывающее сообщение: событие, «вау-момент», предупреждение ----------
  var toastBox = null, toastSeen = {};
  function toast(text, opts) {
    if (text && typeof text === 'object') { opts = text; text = opts.text; }
    opts = opts || {};
    text = String(text == null ? '' : text);
    var t = now();
    if (toastSeen[text] && t - toastSeen[text] < (opts.every || 3000)) return;
    toastSeen[text] = t;
    if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'sim-toasts'; document.body.appendChild(toastBox); }
    var el = document.createElement('div');
    el.className = 'sim-toast';
    el.style.setProperty('--sim-toast-color', K.color ? K.color(opts.color || 'blue') : (opts.color || '#4f8ff7'));
    el.textContent = K.uni(text);
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    // На паузе сообщение не уходит: кадр паузы стоит, а студент успевает дочитать.
    function later(fn, ms) { setTimeout(function () { if (K.__isPaused && K.__isPaused()) later(fn, 300); else fn(); }, ms); }
    later(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }, opts.ms || 2600);
    return el;
  }

  // ---------- Кнопки действий прямо над сценой (снизу по центру) ----------
  var actionBar = null;
  function ensureActions() {
    if (!actionBar) { actionBar = document.createElement('div'); actionBar.className = 'sim-actions'; document.body.appendChild(actionBar); }
    return actionBar;
  }
  function action(o) {
    o = K.__norm(o, 'button');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sim-action' + (o.primary ? ' sim-primary' : '');
    b.textContent = o.label;
    if (o.color) b.style.setProperty('--sim-action-color', K.color ? K.color(o.color) : o.color);
    b.onclick = function () {
      b.classList.remove('sim-press'); void b.offsetWidth; b.classList.add('sim-press');
      K.__safe(o.onClick, [], 'кнопке «' + o.label + '»');
    };
    ensureActions().appendChild(b);
    K.__register({ kind: 'button', name: o.name, label: o.label, activate: function () { b.onclick(); } });
    return b;
  }
  function actions(list) {
    if (!Array.isArray(list)) list = list && list.items ? list.items : [list];
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(action(list[i]));
    return out;
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
    o = K.__norm(o);
    var p = K.__panel();
    K.__group(o.group);
    var row = controlRow(o.label);
    var opts = o.options || o.items || o.values || [];
    var vals = [];
    // До четырёх коротких вариантов — сегментированный переключатель: виден выбор, один клик.
    var short = opts.length <= 4 && opts.every(function (r) { return String(r && r.label !== undefined ? r.label : r).length <= 14; });
    var sel, seg = [];
    function current() { return short ? curVal : sel.value; }
    var curVal = null;
    for (var i = 0; i < opts.length; i++) {
      var raw = opts[i];
      vals.push({ v: String(raw && raw.value !== undefined ? raw.value : raw), l: String(raw && raw.label !== undefined ? raw.label : raw) });
    }
    function changed() { K.__safe(o.onChange, [current()], 'выборе «' + o.label + '»'); K.__emit(o.name, current()); }
    if (short) {
      var box = document.createElement('div'); box.className = 'sim-seg';
      vals.forEach(function (it) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = it.l;
        b.onclick = function () { pickSeg(it.v); changed(); };
        seg.push({ b: b, v: it.v });
        box.appendChild(b);
      });
      row.wrap.appendChild(box);
    } else {
      sel = document.createElement('select');
      sel.className = 'sim-select';
      vals.forEach(function (it) { var op = document.createElement('option'); op.value = it.v; op.textContent = it.l; sel.appendChild(op); });
      sel.addEventListener('change', changed);
      row.wrap.appendChild(sel);
    }
    function pickSeg(v) { curVal = String(v); seg.forEach(function (s) { s.b.classList.toggle('on', s.v === curVal); }); }
    var init = o.value !== undefined ? String(o.value) : (vals[0] ? vals[0].v : '');
    if (short) pickSeg(init); else sel.value = init;
    p.appendChild(row.wrap);
    K.__register({
      kind: 'select', name: o.name, label: o.label, el: row.wrap, options: vals.map(function (x) { return x.v; }),
      get: function () { return current(); },
      set: function (v) { if (short) pickSeg(v); else sel.value = String(v); changed(); },
    });
    return sel || row.wrap;
  }

  function toggle(o) {
    o = K.__norm(o);
    var p = K.__panel();
    K.__group(o.group);
    var row = controlRow(o.label);
    row.wrap.className = 'sim-control sim-control-toggle';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sim-switch';
    btn.setAttribute('role', 'switch');
    var on = !!o.value;
    function sync() {
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.setAttribute('aria-label', o.label + ': ' + (on ? __simT('on') : __simT('off')));
    }
    btn.onclick = function () { on = !on; sync(); K.__safe(o.onChange, [on], 'переключателе «' + o.label + '»'); K.__emit(o.name, on); };
    sync();
    row.wrap.appendChild(btn);
    p.appendChild(row.wrap);
    K.__register({
      kind: 'toggle', name: o.name, label: o.label, el: row.wrap,
      get: function () { return on; },
      set: function (v) { on = !!v; sync(); K.__safe(o.onChange, [on], 'переключателе «' + o.label + '»'); K.__emit(o.name, on); },
      activate: function () { btn.onclick(); },
    });
    return btn;
  }

  function button(o) {
    if (typeof o === 'string') o = { label: arguments[0], onClick: arguments[1] };
    if (o && (o.place === 'scene' || o.scene)) return action(o);
    o = K.__norm(o, 'button');
    var p = K.__panel();
    var box = document.createElement('div');
    box.className = 'sim-btns';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    b.onclick = function () { K.__safe(o.onClick, [], 'кнопке «' + o.label + '»'); };
    box.appendChild(b);
    p.appendChild(box);
    K.__register({ kind: 'button', name: o.name, label: o.label, activate: function () { b.onclick(); } });
    return b;
  }

  function presets(o) {
    if (Array.isArray(o)) o = { items: o };
    o = o || {};
    var p = K.__panel();
    var box = document.createElement('div');
    box.className = 'sim-presets';
    var items = o.items || [];
    var btns = [];
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.label || item.name;
        b.onclick = function () {
          var vals = item.values || item.params || {};
          for (var k in vals) {
            if (Object.prototype.hasOwnProperty.call(vals, k)) K.__set(k, vals[k]);
          }
          for (var j = 0; j < btns.length; j++) btns[j].classList.toggle('on', btns[j] === b);
          K.__safe(item.onApply, [], 'пресете «' + item.label + '»');
          if (o.reset && K.__resetSim) K.__resetSim();
        };
        btns.push(b);
        box.appendChild(b);
      })(items[i]);
    }
    p.appendChild(box);
    return box;
  }

  function speed(o) {
    if (Array.isArray(o)) o = { values: o };
    o = o || {};
    if (speedApi) return speedApi;
    var values = o.values || [0.25, 0.5, 1, 2];
    var cur = o.value == null ? 1 : o.value;
    var p = K.__panel();
    var wrap = document.createElement('div');
    wrap.className = 'sim-control';
    var lab = document.createElement('label');
    lab.textContent = __simT('speed');
    var box = document.createElement('div');
    box.className = 'sim-seg';
    var btns = [];
    function sync() { for (var j = 0; j < btns.length; j++) btns[j].b.classList.toggle('on', btns[j].v === cur); }
    for (var i = 0; i < values.length; i++) {
      (function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = v + '×';
        b.onclick = function () { cur = v; sync(); K.__safe(o.onChange, [v], 'скорости'); };
        btns.push({ b: b, v: v });
        box.appendChild(b);
      })(values[i]);
    }
    sync();
    wrap.appendChild(lab);
    wrap.appendChild(box);
    p.appendChild(wrap);
    // Разгон: симуляция открывается неподвижной и за WARMUP_MS выходит на
    // выбранный множитель по косинусу. Инструмент нужен для показа на занятии,
    // а рывок с первого кадра читается как сбой, а не как начало демонстрации.
    var WARMUP_MS = 900;
    var startedAt = null;
    function warm() {
      var t = now();
      if (startedAt == null) startedAt = t;
      var k = (t - startedAt) / WARMUP_MS;
      if (k >= 1) return 1;
      if (k <= 0) return 0;
      return 0.5 - 0.5 * Math.cos(Math.PI * k);
    }
    K.__register({
      kind: 'speed', name: o.name || 'speed', label: __simT('speed'),
      get: function () { return cur; },
      set: function (v) { cur = Number(v); sync(); K.__safe(o.onChange, [cur], 'скорости'); },
      restart: function () { startedAt = null; },
    });
    speedApi = {
      get: function () { return cur * warm(); },
      restart: function () { startedAt = null; },
      valueOf: function () { return cur * warm(); },
    };
    try { Object.defineProperty(speedApi, 'value', { get: function () { return cur * warm(); } }); } catch (e) {}
    return speedApi;
  }
  var speedApi = null;

  function goals(list) {
    if (typeof list === 'string') list = [list];
    if (list && !Array.isArray(list)) list = list.items || [];
    var body = K.panel({ title: __simT('goals'), corner: 'tl', collapsed: true });
    var ul = document.createElement('ul');
    ul.className = 'sim-goals';
    for (var i = 0; i < (list || []).length; i++) {
      var li = document.createElement('li');
      li.textContent = list[i];
      ul.appendChild(li);
    }
    body.appendChild(ul);
    return ul;
  }

  /**
   * Слайдеры для всех параметров сразу и привязка к объекту P: SimUI.params(P, [{name, label,
   * min, max, step, value, unit, group}]) — ползунок пишет P[name] сам, onChange не нужен.
   */
  function params(P, list) {
    if (Array.isArray(P) && !list) { list = P; P = {}; }
    P = P || {};
    list = (list || []).slice();
    // Параметры одной группы — подряд: иначе заголовок «Источник» повторялся бы дважды.
    var order = {}, n = 0;
    for (var g = 0; g < list.length; g++) { var gk = list[g].group || ''; if (order[gk] === undefined) order[gk] = n++; }
    list = list.map(function (d, i) { return { d: d, i: i }; })
      .sort(function (a, b) { return order[a.d.group || ''] - order[b.d.group || ''] || a.i - b.i; })
      .map(function (x) { return x.d; });
    for (var i = 0; i < list.length; i++) {
      (function (d) {
        var o = {};
        for (var k in d) o[k] = d[k];
        var name = o.name || o.id || o.key;
        if (P[name] !== undefined && o.value === undefined) o.value = P[name];
        var user = o.onChange;
        o.onChange = function (v) { P[name] = v; if (typeof user === 'function') user(v); };
        var inp = K.slider(o);
        P[name] = parseFloat(inp.value);
      })(list[i]);
    }
    K.__params = P;
    return P;
  }

  K.readout = readout;
  K.readouts = readouts;
  K.legend = legend;
  K.banner = banner;
  K.formula = formula;
  K.note = note;
  K.meter = meter;
  K.toast = toast;
  K.action = action;
  K.actions = actions;
  K.select = select;
  K.toggle = toggle;
  K.button = button;
  K.presets = presets;
  K.speed = speed;
  K.goals = goals;
  K.params = params;
  K.__bind = bind;
})();
`;

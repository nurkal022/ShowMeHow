/**
 * Ядро UI-kit'а: панель управления, углы, сворачивание, базовые контролы, мобильный док.
 *
 * Кит пишется под слабые модели: опции принимаются под любыми привычными именами
 * (id/name, default/value, onInput/onChange…), а позиционные вызовы
 * SimUI.slider('Масса', 1, 10, 5, fn) тоже работают. Ошибка в чужом колбэке не роняет
 * панель — она уходит в консоль, где её видит проверка, а студент видит живой тренажёр.
 */
export const KIT_CORE_JS = `
// Под автоматизацией (Playwright) — без входных анимаций и переходов: пробы сравнивают кадры,
// и проявляющаяся панель читалась бы как «анимация идёт» у статичной картинки.
try { if (navigator.webdriver) document.documentElement.classList.add('sim-still'); } catch (e) {}
// Встраивание в витрину (?embed=1): сцена — главная, приборы и панель свёрнуты в таблички,
// зритель разворачивает то, что ему интересно. Иначе в небольшом кадре панели закрывают сцену.
var __smhEmbed = false;
try { __smhEmbed = /(^|[?&])embed(=|&|$)/.test(location.search); if (__smhEmbed) document.documentElement.classList.add('sim-embed'); } catch (e) {}

window.SimUI = (function () {
  var ctrlPanel = null;
  var toggle = null;
  var open = false;
  var cornerEls = {};
  var controls = [];
  var changeListeners = [];
  var panels = [];
  var mobileMq = window.matchMedia ? window.matchMedia('(max-width:640px)') : null;
  function isMobile() { return !!(mobileMq && mobileMq.matches); }

  /**
   * LaTeX в обычной подписи (\\theta, v_0, m^2) — в Юникод: модели пишут формулы и туда, где их
   * никто не рендерит, и студент видел «\\theta = 4.8°».
   */
  var GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
    theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
    sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    cdot: '·', times: '×', pm: '±', approx: '≈', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', infty: '∞',
    to: '→', rightarrow: '→', circ: '°', degree: '°', partial: '∂', nabla: '∇', sqrt: '√', propto: '∝', ell: 'ℓ', hbar: 'ħ' };
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', 'n': 'ⁿ' };
  var SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '-': '₋', '+': '₊',
    'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'i': 'ᵢ', 'r': 'ᵣ', 'u': 'ᵤ', 'v': 'ᵥ', 'k': 'ₖ', 'm': 'ₘ', 'n': 'ₙ', 'p': 'ₚ', 's': 'ₛ', 't': 'ₜ' };
  function uni(str) {
    if (str == null) return '';
    str = String(str);
    if (!/[\\\\^_$]/.test(str)) return str;
    function map(chars, table) {
      var out = '';
      for (var i = 0; i < chars.length; i++) { if (!table[chars[i]]) return null; out += table[chars[i]]; }
      return out;
    }
    return str
      .replace(/\\$/g, '')
      .replace(/\\\\(begin|end)\\s*\\{[^{}]*\\}/g, '')
      .replace(/\\\\[\\[\\]()]/g, '')
      .replace(/\\\\\\\\/g, '; ')
      .replace(/\\\\(text|mathrm|mathbf|mathit|operatorname)\\s*\\{([^{}]*)\\}/g, '$2')
      .replace(/\\\\frac\\s*\\{([^{}]*)\\}\\s*\\{([^{}]*)\\}/g, '$1/$2')
      .replace(/\\\\([A-Za-z]+)/g, function (m, w) { return GREEK[w] != null ? GREEK[w] : (w === 'left' || w === 'right' ? '' : m); })
      .replace(/\\^\\{([^{}]*)\\}|\\^(.)/g, function (m, a, b) { var r = map(a != null ? a : b, SUP); return r == null ? m : r; })
      .replace(/_\\{([^{}]*)\\}|_(.)/g, function (m, a, b) { var r = map(a != null ? a : b, SUB); return r == null ? (a != null ? a : b) : r; })
      .replace(/\\\\,|\\;|\\\\!/g, ' ')
      .replace(/[{}]/g, '');
  }

  /** Колбэк модели: ошибка внутри — в консоль один раз, без падения кита. */
  var reported = {};
  function safeCall(fn, args, where) {
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(null, args || []); }
    catch (e) {
      var key = where + ':' + (e && e.message);
      if (!reported[key]) {
        reported[key] = 1;
        // Первая строка стека — где именно (функция и строка документа): фиксеру нужно место, а не только текст.
        var at = '';
        try { at = String(e && e.stack || '').split('\\n')[1] || ''; at = at.replace(/^\\s*at\\s*/, '').slice(0, 120); } catch (e3) {}
        try { console.error('Ошибка в ' + where + ': ' + (e && e.message ? e.message : e) + (at ? ' — ' + at : '')); } catch (e2) {}
      }
      return undefined;
    }
  }
  function pick(o, names) {
    for (var i = 0; i < names.length; i++) if (o[names[i]] !== undefined) return o[names[i]];
    return undefined;
  }
  /** Приводит опции контрола к одному виду: имя, подпись, колбэк — под любыми синонимами. */
  function norm(o, kind) {
    o = o || {};
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    var label = pick(o, ['label', 'title', 'text', 'caption', 'name', 'id', 'key']);
    var name = pick(o, ['name', 'id', 'key', 'param', 'bind']);
    out.label = label == null ? '' : uni(label);
    if (o.unit !== undefined) out.unit = uni(o.unit);
    out.name = name == null ? out.label : String(name);
    var v = pick(o, ['value', 'default', 'defaultValue', 'initial', 'init', 'val', 'start', 'checked', 'on']);
    if (typeof v !== 'function') out.value = v;
    var cb = pick(o, ['onChange', 'onchange', 'onInput', 'oninput', 'onUpdate', 'callback', 'cb', 'change', 'onToggle', 'onSelect']);
    out.onChange = typeof cb === 'function' ? cb : null;
    var click = pick(o, ['onClick', 'onclick', 'action', 'onPress', 'handler', 'fn', 'run', 'callback']);
    out.onClick = typeof click === 'function' ? click : null;
    if (o.units !== undefined && o.unit === undefined) out.unit = uni(o.units);
    if (kind === 'slider') {
      var min = Number(pick(o, ['min', 'from', 'lo', 'minimum'])), max = Number(pick(o, ['max', 'to', 'hi', 'maximum']));
      if (!isFinite(min)) min = 0;
      if (!isFinite(max)) max = min + (isFinite(Number(out.value)) && Number(out.value) > min ? Number(out.value) * 2 - min : 1);
      if (min > max) { var t = min; min = max; max = t; }
      if (min === max) max = min + 1;
      var step = Number(o.step);
      if (!isFinite(step) || step <= 0) step = Number(((max - min) / 100).toPrecision(1)) || (max - min) / 100;
      var val = Number(out.value);
      if (!isFinite(val)) val = min + (max - min) / 2;
      out.min = min; out.max = max; out.step = step; out.value = Math.min(max, Math.max(min, val));
    }
    return out;
  }
  function register(c) { controls.push(c); return c; }
  function onChange(fn) { changeListeners.push(fn); }
  function emitChange(name, value) {
    for (var i = 0; i < changeListeners.length; i++) safeCall(changeListeners[i], [name, value], 'обработчике контрола');
  }
  function setByName(name, value) {
    for (var i = 0; i < controls.length; i++) {
      if (controls[i].name === name && controls[i].set) { controls[i].set(value); return true; }
    }
    return false;
  }
  function getByName(name) {
    for (var i = 0; i < controls.length; i++) {
      if (controls[i].name === name && controls[i].get) return controls[i].get();
    }
    return undefined;
  }
  function ensureCorner(corner) {
    if (!/^(tl|tr|bl|br)$/.test(corner)) corner = 'bl';
    if (!cornerEls[corner]) {
      var c = document.createElement('div');
      c.className = 'sim-corner sim-corner-' + corner;
      document.body.appendChild(c);
      cornerEls[corner] = c;
    }
    return cornerEls[corner];
  }

  // ---------- Мобильный док: вкладки панелей внизу, каждая открывается листом ----------
  var dock = null, dockOpen = null;
  function closeSheets() {
    for (var i = 0; i < panels.length; i++) panels[i].el.classList.remove('sim-sheet-open');
    if (ctrlPanel) setOpen(false);
    dockOpen = null;
    syncDock();
  }
  function openSheet(p) {
    var same = dockOpen === p;
    closeSheets();
    if (same) return;
    dockOpen = p;
    p.el.classList.remove('smh-collapsed');
    p.el.classList.add('sim-sheet-open');
    syncDock();
  }
  function syncDock() {
    // Открыт лист — кнопки действий над сценой прячем: они ложились бы поверх листа.
    try { document.body.classList.toggle('sim-sheet-mode', !!(dockOpen || open)); } catch (e) {}
    if (!dock) return;
    var chips = dock.children;
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].__panel ? chips[i].__panel === dockOpen : open;
      chips[i].classList.toggle('on', !!on);
    }
  }
  function ensureDock() {
    if (dock) return dock;
    dock = document.createElement('div');
    dock.className = 'sim-dock';
    document.body.appendChild(dock);
    return dock;
  }
  function addDockChip(label, p, onClick) {
    var d = ensureDock();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sim-dock-chip';
    b.textContent = label;
    b.__panel = p || null;
    b.onclick = onClick;
    d.appendChild(b);
    return b;
  }

  /**
   * Правый нижний угол не должен лезть под панель параметров: если под ней мало места,
   * приборы встают слева от панели. На телефоне углы живут в доке — сбрасываем всё.
   */
  var layoutTimer = null;
  function layout() {
    var br = cornerEls.br;
    if (!br) return;
    if (isMobile() || !ctrlPanel || ctrlPanel.classList.contains('smh-collapsed')) {
      br.style.maxHeight = ''; if (ctrlPanel) ctrlPanel.style.maxHeight = '';
      return;
    }
    var H = window.innerHeight;
    ctrlPanel.style.maxHeight = '';
    var need = Math.min(br.scrollHeight || 0, H * 0.45);
    var p = ctrlPanel.getBoundingClientRect();
    if (H - p.bottom - 22 < need) {
      // Панель параметров уступает место приборам и прокручивается сама: центр экрана — сцене.
      var cap = Math.max(H * 0.5, H - need - 34);
      ctrlPanel.style.maxHeight = Math.round(cap) + 'px';
      ctrlPanel.classList.add('sim-scroll');
      p = ctrlPanel.getBoundingClientRect();
    }
    br.style.maxHeight = Math.max(120, Math.round(H - p.bottom - 22)) + 'px';
  }
  function scheduleLayout() { if (!layoutTimer) layoutTimer = setTimeout(function () { layoutTimer = null; layout(); }, 30); }
  window.addEventListener('resize', scheduleLayout);

  function setOpen(v) {
    open = v;
    if (ctrlPanel) ctrlPanel.classList.toggle('sim-panel-open', open);
    if (toggle) toggle.classList.toggle('on', open);
  }
  function ensurePanel(title) {
    if (!ctrlPanel) {
      ctrlPanel = document.createElement('div');
      ctrlPanel.className = 'sim-panel';
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'sim-panel-close';
      close.setAttribute('aria-label', __simT('closeParams'));
      close.textContent = '✕';
      close.onclick = function () { setOpen(false); syncDock(); };
      ctrlPanel.appendChild(close);
      if (title) { var h = document.createElement('h1'); h.textContent = title; ctrlPanel.appendChild(h); }
      document.body.appendChild(ctrlPanel);
      // Прокрутка панели — только когда она выше окна: скролл-контейнер — лишний слой на каждом кадре.
      var fitTimer = null;
      var fitScroll = function () {
        fitTimer = null;
        ctrlPanel.classList.remove('sim-scroll');
        if (ctrlPanel.scrollHeight > window.innerHeight - 24) ctrlPanel.classList.add('sim-scroll');
        layout();
      };
      ctrlPanel.__fit = function () { if (!fitTimer) fitTimer = setTimeout(fitScroll, 50); };
      window.addEventListener('resize', ctrlPanel.__fit);
      if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(ctrlPanel, { noMobileCollapse: true, collapsed: __smhEmbed });
      // Первая вкладка дока — параметры. Класс sim-panel-toggle оставлен для проб и старых тестов.
      toggle = addDockChip(__simT('params'), null, function () {
        var was = open;
        closeSheets();
        setOpen(!was);
        syncDock();
      });
      toggle.classList.add('sim-panel-toggle');
      if (dock.firstChild !== toggle) dock.insertBefore(toggle, dock.firstChild);
    }
    ctrlPanel.__fit();
    return ctrlPanel;
  }

  /** Заголовок группы параметров: «Газ», «Поршень» — по полю group из плана. */
  var lastGroup = null;
  function groupHeader(group) {
    if (!group || group === lastGroup) return;
    lastGroup = group;
    var g = document.createElement('div');
    g.className = 'sim-group';
    g.textContent = group;
    ensurePanel().appendChild(g);
  }

  function fmtVal(v, step) {
    var n = Number(v);
    if (!isFinite(n)) return String(v);
    var d = 0, s = Number(step);
    if (isFinite(s) && s > 0 && s < 1) d = Math.min(6, Math.ceil(-Math.log(s) / Math.LN10 - 1e-9));
    return n.toFixed(d);
  }

  function slider(o) {
    if (typeof o === 'string') { // SimUI.slider('Масса', min, max, value, onChange)
      var a = arguments;
      o = { label: a[0], min: a[1], max: a[2], value: a[3], onChange: a[4], step: a[5] };
    }
    o = norm(o, 'slider');
    ensurePanel();
    groupHeader(o.group);
    var wrap = document.createElement('div'); wrap.className = 'sim-control';
    var lab = document.createElement('label');
    var txt = document.createElement('span'); txt.className = 'sim-label'; txt.textContent = o.label;
    var val = document.createElement('span'); val.className = 'sim-value';
    function fmt(v) { return fmtVal(v, o.step) + (o.unit ? ' ' + o.unit : ''); }
    lab.appendChild(txt); lab.appendChild(val);
    var inp = document.createElement('input');
    inp.type = 'range'; inp.min = o.min; inp.max = o.max; inp.step = o.step; inp.value = o.value;
    inp.setAttribute('aria-label', o.label);
    function paint() {
      var k = (parseFloat(inp.value) - o.min) / (o.max - o.min);
      inp.style.setProperty('--k', (Math.max(0, Math.min(1, k)) * 100).toFixed(1) + '%');
      val.textContent = fmt(inp.value);
    }
    paint();
    function changed() {
      var v = parseFloat(inp.value);
      paint();
      safeCall(o.onChange, [v], 'onChange слайдера «' + o.label + '»');
      emitChange(o.name, v);
    }
    inp.addEventListener('input', changed);
    wrap.appendChild(lab); wrap.appendChild(inp); ctrlPanel.appendChild(wrap);
    register({
      kind: 'slider', name: o.name, label: o.label, el: wrap,
      min: Number(o.min), max: Number(o.max), step: Number(o.step),
      get: function () { return parseFloat(inp.value); },
      set: function (v) { inp.value = v; changed(); },
    });
    return inp;
  }

  function playPause(o) {
    if (typeof o === 'function') o = { onToggle: o };
    o = o || {};
    if (ppBox) return ppApi;
    ensurePanel();
    var box = document.createElement('div'); box.className = 'sim-btns sim-btns-main';
    var playing = true;
    var b1 = document.createElement('button'); b1.type = 'button'; b1.textContent = __simT('pause');
    var b2 = document.createElement('button'); b2.type = 'button'; b2.textContent = __simT('reset');
    b1.setAttribute('data-smh-btn', 'playpause');
    b2.setAttribute('data-smh-btn', 'reset');
    function sync() { b1.textContent = playing ? __simT('pause') : __simT('play'); b1.classList.toggle('sim-primary', !playing); }
    b1.onclick = function () {
      playing = !playing;
      sync();
      safeCall(playing ? o.onPlay : o.onPause, [], 'кнопке паузы');
      safeCall(o.onToggle, [playing], 'кнопке паузы');
    };
    b2.onclick = function () {
      for (var i = 0; i < controls.length; i++) {
        if (controls[i].restart) controls[i].restart();
      }
      safeCall(o.onReset, [], 'кнопке сброса');
    };
    window.addEventListener('sim-pause', function () { if (playing) b1.onclick(); });
    window.addEventListener('sim-play', function () { if (!playing) b1.onclick(); });
    window.addEventListener('sim-reset', function () { safeCall(o.onReset, [], 'сбросе'); });
    // Пробел — пауза, R — сброс: так ведут показ на проекторе, не целясь мышью в панель.
    window.addEventListener('keydown', function (e) {
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); b1.onclick(); }
      else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') b2.onclick();
    });
    box.appendChild(b1); box.appendChild(b2);
    ppBox = box;
    var p = ensurePanel();
    // Пуск и сброс — сразу под заголовком: главная кнопка не уезжает под десяток слайдеров.
    var h = p.querySelector('h1');
    if (h && h.nextSibling) p.insertBefore(box, h.nextSibling); else p.appendChild(box);
    ppApi = {
      playing: function () { return playing; },
      pause: function () { if (playing) b1.onclick(); },
      play: function () { if (!playing) b1.onclick(); },
      element: box,
    };
    return ppApi;
  }
  var ppBox = null, ppApi = null;

  function title(t) {
    var p = ensurePanel(t);
    var h = p.querySelector('h1');
    if (h) {
      h.textContent = t;
    } else {
      h = document.createElement('h1');
      h.textContent = t;
      var close = p.querySelector('.sim-panel-close');
      p.insertBefore(h, close ? close.nextSibling : p.firstChild);
    }
    try { if (!document.title) document.title = t; } catch (e) {}
  }

  function panel(o) {
    if (typeof o === 'string') o = { title: o };
    o = o || {};
    var container = ensureCorner(o.corner || 'bl');
    var el = document.createElement('div');
    el.className = 'sim-side-panel';
    var titleText = o.title || '';
    if (titleText) {
      var h = document.createElement('h2'); h.className = 'sim-side-title';
      h.textContent = uni(titleText); el.appendChild(h);
    }
    var body = document.createElement('div'); body.className = 'sim-side-body';
    el.appendChild(body);
    container.appendChild(el);
    if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(el, { collapsed: !!o.collapsed || __smhEmbed });
    var rec = { el: el, title: titleText };
    scheduleLayout();
    panels.push(rec);
    addDockChip(titleText || __simT('panel'), rec, function () { openSheet(rec); });
    return body;
  }

  return {
    slider: slider, playPause: playPause, title: title, panel: panel,
    // Служебное API для виджетов и моста интроспекции (kit-expose).
    __panel: ensurePanel, __register: register, __controls: function () { return controls; },
    __set: setByName, __get: getByName, __norm: norm, __safe: safeCall, __onChange: onChange,
    __emit: emitChange, __corner: ensureCorner, __isMobile: isMobile, __closeSheets: closeSheets,
    __group: groupHeader, __fmt: fmtVal, __layout: scheduleLayout, uni: uni,
  };
})();

(function () {
  function makeCollapsible(panel, opts) {
    if (panel.getAttribute('data-smh-panel')) return;
    panel.setAttribute('data-smh-panel', '1');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'smh-collapse-btn';
    btn.setAttribute('aria-label', __simT('collapse'));
    function sync() {
      var c = panel.classList.contains('smh-collapsed');
      btn.textContent = c ? '▸' : '▾';
      btn.setAttribute('aria-expanded', c ? 'false' : 'true');
    }
    function flip() {
      panel.classList.toggle('smh-collapsed'); sync();
      if (window.SimUI && window.SimUI.__layout) window.SimUI.__layout();
    }
    btn.onclick = function (e) { if (e) e.stopPropagation(); flip(); };
    panel.insertBefore(btn, panel.firstChild);
    // Свёрнутая панель с заголовком — таблетка с названием; клик по заголовку разворачивает.
    var head = panel.querySelector('.sim-side-title, h1');
    if (head) {
      panel.classList.add('smh-has-title');
      head.addEventListener('click', function () { if (panel.classList.contains('smh-collapsed')) flip(); });
    }
    var mobile = window.matchMedia && window.matchMedia('(max-width:640px)').matches;
    if (opts && opts.collapsed) panel.classList.add('smh-collapsed');
    else if (mobile && !(opts && opts.noMobileCollapse) && !panel.classList.contains('sim-side-panel')) panel.classList.add('smh-collapsed');
    sync();
  }
  window.__smhMakeCollapsible = makeCollapsible;

  // Свои position:fixed блоки модели (старые тренажёры) тоже получают кнопку сворачивания.
  function isPanel(el) {
    if (!el.getAttribute || el.getAttribute('data-smh-panel')) return false;
    if (el.tagName === 'CANVAS' || el.tagName === 'BUTTON' || el.tagName === 'SCRIPT') return false;
    if (el.closest && el.closest('[data-smh-kit]')) return false;
    var cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed') return false;
    var hasContent = (el.textContent || '').replace(/\\s+/g, '') !== '' ||
      el.querySelector('canvas,svg,img');
    if (!hasContent) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) return false;
    var area = (r.width * r.height) / (window.innerWidth * window.innerHeight || 1);
    if (area > 0.6) return false;
    return true;
  }
  var KIT_CLASS = /(^|\\s)(sim-|smh-)/;
  // Скан только прямых детей body: свои панели модели почти всегда там. Раньше скан шёл
  // по всем элементам с getComputedStyle на КАЖДУЮ мутацию — а показания меняют текст
  // каждый кадр, и тренажёр тратил на это половину кадра.
  function scan() {
    if (!document.body) return;
    var all = document.body.children;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (KIT_CLASS.test(el.className || '')) continue;
      if (isPanel(el)) makeCollapsible(el);
      else if (el.tagName === 'DIV' && !el.getAttribute('data-smh-panel')) {
        var kids = el.children;
        for (var j = 0; j < kids.length && j < 20; j++) if (isPanel(kids[j])) makeCollapsible(kids[j]);
      }
    }
  }
  var scanTimer = null, scans = 0;
  function scheduleScan() {
    if (scanTimer || scans > 40) return;
    scanTimer = setTimeout(function () { scanTimer = null; scans++; scan(); }, 250);
  }
  function start() {
    scan();
    if (window.MutationObserver) {
      // Только состав детей body, без поддерева: текст показаний и графики сюда не попадают.
      var mo = new MutationObserver(function () { scheduleScan(); });
      mo.observe(document.body, { childList: true });
      setTimeout(function () { mo.disconnect(); }, 15000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  // Модель забыла SimUI.title — заголовок панели берём из <title> страницы.
  window.addEventListener('load', function () {
    var p = document.querySelector('.sim-panel');
    if (p && !p.querySelector('h1') && document.title && window.SimUI) window.SimUI.title(document.title);
  });
})();
`;

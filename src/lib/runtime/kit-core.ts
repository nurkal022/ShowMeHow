/** Ядро UI-kit'а: панель управления, углы, сворачивание, базовые контролы. */
export const KIT_CORE_JS = `
window.SimUI = (function () {
  var ctrlPanel = null;
  var toggle = null;
  var open = false;
  var cornerEls = {};
  var controls = [];
  function register(c) { controls.push(c); return c; }
  function setByName(name, value) {
    for (var i = 0; i < controls.length; i++) {
      if (controls[i].name === name && controls[i].set) { controls[i].set(value); return true; }
    }
    return false;
  }
  function ensureCorner(corner) {
    if (!cornerEls[corner]) {
      var c = document.createElement('div');
      c.className = 'sim-corner sim-corner-' + corner;
      document.body.appendChild(c);
      cornerEls[corner] = c;
    }
    return cornerEls[corner];
  }
  function setOpen(v) {
    open = v;
    if (ctrlPanel) {
      if (open) ctrlPanel.className = 'sim-panel sim-panel-open';
      else ctrlPanel.className = 'sim-panel';
    }
    if (toggle) {
      // Прячем таблетку, пока лист открыт, чтобы не перекрывала контролы.
      toggle.className = open ? 'sim-panel-toggle sim-panel-hidden' : 'sim-panel-toggle';
    }
  }
  function ensurePanel(title) {
    if (!ctrlPanel) {
      ctrlPanel = document.createElement('div');
      ctrlPanel.className = 'sim-panel';
      // Кнопка закрытия листа (видна только на мобиле через CSS).
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'sim-panel-close';
      close.setAttribute('aria-label', 'Закрыть параметры');
      close.textContent = '✕';
      close.onclick = function () { setOpen(false); };
      ctrlPanel.appendChild(close);
      if (title) { var h = document.createElement('h1'); h.textContent = title; ctrlPanel.appendChild(h); }
      document.body.appendChild(ctrlPanel);
      if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(ctrlPanel, { noMobileCollapse: true });
      // Таблетка-переключатель снизу по центру (видна только на мобиле через CSS).
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'sim-panel-toggle';
      toggle.textContent = '⚙ Параметры';
      toggle.onclick = function () { setOpen(!open); };
      document.body.appendChild(toggle);
    }
    return ctrlPanel;
  }
  function slider(o) { // {label,min,max,step,value,unit,onChange}
    ensurePanel();
    var wrap = document.createElement('div'); wrap.className = 'sim-control';
    var lab = document.createElement('label');
    var val = document.createElement('span'); val.className = 'sim-value';
    function fmt(v) { return v + (o.unit ? ' ' + o.unit : ''); }
    lab.textContent = o.label; lab.appendChild(val);
    var inp = document.createElement('input');
    inp.type = 'range'; inp.min = o.min; inp.max = o.max; inp.step = o.step; inp.value = o.value;
    val.textContent = fmt(o.value);
    inp.addEventListener('input', function () {
      val.textContent = fmt(inp.value); o.onChange(parseFloat(inp.value));
    });
    wrap.appendChild(lab); wrap.appendChild(inp); ctrlPanel.appendChild(wrap);
    register({
      kind: 'slider', name: o.name || o.label, label: o.label,
      min: Number(o.min), max: Number(o.max), step: Number(o.step),
      get: function () { return parseFloat(inp.value); },
      set: function (v) {
        inp.value = v;
        val.textContent = fmt(inp.value);
        o.onChange(parseFloat(inp.value));
      },
    });
    return inp;
  }
  function playPause(o) { // {onPlay,onPause,onReset}
    ensurePanel();
    var box = document.createElement('div'); box.className = 'sim-btns';
    var playing = true;
    var b1 = document.createElement('button'); b1.textContent = '⏸ Пауза';
    var b2 = document.createElement('button'); b2.textContent = '↺ Сброс';
    b1.setAttribute('data-smh-btn', 'playpause');
    b2.setAttribute('data-smh-btn', 'reset');
    b1.onclick = function () {
      playing = !playing;
      b1.textContent = playing ? '⏸ Пауза' : '▶ Пуск';
      (playing ? o.onPlay : o.onPause)();
    };
    b2.onclick = function () { o.onReset(); };
    window.addEventListener('sim-pause', function () { if (playing) b1.onclick(); });
    window.addEventListener('sim-play', function () { if (!playing) b1.onclick(); });
    window.addEventListener('sim-reset', function () { o.onReset(); });
    box.appendChild(b1); box.appendChild(b2); ensurePanel().appendChild(box);
  }
  function title(t) {
    var p = ensurePanel(t);
    var h = p.querySelector('h1');
    if (h) {
      h.textContent = t;
    } else {
      h = document.createElement('h1');
      h.textContent = t;
      p.insertBefore(h, p.firstChild);
    }
  }
  function panel(o) { // {title, corner}
    o = o || {};
    var container = ensureCorner(o.corner || 'bl');
    var el = document.createElement('div');
    el.className = 'sim-side-panel';
    if (o.title) {
      var h = document.createElement('h2'); h.className = 'sim-side-title';
      h.textContent = o.title; el.appendChild(h);
    }
    var body = document.createElement('div'); body.className = 'sim-side-body';
    el.appendChild(body);
    container.appendChild(el);
    if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(el, { collapsed: !!o.collapsed });
    return body;
  }
  return {
    slider: slider, playPause: playPause, title: title, panel: panel,
    // Служебное API для виджетов (kit-widgets) и моста интроспекции (kit-expose).
    __panel: ensurePanel, __register: register, __controls: function () { return controls; },
    __set: setByName,
  };
})();

(function () {
  function makeCollapsible(panel, opts) {
    if (panel.getAttribute('data-smh-panel')) return;
    panel.setAttribute('data-smh-panel', '1');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'smh-collapse-btn';
    btn.setAttribute('aria-label', 'Свернуть или развернуть панель');
    function sync() { btn.textContent = panel.classList.contains('smh-collapsed') ? '▸' : '▾'; }
    btn.onclick = function () { panel.classList.toggle('smh-collapsed'); sync(); };
    panel.insertBefore(btn, panel.firstChild);
    var mobile = window.matchMedia && window.matchMedia('(max-width:640px)').matches;
    if (opts && opts.collapsed) panel.classList.add('smh-collapsed');
    else if (mobile && !(opts && opts.noMobileCollapse)) panel.classList.add('smh-collapsed');
    sync();
  }
  window.__smhMakeCollapsible = makeCollapsible;

  function isPanel(el) {
    if (!el.getAttribute || el.getAttribute('data-smh-panel')) return false;
    if (el.tagName === 'CANVAS' || el.tagName === 'BUTTON' || el.tagName === 'SCRIPT') return false;
    if (el.classList && (el.classList.contains('sim-panel') ||
        el.classList.contains('sim-panel-toggle') ||
        el.classList.contains('sim-corner'))) return false;
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
  function scan() {
    if (!document.body) return;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) { if (isPanel(all[i])) makeCollapsible(all[i]); }
  }
  var scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 16); };
    raf(function () { scanScheduled = false; scan(); });
  }
  function start() {
    scan();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { scheduleScan(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;

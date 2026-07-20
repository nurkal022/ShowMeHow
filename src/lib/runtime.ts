/** Инжектится в каждый артефакт. Ошибки → parent через postMessage; пауза/пуск/сброс. */
export const HARNESS_JS = `
(function () {
  function report(msg) {
    try { parent.postMessage({ type: 'sim-error', message: String(msg) }, '*'); } catch (e) {}
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
  });
})();
`;

/** Стили панели управления симуляцией. */
export const UIKIT_CSS = `
:root { --sim-bg:#101318; --sim-panel:#1a2029; --sim-text:#e8ecf1; --sim-muted:#8b95a3;
  --sim-accent:#4f8ff7; }
body { margin:0; background:var(--sim-bg); color:var(--sim-text);
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif; }
.sim-panel { position:fixed; right:12px; top:12px; width:260px; padding:14px;
  background:color-mix(in srgb, var(--sim-panel) 92%, transparent);
  border:1px solid #2a3341; border-radius:12px; backdrop-filter:blur(6px);
  display:flex; flex-direction:column; gap:10px; z-index:10; }
.sim-panel h1 { font-size:15px; margin:0 0 4px; }
.sim-control label { display:flex; justify-content:space-between;
  font-size:12px; color:var(--sim-muted); margin-bottom:4px; }
.sim-control input[type=range] { width:100%; accent-color:var(--sim-accent); }
.sim-btns { display:flex; gap:8px; }
.sim-btns button { flex:1; padding:6px 0; border-radius:8px; border:1px solid #2a3341;
  background:var(--sim-panel); color:var(--sim-text); cursor:pointer; font-size:13px; }
.sim-btns button:hover { border-color:var(--sim-accent); }
.sim-value { color:var(--sim-text); font-variant-numeric:tabular-nums; }
.sim-panel-toggle { display:none; }
.sim-panel-close { display:none; }

/* Мобильный SimUI: панель сворачивается в таблетку «Параметры» снизу; развёрнутое
   состояние — bottom-sheet с теми же контролами. На широком экране — как раньше. */
@media (max-width:640px) {
  .sim-panel {
    left:8px; right:8px; top:auto; bottom:0; width:auto; z-index:12;
    border-radius:16px 16px 0 0; max-height:72vh; overflow-y:auto;
    padding:18px 16px 26px; transform:translateY(112%); transition:transform .25s ease;
  }
  .sim-panel.sim-panel-open { transform:translateY(0); box-shadow:0 -8px 28px rgba(0,0,0,.45); }
  .sim-panel-toggle {
    display:inline-flex; align-items:center; gap:6px; position:fixed; left:50%; bottom:16px;
    transform:translateX(-50%); z-index:11; min-height:48px; padding:12px 22px;
    border-radius:999px; border:1px solid #2a3341;
    background:color-mix(in srgb, var(--sim-panel) 94%, transparent); backdrop-filter:blur(6px);
    color:var(--sim-text); font:inherit; font-size:15px; cursor:pointer;
    box-shadow:0 6px 20px rgba(0,0,0,.4);
  }
  .sim-panel-toggle.sim-panel-hidden { display:none; }
  .sim-panel-close {
    display:flex; align-items:center; justify-content:center; position:absolute; top:10px; right:10px;
    width:36px; height:36px; border-radius:999px; border:1px solid #2a3341;
    background:var(--sim-panel); color:var(--sim-text); font-size:16px; line-height:1; cursor:pointer;
  }
  .sim-control input[type=range] { height:34px; }
  .sim-btns button { padding:12px 0; min-height:46px; font-size:15px; }
}

.smh-collapse-btn { position:absolute; top:6px; right:6px; z-index:3; width:28px; height:28px;
  border-radius:8px; border:1px solid #2a3341; background:var(--sim-panel); color:var(--sim-text);
  font-size:13px; line-height:1; cursor:pointer; padding:0; }
[data-smh-panel].smh-collapsed { width:auto!important; min-width:0!important; max-width:none!important;
  height:auto!important; min-height:0!important; max-height:none!important;
  padding:6px!important; overflow:hidden!important; }
[data-smh-panel].smh-collapsed > *:not(.smh-collapse-btn) { display:none!important; }
`;

/** SimUI — фабрика контролов. Генератор обязан использовать её, не изобретать своё. */
export const UIKIT_JS = `
window.SimUI = (function () {
  var panel = null;
  var toggle = null;
  var open = false;
  function setOpen(v) {
    open = v;
    if (panel) {
      if (open) panel.className = 'sim-panel sim-panel-open';
      else panel.className = 'sim-panel';
    }
    if (toggle) {
      // Прячем таблетку, пока лист открыт, чтобы не перекрывала контролы.
      toggle.className = open ? 'sim-panel-toggle sim-panel-hidden' : 'sim-panel-toggle';
    }
  }
  function ensurePanel(title) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'sim-panel';
      // Кнопка закрытия листа (видна только на мобиле через CSS).
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'sim-panel-close';
      close.setAttribute('aria-label', 'Закрыть параметры');
      close.textContent = '✕';
      close.onclick = function () { setOpen(false); };
      panel.appendChild(close);
      if (title) { var h = document.createElement('h1'); h.textContent = title; panel.appendChild(h); }
      document.body.appendChild(panel);
      if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(panel, { noMobileCollapse: true });
      // Таблетка-переключатель снизу по центру (видна только на мобиле через CSS).
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'sim-panel-toggle';
      toggle.textContent = '⚙ Параметры';
      toggle.onclick = function () { setOpen(!open); };
      document.body.appendChild(toggle);
    }
    return panel;
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
    wrap.appendChild(lab); wrap.appendChild(inp); panel.appendChild(wrap);
    return inp;
  }
  function playPause(o) { // {onPlay,onPause,onReset}
    ensurePanel();
    var box = document.createElement('div'); box.className = 'sim-btns';
    var playing = true;
    var b1 = document.createElement('button'); b1.textContent = '⏸ Пауза';
    var b2 = document.createElement('button'); b2.textContent = '↺ Сброс';
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
  return { slider: slider, playPause: playPause, title: title };
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
        el.classList.contains('sim-panel-toggle'))) return false;
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
  function start() {
    scan();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { scan(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;

/** Описание API для системного промпта генератора. */
export const UIKIT_DOC = `
В артефакт уже встроен UI-kit (не подключай его сам, не пиши свои панели/слайдеры):
- SimUI.title('Название симуляции') — панель с заголовком (справа сверху).
- SimUI.slider({label:'Температура', min:0, max:100, step:1, value:20, unit:'°C',
    onChange:(v)=>{...}}) — слайдер параметра.
- SimUI.playPause({onPlay:()=>{}, onPause:()=>{}, onReset:()=>{}}) — кнопки Пауза/Сброс.
Стили: тёмный фон уже задан; canvas растягивай на всё окно.
`;

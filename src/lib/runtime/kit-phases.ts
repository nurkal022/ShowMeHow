/**
 * Показ по фазам: SimUI.phases({key: 'phase', items: [{name, text}], mode: 'step'}).
 *
 * Процесс с этапами (такты двигателя, митоз, цикл Карно) преподаватель показывает пошагово:
 * тренажёр останавливается в начале каждой фазы, крупно пишет, что сейчас произойдёт, и ждёт
 * «Далее». Фаза проигрывается целиком и снова останавливается на границе следующей. «Назад» и
 * клик по фазе возвращают к её началу (снимок состояния), к ещё не виденной фазе тренажёр
 * доматывает сам. Режим «Авто» — непрерывный показ с короткой остановкой на каждой границе.
 *
 * Номер фазы даёт ядро: PHYS.observe(...)[key] — 0..n-1 по порядку items. Шаги на границе
 * делаются мелкими, поэтому остановка приходится точно на начало фазы, а не «где-то после».
 */
export const KIT_PHASES_JS = `
(function () {
  var K = window.SimUI;

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function clone(x) {
    try { if (typeof structuredClone === 'function') return structuredClone(x); } catch (e) {}
    try { return JSON.parse(JSON.stringify(x)); } catch (e2) { return null; }
  }
  function assignInPlace(dst, src) {
    if (!dst || !src) return;
    for (var k in dst) if (Object.prototype.hasOwnProperty.call(dst, k) && !Object.prototype.hasOwnProperty.call(src, k)) delete dst[k];
    for (var k2 in src) if (Object.prototype.hasOwnProperty.call(src, k2)) dst[k2] = src[k2];
  }

  function phases(o) {
    if (Array.isArray(o)) o = { items: o };
    o = o || {};
    var items = (o.items || o.phases || []).map(function (it) { return typeof it === 'string' ? { name: it } : (it || {}); });
    var n = items.length;
    if (!n) return null;
    var key = o.key || o.phase || 'phase';
    // Под автоматической проверкой — непрерывный показ: пробы ждут движения кадра.
    var webdriver = false;
    try { webdriver = !!navigator.webdriver; } catch (e) {}
    // ?phases=auto — показ в витрине: сразу движение, «Пошагово» включается кнопкой.
    var forceAuto = false;
    try { forceAuto = /(^|[?&])phases=auto(&|$)/.test(location.search); } catch (e) {}
    var mode = webdriver || forceAuto ? 'auto' : (o.mode === 'auto' ? 'auto' : 'step');
    var dwellMs = o.dwell == null ? 900 : Number(o.dwell) * 1000;
    var cur = 0, hold = mode === 'step', dwellUntil = 0, snaps = {}, started = false;

    function idx(v) {
      if (typeof v === 'string') { for (var i = 0; i < n; i++) if (items[i].name === v) return i; return cur; }
      var x = Math.floor(Number(v));
      if (!isFinite(x)) return cur;
      return ((x % n) + n) % n;
    }

    // ---------- Интерфейс: подпись фазы и панель ведущего ----------
    document.body.classList.add('sim-has-phases');
    var cap = document.createElement('div'); cap.className = 'sim-phase-caption';
    var capName = document.createElement('div'); capName.className = 'sim-phase-name';
    var capText = document.createElement('div'); capText.className = 'sim-phase-text';
    var capHint = document.createElement('div'); capHint.className = 'sim-phase-hint';
    cap.appendChild(capName); cap.appendChild(capText); cap.appendChild(capHint);
    var bar = document.createElement('div'); bar.className = 'sim-phase-bar';
    function btn(text, cls, fn, title) {
      var b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text;
      if (title) b.title = title;
      b.onclick = fn; return b;
    }
    var prevB = btn('◀', 'sim-phase-nav', function () { back(); }, __simT('phasePrev'));
    var chipsBox = document.createElement('div'); chipsBox.className = 'sim-phase-chips';
    var chips = items.map(function (it, i) {
      var c = btn(String(i + 1), 'sim-phase-chip', function () { jump(i); }, K.uni(it.name || ''));
      c.style.setProperty('--sim-phase-color', K.color ? K.color(it.color || 'blue') : '#5b9cff');
      chipsBox.appendChild(c); return c;
    });
    var nextB = btn(__simT('phaseNext'), 'sim-phase-next', function () { next(); });
    var againB = btn('⟲', 'sim-phase-nav', function () { again(); }, __simT('phaseAgain'));
    var modeB = btn('', 'sim-phase-mode', function () { setMode(mode === 'step' ? 'auto' : 'step'); });
    bar.appendChild(prevB); bar.appendChild(chipsBox); bar.appendChild(againB); bar.appendChild(nextB); bar.appendChild(modeB);
    document.body.appendChild(cap); document.body.appendChild(bar);

    function paint() {
      var it = items[cur] || {};
      capName.textContent = (cur + 1) + ' / ' + n + ' · ' + K.uni(it.name || '');
      capText.textContent = K.uni(it.text || it.sub || '');
      cap.style.setProperty('--sim-phase-color', K.color ? K.color(it.color || 'blue') : '#5b9cff');
      capHint.textContent = mode === 'step' ? (hold ? __simT('phaseHintHold') : __simT('phaseHintPlay')) : '';
      for (var i = 0; i < n; i++) {
        // Название — только у текущей фазы: панель остаётся узкой и не закрывает приборы.
        chips[i].textContent = i === cur ? (i + 1) + '. ' + K.uni(items[i].name || '') : String(i + 1);
        chips[i].classList.toggle('on', i === cur);
        chips[i].classList.toggle('done', !!snaps[i] && i !== cur);
      }
      nextB.classList.toggle('sim-pulse-btn', mode === 'step' && hold);
      nextB.disabled = mode === 'auto';
      modeB.textContent = mode === 'step' ? __simT('phaseModeStep') : __simT('phaseModeAuto');
      cap.classList.toggle('sim-phase-held', hold && mode === 'step');
      if (K.__layout) K.__layout();
    }

    var run = function () { return window.__smhRun || null; };
    function snapshot(i) { var r = run(); if (r) snaps[i] = { S: clone(r.S), t: r.time ? r.time() : 0 }; }
    function restore(i) {
      var r = run(), sn = snaps[i];
      if (!r || !sn) return false;
      var c = clone(sn.S);
      if (!c) return false;
      assignInPlace(r.S, c);
      if (r.__setTime) r.__setTime(sn.t);
      return true;
    }

    function next() {
      if (mode !== 'step') return;
      if (!started) started = true;
      hold = false; dwellUntil = 0;
      paint();
    }
    function again() { if (restore(cur)) { hold = mode === 'step' ? false : hold; dwellUntil = 0; paint(); } }
    function back() {
      var target = (cur - 1 + n) % n;
      if (snaps[target]) { restore(target); cur = target; hold = mode === 'step'; paint(); }
      else jump(target);
    }
    function jump(i) {
      i = idx(i);
      var r = run();
      if (!r) return;
      if (snaps[i]) { restore(i); cur = i; }
      else if (r.__advanceTo) {
        // Фаза ещё не встречалась: назад — с начала опыта, вперёд — с текущего места; доматываем мелкими
        // шагами (не дольше 2 минут модельного времени) и по пути запоминаем начало каждой фазы.
        if (i < cur && r.reset) r.reset();
        var last = cur;
        r.__advanceTo(function (ob) {
          var ph = idx(ob[key]);
          if (ph !== last) { last = ph; cur = ph; snapshot(ph); }
          return ph === i;
        }, 120);
        cur = i;
      }
      hold = mode === 'step'; dwellUntil = 0;
      paint();
    }
    function setMode(m) { mode = m; hold = m === 'step'; dwellUntil = 0; paint(); }

    window.addEventListener('keydown', function (e) {
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); if (mode === 'step') next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); back(); }
    });

    var ctl = {
      key: key, n: n,
      /** Пока стоим на границе фазы или в короткой паузе автопоказа — физика не идёт. */
      blocked: function () { return (mode === 'step' && hold) || now() < dwellUntil; },
      /** После каждого мелкого шага: true — остановиться в этом кадре. */
      afterStep: function (ob) {
        var ph = idx(ob[key]);
        if (ph === cur) return false;
        cur = ph;
        snapshot(ph);
        if (mode === 'step') hold = true; else dwellUntil = now() + dwellMs;
        paint();
        return true;
      },
      /** Сброс тренажёра: снова первая фаза, снимки устарели. */
      reset: function (ob) { snaps = {}; cur = ob ? idx(ob[key]) : 0; snapshot(cur); hold = mode === 'step'; dwellUntil = 0; paint(); },
      start: function (ob) { cur = ob ? idx(ob[key]) : 0; snapshot(cur); paint(); },
    };
    K.__phaseCtl = ctl;
    K.__register({ kind: 'phases', name: o.name || 'phases', label: __simT('phases'), min: 0, max: n - 1,
      get: function () { return cur; }, set: function (v) { jump(v); }, activate: function () { next(); } });
    paint();
    return { next: next, back: back, jump: jump, again: again, mode: setMode, get: function () { return cur; } };
  }

  K.phases = phases;
  K.stages = phases;
})();
`;

export const KIT_PHASES_CSS = `
/* Подпись фазы сверху по центру и панель ведущего снизу. */
.sim-phase-caption { position:fixed; top:12px; left:calc(50% - 136px); transform:translateX(-50%); z-index:11;
  width:min(520px, calc(100vw - 620px)); min-width:280px; box-sizing:border-box; padding:10px 18px 11px;
  background:var(--sim-glass); border:1px solid var(--sim-border); border-left:4px solid var(--sim-phase-color, var(--sim-accent));
  border-radius:14px; box-shadow:var(--sim-shadow); animation:sim-fade .35s ease backwards; }
.sim-phase-name { font-size:18px; font-weight:700; letter-spacing:.2px; }
.sim-phase-text { font-size:13.5px; color:var(--sim-text); opacity:.86; line-height:1.45; margin-top:3px; }
.sim-phase-text:empty, .sim-phase-hint:empty { display:none; }
.sim-phase-hint { font-size:11.5px; color:var(--sim-muted); margin-top:6px; }
.sim-phase-held { box-shadow:var(--sim-shadow), 0 0 0 2px color-mix(in srgb, var(--sim-phase-color, var(--sim-accent)) 45%, transparent); }
body.sim-has-phases .sim-banner { display:none; }
.sim-phase-bar { position:fixed; bottom:14px; left:calc(50% - 136px); transform:translateX(-50%); z-index:11;
  display:flex; align-items:center; gap:6px; padding:6px; max-width:min(660px, calc(100vw - 580px)); box-sizing:border-box;
  background:var(--sim-glass); border:1px solid var(--sim-border); border-radius:14px; box-shadow:var(--sim-shadow); }
.sim-phase-chips { display:flex; gap:4px; overflow-x:auto; scrollbar-width:none; flex:1; min-width:0; }
.sim-phase-chips::-webkit-scrollbar { display:none; }
.sim-phase-chip, .sim-phase-nav, .sim-phase-next, .sim-phase-mode { border:1px solid var(--sim-border); background:var(--sim-soft);
  color:var(--sim-muted); font:inherit; font-size:12.5px; font-weight:600; border-radius:9px; padding:7px 10px; cursor:pointer;
  white-space:nowrap; transition:background .15s, color .15s, border-color .15s; }
.sim-phase-chip { flex:0 0 auto; min-width:34px; }
.sim-phase-chip.done { color:var(--sim-text); }
.sim-phase-chip.on { color:var(--sim-text); border-color:var(--sim-phase-color, var(--sim-accent));
  background:color-mix(in srgb, var(--sim-phase-color, var(--sim-accent)) 26%, transparent); }
.sim-phase-nav { padding:7px 9px; }
.sim-phase-next { color:#fff; background:var(--sim-accent); border-color:var(--sim-accent); padding:7px 14px; }
.sim-phase-next:disabled { opacity:.35; cursor:default; }
.sim-phase-mode { font-weight:500; }
.sim-phase-chip:hover, .sim-phase-nav:hover, .sim-phase-mode:hover { color:var(--sim-text); border-color:color-mix(in srgb, var(--sim-accent) 60%, transparent); }
@keyframes sim-pulse-btn { 0%, 100% { box-shadow:0 0 0 0 color-mix(in srgb, var(--sim-accent) 60%, transparent); } 50% { box-shadow:0 0 0 6px transparent; } }
.sim-pulse-btn { animation:sim-pulse-btn 1.6s ease-in-out infinite; }
body.sim-has-phases .sim-actions { bottom:74px; }
body.sim-has-phases .sim-toasts { top:auto; bottom:130px; }
.sim-still .sim-pulse-btn, .sim-still .sim-phase-caption { animation:none!important; }
@media (max-width:1100px) and (min-width:641px) {
  .sim-phase-caption { width:min(480px, calc(100vw - 320px)); }
  .sim-phase-bar { max-width:calc(100vw - 300px); }
}
@media (max-width:640px) {
  .sim-phase-caption { left:8px; right:8px; transform:none; width:auto; min-width:0; padding:8px 12px; }
  .sim-phase-name { font-size:15px; }
  .sim-phase-text { font-size:12.5px; }
  .sim-phase-bar { left:8px; right:8px; transform:none; max-width:none; min-width:0; bottom:72px; }
  .sim-phase-mode { display:none; }
  body.sim-has-phases .sim-actions { bottom:132px; }
  body.sim-sheet-mode .sim-phase-bar, body.sim-sheet-mode .sim-phase-caption { display:none; }
}
`;

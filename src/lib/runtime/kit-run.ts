/**
 * SimUI.run — главный цикл тренажёра одним вызовом.
 *
 *   SimUI.run({ physics: PHYS, P: P, S: S, draw: draw, hooks: hooks })
 *
 * Берёт на себя всё, на чём модели чаще всего ошибались: requestAnimationFrame с клампом
 * dt и множителем скорости, пауза и сброс (физика и картинка), SimUI.expose для проб,
 * обновление привязанных приборов (readout/chart/formula/banner/meter с key), изоляция
 * ошибок в слоях, сторож NaN, остановка за пределами экрана. Модели остаётся ядро PHYS и
 * draw(o, P, S).
 *
 * Параметр, от которого зависит только начальное состояние (амплитуда, стартовая скорость),
 * при движении слайдера перезапускает опыт: иначе ползунок «ничего не делает» до сброса.
 */
export const KIT_RUN_JS = `
(function () {
  var K = window.SimUI;

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function assignInPlace(dst, src) {
    if (!dst || !src || dst === src) return;
    for (var k in dst) if (Object.prototype.hasOwnProperty.call(dst, k) && !Object.prototype.hasOwnProperty.call(src, k)) delete dst[k];
    for (var k2 in src) if (Object.prototype.hasOwnProperty.call(src, k2)) dst[k2] = src[k2];
  }
  /** Детерминированный Math.random на время сравнения: init с частицами иначе всегда «разный». */
  function seeded(fn) {
    var orig = Math.random, s = 123456789;
    Math.random = function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    try { return fn(); } finally { Math.random = orig; }
  }
  function snapshot(x) {
    try { return JSON.stringify(x, function (k, v) { return typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v; }); } catch (e) { return null; }
  }
  function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } }
  function copyP(P) { var o = {}; for (var k in P) o[k] = P[k]; return o; }

  function run(o) {
    // Синонимы: run(PHYS, draw), run({phys}), run({init, step, observe, draw}).
    if (o && typeof o.init === 'function' && typeof o.step === 'function' && !o.physics) {
      o = { physics: o, draw: arguments[1], P: arguments[2] };
    }
    o = o || {};
    var PH = o.physics || o.phys || o.PHYS || o.model || o.core;
    if (!PH) PH = { init: o.init || function () { return { t: 0 }; }, step: o.step || function (s, p, dt) { s.t += dt; }, observe: o.observe };
    if (typeof PH.observe !== 'function') PH.observe = function (s) { var r = {}; for (var k in s) if (typeof s[k] === 'number') r[k] = s[k]; return r; };
    var draw = o.draw || o.render || o.scene || null;
    var hooks = o.hooks || { frame: [], reset: [] };
    if (!hooks.frame) hooks.frame = [];
    if (!hooks.reset) hooks.reset = [];
    var safe = K.__safe;

    // Параметры: объект P модели; недостающие значения — из уже созданных контролов.
    var P = o.P || o.params || K.__params || {};
    var cs = K.__controls();
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (!c.name || !c.get || P[c.name] !== undefined) continue;
      if (c.kind === 'slider' || c.kind === 'select' || c.kind === 'toggle') { try { P[c.name] = c.get(); } catch (e) {} }
    }
    K.__params = P;

    var S = o.S || o.state || null;
    function fresh() {
      var s = PH.init(P);
      return s && typeof s === 'object' ? s : { value: s };
    }
    if (!S || typeof S !== 'object') S = fresh();

    var running = true, t = 0, last = null, obs = {}, diverged = 0, divergedAt = [], visibleNow = true;
    var api = { P: P, S: S, hooks: hooks };

    function observe() {
      var r = safe(PH.observe, [S, P], 'PHYS.observe');
      obs = r && typeof r === 'object' ? r : {};
      return obs;
    }
    function tickBound(isRunning) {
      var b = K.__bound ? K.__bound() : [];
      for (var i = 0; i < b.length; i++) safe(b[i].tick, [obs, P, isRunning], 'приборе');
    }
    function reset() {
      assignInPlace(S, fresh());
      t = 0; last = null;
      var b = K.__bound ? K.__bound() : [];
      // Живые графики (время, фазовая) начинают заново; кривые и столбцы пересчитаются сами.
      for (var i = 0; i < b.length; i++) if (b[i].chart && b[i].stream) b[i].widget.clear();
      for (var h = 0; h < hooks.reset.length; h++) safe(hooks.reset[h], [], 'hooks.reset');
      safe(o.onReset, [], 'onReset');
      observe();
      if (K.__phaseCtl) safe(K.__phaseCtl.reset, [obs], 'фазах');
      tickBound(false);
      return api;
    }
    api.reset = reset;
    K.__resetSim = reset;

    // Какой параметр влияет только на начальное состояние: сравниваем init и один шаг step.
    var initOnly = {};
    function classify(name, before, after) {
      if (initOnly[name] !== undefined) return initOnly[name];
      var verdict = false;
      try {
        var Pa = copyP(P), Pb = copyP(P);
        Pa[name] = before; Pb[name] = after;
        var ia = seeded(function () { return snapshot(PH.init(Pa)); });
        var ib = seeded(function () { return snapshot(PH.init(Pb)); });
        if (ia !== null && ia !== ib) {
          var sa = clone(S), sb = clone(S);
          if (sa && sb) {
            seeded(function () { PH.step(sa, Pa, 1 / 60); });
            seeded(function () { PH.step(sb, Pb, 1 / 60); });
            verdict = snapshot(sa) === snapshot(sb);
          }
        }
      } catch (e) { verdict = false; }
      initOnly[name] = verdict;
      return verdict;
    }
    // Прошлые значения храним сами: SimUI.params пишет P[name] раньше, чем зовёт слушателей.
    var prev = copyP(P);
    K.__onChange(function (name, v) {
      var before = prev[name];
      var isParam = Object.prototype.hasOwnProperty.call(P, name);
      if (!isParam) return;
      P[name] = v;
      prev[name] = v;
      if (typeof v === 'number' && typeof before === 'number' && before !== v && o.autoReset !== false && classify(name, before, v)) reset();
      else { observe(); }
    });

    // Скорость и пауза — если модель их не создала сама.
    var speedCtl = null;
    if (o.speed !== false) speedCtl = K.speed(Array.isArray(o.speed) ? { values: o.speed } : (o.speed || {}));
    var pp = null;
    if (!document.querySelector('[data-smh-btn="playpause"]')) {
      pp = K.playPause({
        onPlay: function () { running = true; last = null; safe(o.onPlay, [], 'onPlay'); },
        onPause: function () { running = false; safe(o.onPause, [], 'onPause'); },
        onReset: function () { reset(); },
      });
    }
    api.pause = function () { if (pp) pp.pause(); else running = false; };
    api.play = function () { if (pp) pp.play(); else running = true; };
    api.running = function () { return running; };
    K.__isPaused = function () { return !running; };
    api.observe = function () { return observe(); };
    api.time = function () { return t; };

    // Самопроверка: состояние для проб — наблюдаемые величины и текущие параметры.
    if (!(window.__smh && window.__smh.hasExpose())) {
      K.expose({
        getState: function () {
          var r = {}, ob = observe();
          for (var k in ob) if (typeof ob[k] === 'number' || typeof ob[k] === 'boolean') r[k] = ob[k];
          for (var q in P) if (r[q] === undefined && (typeof P[q] === 'number' || typeof P[q] === 'boolean')) r[q] = P[q];
          if (r.t === undefined) r.t = t;
          return r;
        },
        reset: reset,
        // Фраза «что сейчас происходит» для наставника ученика — если страница её дала.
        summary: typeof o.summary === 'function' ? function () { return o.summary(observe(), P); } : undefined,
      });
    }

    // Невидимый тренажёр (iframe прокручен за экран) не считает и не рисует.
    if (window.IntersectionObserver && o.offscreen !== true) {
      try {
        new IntersectionObserver(function (es) { visibleNow = es[0] ? es[0].isIntersecting : true; last = null; })
          .observe(document.documentElement);
      } catch (e) {}
    }

    function badKey(ob) {
      for (var k in ob) if (typeof ob[k] === 'number' && !isFinite(ob[k])) return k + ' = ' + ob[k];
      return null;
    }
    var keysChecked = false, startedAt = now();
    function checkKeys() {
      keysChecked = true;
      var b = K.__bound ? K.__bound() : [], have = [];
      for (var k in obs) have.push(k);
      for (var i = 0; i < b.length; i++) {
        var ks = b[i].keys || [];
        for (var j = 0; j < ks.length; j++) {
          if (obs[ks[j]] === undefined && P[ks[j]] === undefined && ks[j] !== 't') {
            try { console.error('Прибор ждёт величину «' + ks[j] + '», но PHYS.observe() её не возвращает (есть: ' + have.join(', ') + ')'); } catch (e) {}
          }
        }
      }
    }

    var maxDt = o.maxDt || 0.05, subH = o.substep || o.maxStep || 0, drawPauseUntil = 0, slowDraws = 0;
    function stepOnce(h) {
      var r = PH.step(S, P, h);
      if (r && typeof r === 'object' && r !== S) assignInPlace(S, r);
    }
    function advance(dt) {
      if (subH > 0) { var n = Math.min(400, Math.max(1, Math.ceil(dt / subH))), h = dt / n; for (var i = 0; i < n; i++) stepOnce(h); }
      else stepOnce(dt);
      t += dt;
    }
    api.__setTime = function (v) { t = Number(v) || 0; observe(); };
    /** Доматывает симуляцию, пока pred(o) не станет истинным (для перехода к ещё не виденной фазе). */
    api.__advanceTo = function (pred, maxSec) {
      var limit = (maxSec || 60) * 240;
      for (var i = 0; i < limit; i++) {
        advance(1 / 240);
        observe();
        if (pred(obs)) break;
      }
      tickBound(false);
    };
    function frame(ts) {
      requestAnimationFrame(frame);
      if (!visibleNow) return;
      if (last == null) last = ts;
      var raw = Math.min(maxDt, Math.max(0, (ts - last) / 1000));
      last = ts;
      var k = speedCtl ? speedCtl.get() : 1;
      var dt = raw * k;
      var stepped = false;
      var ctl = K.__phaseCtl;
      if (running && dt > 0 && !(ctl && ctl.blocked())) {
        try {
          if (ctl) {
            // Показ по фазам: мелкие шаги, чтобы остановиться ровно в начале следующей фазы.
            var left = dt;
            while (left > 1e-9) {
              var hh = Math.min(left, 1 / 240);
              advance(hh); left -= hh;
              observe();
              if (ctl.afterStep(obs)) break;
            }
          } else advance(dt);
          stepped = true;
        } catch (e) {
          safe(function () { throw e; }, [], 'PHYS.step');
          running = false;
          if (pp) pp.pause();
        }
      }
      observe();
      if (stepped) {
        var bad = badKey(obs);
        if (bad) {
          // Сторож: расчёт разошёлся — перезапуск вместо «NaN» на экране; часто — пауза и сообщение.
          diverged++;
          api.diverged = diverged;
          api.lastBad = bad;
          var tn = now();
          divergedAt.push(tn);
          while (divergedAt.length && tn - divergedAt[0] > 5000) divergedAt.shift();
          if (divergedAt.length >= 3) { running = false; if (pp) pp.pause(); if (K.toast) K.toast(__simT('diverged'), { color: 'red' }); }
          reset();
          return;
        }
        for (var j = 0; j < hooks.frame.length; j++) safe(hooks.frame[j], [obs, dt], 'hooks.frame');
        safe(o.onFrame, [obs, dt], 'onFrame');
      }
      tickBound(running);
      // Тяжёлый кадр (тысячи фигур у модели) не должен вешать вкладку: после долгой отрисовки
      // пропускаем несколько кадров — картинка реже, но слайдеры и кнопки отвечают сразу.
      if (draw && now() >= drawPauseUntil) {
        var d0 = now();
        safe(draw, [obs, P, S, dt], 'draw');
        var dd = now() - d0;
        if (dd > 40) { drawPauseUntil = now() + dd * 0.8; slowDraws++; }
        if (slowDraws === 30) { try { console.warn('Отрисовка кадра занимает ' + Math.round(dd) + ' мс — сцена тяжёлая (для полей используй view.heatmap, для частиц — view.dots)'); } catch (e) {} slowDraws++; }
      }
      if (!keysChecked && now() - startedAt > 1500) checkKeys();
    }
    window.__smhRun = api;
    K.__phys = PH;
    observe();
    if (K.__phaseCtl) safe(K.__phaseCtl.start, [obs], 'фазах');
    tickBound(false);
    requestAnimationFrame(frame);
    return api;
  }

  /**
   * Зависимость от параметра: SimUI.sweep({param: 'R', y: 'I', title}) — кривая y(param) по всему
   * диапазону слайдера, посчитанная тем же ядром (init → settle секунд шагов → observe), и маркер
   * текущего состояния. Закон Ома, период от длины, КПД от степени сжатия — без ручных формул.
   */
  function sweep(o) {
    o = o || {};
    var ys = o.y == null ? [] : (Array.isArray(o.y) ? o.y : [o.y]);
    var c = {};
    for (var k in o) c[k] = o[k];
    c.mode = 'curve';
    delete c.y; delete c.data;
    var ch = K.chart(c);
    var lastKey = null, N = o.samples || 40;
    function range() {
      if (o.x) return o.x;
      var cs = K.__controls();
      for (var i = 0; i < cs.length; i++) if (cs[i].name === o.param && cs[i].min != null) return [cs[i].min, cs[i].max];
      return [0, 1];
    }
    function rebuild(P) {
      var PH = K.__phys;
      if (!PH) return;
      var rest = copyP(P); delete rest[o.param];
      var key = JSON.stringify(rest);
      if (key === lastKey) return;
      lastKey = key;
      var r = range(), xs = [], out = [];
      for (var s0 = 0; s0 < ys.length; s0++) out.push([]);
      var settle = Number(o.settle) || 0, dt = 1 / 60, steps = Math.min(Math.round(settle / dt), Math.floor(20000 / N));
      for (var i = 0; i <= N; i++) {
        var x = r[0] + (r[1] - r[0]) * i / N, Pc = copyP(P);
        Pc[o.param] = x;
        var ob = seeded(function () {
          try {
            var st = PH.init(Pc);
            for (var n = 0; n < steps; n++) { var rr = PH.step(st, Pc, dt); if (rr && typeof rr === 'object' && rr !== st) st = rr; }
            return PH.observe(st, Pc) || {};
          } catch (e) { return {}; }
        });
        xs.push(x);
        for (var j = 0; j < ys.length; j++) {
          var v = typeof ys[j] === 'function' ? ys[j](ob, Pc) : (ob[ys[j]] !== undefined ? ob[ys[j]] : Pc[ys[j]]);
          out[j].push(Number(v));
        }
      }
      ch.set(xs, ys.length > 1 ? out : out[0]);
    }
    K.__bind({ widget: ch, keys: ys.filter(function (y) { return typeof y === 'string'; }), tick: function (oo, P) {
      rebuild(P);
      var y0 = typeof ys[0] === 'function' ? ys[0](oo, P) : (oo[ys[0]] !== undefined ? oo[ys[0]] : P[ys[0]]);
      ch.setMarker(Number(P[o.param]), Number(y0));
    } });
    return ch;
  }

  K.run = run;
  K.start = run;
  K.sweep = sweep;

  // Страница не создала ни одного контрола и не запустила цикл — её код оборвался молча
  // (ранний return на верхнем уровне, исключение в обработчике). Без этой строки фиксер
  // видит «нет слайдеров» и не знает почему.
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (window.__smhRun || K.__controls().length || !document.getElementById('scene')) return;
      try { console.error('Тренажёр не создал ни одного контрола и не вызвал SimUI.run: код страницы оборвался раньше — ранний return на верхнем уровне (например, «return {init, step, observe}» вне обёртки var PHYS = (function () {…})()) или исключение'); } catch (e) {}
    }, 1200);
  });
})();
`;

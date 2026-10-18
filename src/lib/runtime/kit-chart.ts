/**
 * SimUI.chart — живой график на собственном canvas: «круглые» деления осей, сетка,
 * легенда, автомасштаб, кольцевой буфер, заливка под линией и текущее значение у
 * правого края. Заменяет chart.js: внешние библиотеки графиков ненадёжны (UMD/module,
 * ошибки загрузки), а нам нужен предсказуемый рендер в headless-браузере.
 *
 * Режимы: time — величина от времени (push), xy — фазовая диаграмма (push), bars —
 * столбцы (set), curve — кривая целиком (set: профиль волны, спектр, U(x)).
 * SimUI.plot({fn}) — график функции, который сам перестраивается при смене параметров.
 */
export const KIT_CHART_JS = `
(function () {
  var K = window.SimUI;
  var PALETTE = ['#5b9cff', '#ffa94d', '#4ade80', '#f472b6', '#a78bfa', '#facc15', '#22d3ee', '#f87171'];

  function nice(span, n) {
    var raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function tickFmt(v, step) {
    if (Math.abs(v) < step * 1e-6) v = 0;
    var a = Math.abs(v);
    if (a >= 1e5 || (a > 0 && a < 1e-3)) return v.toExponential(0).replace('e+', 'e');
    var d = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log(step) / Math.LN10 - 1e-9));
    return v.toFixed(d);
  }
  function valFmt(v) { return K.fmt ? K.fmt(v) : String(Math.round(v * 100) / 100); }

  function chart(o) {
    o = o || {};
    var mode = o.mode === 'xy' || o.mode === 'phase' ? 'xy' : o.mode === 'bars' || o.mode === 'bar' ? 'bars'
      : o.mode === 'curve' || o.mode === 'line' || o.mode === 'profile' ? 'curve' : 'time';
    var yKeys = o.y == null ? [] : (Array.isArray(o.y) ? o.y : [o.y]);
    var series = o.series || [];
    if (!series.length) {
      if (yKeys.length) for (var yi = 0; yi < yKeys.length; yi++) series.push({ name: typeof yKeys[yi] === 'string' ? yKeys[yi] : '' });
      else series.push({ name: '' });
    }
    for (var si0 = 0; si0 < series.length; si0++) {
      if (typeof series[si0] === 'string') series[si0] = { name: series[si0] };
      series[si0].color = K.color && series[si0].color ? K.color(series[si0].color) : (series[si0].color || PALETTE[si0 % PALETTE.length]);
    }
    var maxPoints = o.maxPoints || (mode === 'xy' ? 900 : 360);
    if (o.xLabel) o.xLabel = K.uni(o.xLabel);
    if (o.yLabel) o.yLabel = K.uni(o.yLabel);
    var W = o.width || 300, H = o.height || 170;
    var PL = 40, PR = 12, PT = 16, PB = 22;

    var body = K.panel({ title: o.title || __simT('chart'), corner: o.corner || 'br', collapsed: !!o.collapsed });
    var cv = document.createElement('canvas');
    cv.className = 'sim-chart';
    body.appendChild(cv);

    if (series.length > 1 || (series[0] && series[0].name && !yKeys.length) || (series[0] && series[0].name && series[0].name !== yKeys[0])) {
      var leg = document.createElement('div');
      leg.className = 'sim-chart-legend';
      for (var li = 0; li < series.length; li++) {
        var sp = document.createElement('span');
        var sw = document.createElement('i');
        sw.style.background = series[li].color;
        sp.appendChild(sw);
        sp.appendChild(document.createTextNode(K.uni(series[li].name) || __simT('series', { n: li + 1 })));
        leg.appendChild(sp);
      }
      body.appendChild(leg);
    }

    var ctx = cv.getContext('2d');
    var xs = [], ys = [], dirty = false, cats = null;
    var panelEl = body.parentNode;

    function sizeCanvas() {
      // Узкий экран: график по ширине листа, а не фиксированные 300 px.
      var w = W;
      if (K.__isMobile && K.__isMobile()) w = Math.max(220, Math.min(560, window.innerWidth - 56));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = w + 'px';
      cv.style.height = H + 'px';
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cw = w;
    }
    var cw = W;
    sizeCanvas();
    window.addEventListener('resize', function () { sizeCanvas(); schedule(); });

    function bounds() {
      var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      if (o.xRange) { xmin = o.xRange[0]; xmax = o.xRange[1]; }
      if (o.yRange) { ymin = o.yRange[0]; ymax = o.yRange[1]; }
      for (var i = 0; i < xs.length; i++) {
        if (!o.xRange && isFinite(xs[i])) {
          if (xs[i] < xmin) xmin = xs[i];
          if (xs[i] > xmax) xmax = xs[i];
        }
        if (!o.yRange) {
          for (var j = 0; j < series.length; j++) {
            var v = ys[i][j];
            if (typeof v !== 'number' || !isFinite(v)) continue;
            if (v < ymin) ymin = v;
            if (v > ymax) ymax = v;
          }
        }
      }
      // Два разных вырожденных случая: нет ни одной конечной точки (sentinel-ы
      // Infinity/-Infinity так и остались — их нельзя «раздвинуть» арифметикой,
      // Infinity - 1 всё ещё Infinity) и есть точки, но все равны (xmin === xmax).
      if (!isFinite(xmin) || !isFinite(xmax)) { xmin = 0; xmax = 1; }
      else if (xmin === xmax) { xmin = xmin - 1; xmax = xmax + 1; }
      if (!isFinite(ymin) || !isFinite(ymax)) { ymin = 0; ymax = 1; }
      else if (ymin === ymax) { var dy = Math.abs(ymin) * 0.1 || 1; ymin = ymin - dy; ymax = ymax + dy; }
      if (mode === 'bars' && !o.yRange) { if (ymin > 0) ymin = 0; if (ymax < 0) ymax = 0; }
      if (o.zero && !o.yRange) { if (ymin > 0) ymin = 0; if (ymax < 0) ymax = 0; }
      var pad = o.yRange ? 0 : (ymax - ymin) * 0.08;
      return { xmin: xmin, xmax: xmax, ymin: ymin - (mode === 'bars' && ymin === 0 ? 0 : pad), ymax: ymax + pad };
    }

    function visible() {
      if (document.hidden) return false;
      if (panelEl && panelEl.classList && panelEl.classList.contains('smh-collapsed')) return false;
      return cv.offsetParent !== null || (panelEl && panelEl.classList && panelEl.classList.contains('sim-sheet-open'));
    }

    function draw() {
      dirty = false;
      if (!visible()) { hiddenDirty = true; return; }
      hiddenDirty = false;
      var b = bounds();
      var Wd = cw, w = Wd - PL - PR, h = H - PT - PB;
      ctx.clearRect(0, 0, Wd, H);
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.lineWidth = 1;
      var X = function (x) { return PL + w * (x - b.xmin) / (b.xmax - b.xmin); };
      var Y = function (y) { return PT + h * (1 - (y - b.ymin) / (b.ymax - b.ymin)); };

      // Сетка и деления по «круглым» числам.
      var ys0 = nice(b.ymax - b.ymin, 4), yStart = Math.ceil(b.ymin / ys0) * ys0;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var gy = yStart; gy <= b.ymax + ys0 * 1e-6; gy += ys0) {
        var yy = Math.round(Y(gy)) + 0.5;
        ctx.strokeStyle = Math.abs(gy) < ys0 * 1e-6 ? 'rgba(160,175,200,.35)' : 'rgba(160,175,200,.1)';
        ctx.beginPath(); ctx.moveTo(PL, yy); ctx.lineTo(PL + w, yy); ctx.stroke();
        ctx.fillStyle = '#7d8899';
        ctx.fillText(tickFmt(gy, ys0), PL - 5, yy);
      }
      if (mode !== 'bars') {
        var xs0 = nice(b.xmax - b.xmin, Math.max(2, Math.floor(w / 70))), xStart = Math.ceil(b.xmin / xs0) * xs0;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (var gx = xStart; gx <= b.xmax + xs0 * 1e-6; gx += xs0) {
          var xx = Math.round(X(gx)) + 0.5;
          ctx.strokeStyle = Math.abs(gx) < xs0 * 1e-6 && mode !== 'time' ? 'rgba(160,175,200,.35)' : 'rgba(160,175,200,.07)';
          ctx.beginPath(); ctx.moveTo(xx, PT); ctx.lineTo(xx, PT + h); ctx.stroke();
          ctx.fillStyle = '#7d8899';
          ctx.fillText(tickFmt(gx, xs0), xx, PT + h + 5);
        }
      }
      ctx.fillStyle = '#9aa5b5';
      if (o.yLabel) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(o.yLabel, 4, 2); }
      if (o.xLabel && mode !== 'bars') {
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        var tw = ctx.measureText(o.xLabel).width;
        ctx.fillStyle = 'rgba(13,17,22,.85)';
        ctx.fillRect(PL + w - tw - 6, PT + h - 15, tw + 6, 14);
        ctx.fillStyle = '#9aa5b5';
        ctx.fillText(o.xLabel, PL + w - 2, PT + h - 2);
      }

      if (mode === 'bars') {
        var n = xs.length;
        if (n) {
          var bw = w / n;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          for (var bi = 0; bi < n; bi++) {
            for (var bs = 0; bs < series.length; bs++) {
              var v0 = ys[bi][bs];
              if (typeof v0 !== 'number' || !isFinite(v0)) continue;
              var y0 = Y(Math.max(b.ymin, 0)), y1 = Y(v0);
              var sw2 = (bw * 0.78) / series.length;
              ctx.fillStyle = series[bs].color;
              ctx.globalAlpha = 0.85;
              ctx.fillRect(PL + bi * bw + bw * 0.11 + bs * sw2, Math.min(y0, y1), Math.max(1, sw2 - 1), Math.max(1, Math.abs(y1 - y0)));
              ctx.globalAlpha = 1;
            }
            if (cats && n <= 16) { ctx.fillStyle = '#7d8899'; ctx.fillText(String(cats[bi]).slice(0, 8), PL + bi * bw + bw / 2, PT + h + 5); }
          }
        }
        return;
      }

      // Прореживание: точек больше, чем пикселей, — рисуем каждую k-ю (последняя всегда).
      var stride = Math.max(1, Math.floor(xs.length / (w * 1.5)));
      for (var si = series.length - 1; si >= 0; si--) {
        var col = series[si].color;
        ctx.strokeStyle = col;
        ctx.lineWidth = series[si].width || (si === 0 ? 2 : 1.6);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (series[si].dash) ctx.setLineDash([4, 4]); else ctx.setLineDash([]);
        ctx.beginPath();
        var started = false, firstX = 0, lastX = 0, lastY = 0, cnt = 0;
        for (var i2 = 0; i2 < xs.length; i2 += (i2 + stride < xs.length ? stride : 1)) {
          var v2 = ys[i2][si];
          if (typeof v2 !== 'number' || !isFinite(v2) || !isFinite(xs[i2])) { started = false; continue; }
          var px = X(xs[i2]), py = Y(v2);
          if (started) ctx.lineTo(px, py);
          else { ctx.moveTo(px, py); started = true; if (!cnt) firstX = px; }
          lastX = px; lastY = py; cnt++;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Мягкая заливка под главной кривой — график читается как «объём», а не как проволока.
        if (si === 0 && series.length <= 2 && mode !== 'xy' && cnt > 1 && o.fill !== false) {
          var base = Y(Math.max(b.ymin, Math.min(b.ymax, 0)));
          ctx.lineTo(lastX, base); ctx.lineTo(firstX, base); ctx.closePath();
          if (/^#[0-9a-f]{6}$/i.test(col)) {
            var g = ctx.createLinearGradient(0, PT, 0, PT + h);
            g.addColorStop(0, col + '38'); g.addColorStop(1, col + '00');
            ctx.fillStyle = g; ctx.fill();
          } else { ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; }
        }
        // Текущая точка: в time — у правого края со значением, в xy — рабочая точка цикла.
        if (cnt && mode !== 'curve') {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI * 2); ctx.fill();
          if (mode === 'xy') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2; ctx.stroke(); }
        }
      }
      // Маркер текущего положения на кривой (plot): точка и вертикальная направляющая.
      if (marker && isFinite(marker[0]) && isFinite(marker[1])) {
        var mx = X(marker[0]), my = Y(marker[1]);
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(mx, PT); ctx.lineTo(mx, PT + h); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = series[0].color; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    var hiddenDirty = false, marker = null;

    function schedule() {
      if (dirty) return;
      dirty = true;
      var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
      raf(draw);
    }
    // Свёрнутый или скрытый график не рисуется; при раскрытии дорисовываем один раз.
    setInterval(function () { if (hiddenDirty && visible()) schedule(); }, 400);

    draw();

    function push(x, vals) {
      // Модели путают API с chart.js: push(y) без x, push({x, y}), push([x, y]) — принимаем всё.
      if (vals === undefined && x && typeof x === 'object' && !Array.isArray(x)) { vals = x.y !== undefined ? x.y : x.value; x = x.x !== undefined ? x.x : x.t; }
      if (vals === undefined && Array.isArray(x)) { vals = x.slice(1); x = x[0]; }
      if (vals === undefined) { vals = x; x = xs.length ? xs[xs.length - 1] + 1 : 0; }
      if (arguments.length > 2) vals = Array.prototype.slice.call(arguments, 1);
      xs.push(Number(x));
      ys.push(vals && vals.slice ? vals.slice(0) : [vals]);
      if (xs.length > maxPoints) { xs.splice(0, xs.length - maxPoints); ys.splice(0, ys.length - maxPoints); }
      schedule();
    }
    /** Данные целиком: set(xs, ys) — ys массив значений (одна серия) или массив серий. Для bars xs — подписи. */
    function set(xa, ya) {
      if (ya === undefined && Array.isArray(xa)) { ya = xa; xa = null; }
      ya = ya || [];
      var multi = Array.isArray(ya[0]);
      var n = multi ? ya[0].length : ya.length;
      cats = null;
      if (xa && typeof xa[0] !== 'number') { cats = xa; xa = null; }
      xs = []; ys = [];
      for (var i = 0; i < n; i++) {
        xs.push(xa ? Number(xa[i]) : i);
        if (multi) { var row = []; for (var s = 0; s < ya.length; s++) row.push(ya[s][i]); ys.push(row); }
        else ys.push([ya[i]]);
      }
      schedule();
    }
    function clear() { xs = []; ys = []; schedule(); }
    function noop() {}
    var api = {
      push: push, set: set, clear: clear,
      setMarker: function (x, y) { marker = [x, y]; schedule(); },
      // Синонимы из чужих библиотек графиков: вызов не должен ронять симуляцию.
      pushData: push, addData: push, addPoint: push, add: push, append: push, addDataPoint: push, plot: push,
      setData: set, data: set, update: noop, render: noop, draw: noop, redraw: noop, resize: noop,
      reset: clear, clearData: clear,
      element: cv,
      // Внутренний тестовый шов (не документируется в UIKIT_DOC): текущий bounds().
      __bounds: function () { return bounds(); },
    };
    // Привязка: x — ключ времени или величины по оси x, y — ключ(и) величин; SimUI.run кормит сам.
    if (yKeys.length && (mode === 'time' || mode === 'xy')) {
      var xKey = o.x || 't', lastPush = -1;
      K.__bind({ widget: api, chart: true, stream: true, keys: (typeof xKey === 'string' ? [xKey] : []).concat(yKeys.filter(function (k) { return typeof k === 'string'; })),
        tick: function (oo, P, running) {
          if (!running) return;
          var t = (window.performance ? performance.now() : Date.now());
          if (t - lastPush < (o.every || 33)) return;
          lastPush = t;
          var xv = K.__resolve(xKey, oo, P), row = [];
          for (var k = 0; k < yKeys.length; k++) row.push(Number(K.__resolve(yKeys[k], oo, P)));
          if (xv === undefined) xv = oo && oo.t;
          push(Number(xv), row);
        } });
    } else if (o.data && mode !== 'time') {
      // bars/curve: data(o, P) -> {x: [...], y: [...]} или [ys]; пересчёт с троттлингом.
      var lastSet = -1;
      K.__bind({ widget: api, chart: true, keys: [], tick: function (oo, P) {
        var t = (window.performance ? performance.now() : Date.now());
        if (t - lastSet < (o.every || 100)) return;
        lastSet = t;
        var d = o.data(oo, P);
        if (!d) return;
        if (Array.isArray(d)) set(d); else set(d.x || d.labels || null, d.y || d.values || []);
      } });
    }
    return api;
  }

  /**
   * График функции: SimUI.plot({title, fn: function (x, P) {...}, x: [0, 10], marker: 'x'|fn,
   * series}) — кривая сама перестраивается, когда меняются параметры; marker — текущая точка.
   */
  function plot(o) {
    o = o || {};
    var fns = Array.isArray(o.fn) ? o.fn : [o.fn];
    var c = {};
    for (var k in o) c[k] = o[k];
    c.mode = 'curve';
    c.xRange = o.x || o.xRange || [0, 1];
    if (!c.series) { c.series = []; for (var i = 0; i < fns.length; i++) c.series.push({ name: '' }); }
    var ch = chart(c);
    var lastKey = '';
    function rebuild(P, force) {
      var key = JSON.stringify(P || {});
      if (key === lastKey && !force) return;
      lastKey = key;
      var N = o.samples || 160, a = c.xRange[0], b = c.xRange[1], xsArr = [], ysArr = [];
      for (var s = 0; s < fns.length; s++) ysArr.push([]);
      for (var j = 0; j <= N; j++) {
        var x = a + (b - a) * j / N;
        xsArr.push(x);
        for (var f = 0; f < fns.length; f++) {
          var y = NaN;
          try { y = Number(fns[f](x, P || {})); } catch (e) {}
          ysArr[f].push(isFinite(y) ? y : NaN);
        }
      }
      ch.set(xsArr, fns.length > 1 ? ysArr : ysArr[0]);
    }
    rebuild(K.__params || {}, true);
    K.__bind({ widget: ch, keys: [], tick: function (oo, P) {
      rebuild(P);
      if (o.marker) {
        var mx = typeof o.marker === 'function' ? o.marker(oo, P) : K.__resolve(o.marker, oo, P);
        if (Array.isArray(mx)) ch.setMarker(mx[0], mx[1]);
        else if (isFinite(mx)) { var my = NaN; try { my = fns[0](mx, P); } catch (e) {} ch.setMarker(mx, my); }
      }
    } });
    ch.refresh = function () { rebuild(K.__params || {}, true); };
    return ch;
  }

  K.chart = chart;
  K.plot = plot;
  K.PALETTE = PALETTE;
})();
`;

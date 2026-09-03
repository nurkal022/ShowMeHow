/**
 * SimUI.chart — живой график на собственном canvas: оси с подписями, сетка,
 * легенда, автомасштаб, кольцевой буфер точек. Заменяет chart.js: внешние
 * библиотеки графиков ненадёжны (UMD/module, ошибки загрузки), а нам нужен
 * предсказуемый рендер в headless-браузере.
 */
export const KIT_CHART_JS = `
(function () {
  var K = window.SimUI;

  function fmtNum(v) {
    var a = Math.abs(v);
    if (a >= 10000 || (a > 0 && a < 0.01)) return v.toExponential(1);
    return String(Math.round(v * 100) / 100);
  }

  function chart(o) {
    o = o || {};
    var series = o.series || [{ name: '', color: '#4f8ff7' }];
    var mode = o.mode === 'xy' ? 'xy' : 'time';
    var maxPoints = o.maxPoints || (mode === 'xy' ? 900 : 300);
    var W = o.width || 300, H = o.height || 170;
    var PL = 42, PR = 10, PT = 10, PB = 26;

    var body = K.panel({ title: o.title || 'График', corner: o.corner || 'br' });
    var cv = document.createElement('canvas');
    cv.className = 'sim-chart';
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    body.appendChild(cv);

    if (series.length > 1 || (series[0] && series[0].name)) {
      var leg = document.createElement('div');
      leg.className = 'sim-chart-legend';
      for (var li = 0; li < series.length; li++) {
        var sp = document.createElement('span');
        var sw = document.createElement('i');
        sw.style.background = series[li].color || '#4f8ff7';
        sp.appendChild(sw);
        sp.appendChild(document.createTextNode(series[li].name || ('ряд ' + (li + 1))));
        leg.appendChild(sp);
      }
      body.appendChild(leg);
    }

    var ctx = cv.getContext('2d');
    var xs = [], ys = [], dirty = false;

    function sizeCanvas() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();

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
      if (!isFinite(xmin) || !isFinite(xmax) || xmin === xmax) { xmin = xmin - 1; xmax = xmax + 1; }
      if (!isFinite(ymin) || !isFinite(ymax) || ymin === ymax) { ymin = ymin - 1; ymax = ymax + 1; }
      var pad = (ymax - ymin) * 0.08;
      return { xmin: xmin, xmax: xmax, ymin: ymin - pad, ymax: ymax + pad };
    }

    function draw() {
      dirty = false;
      var b = bounds();
      var w = W - PL - PR, h = H - PT - PB;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0d1116';
      ctx.fillRect(0, 0, W, H);

      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.lineWidth = 1;
      for (var g = 0; g <= 4; g++) {
        var yy = PT + h * g / 4;
        ctx.strokeStyle = '#2a3341';
        ctx.beginPath(); ctx.moveTo(PL, yy); ctx.lineTo(PL + w, yy); ctx.stroke();
        ctx.fillStyle = '#8b95a3';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(fmtNum(b.ymax - (b.ymax - b.ymin) * g / 4), PL - 4, yy);
      }
      ctx.fillStyle = '#8b95a3';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(fmtNum(b.xmin), PL, PT + h + 5);
      ctx.textAlign = 'right';
      ctx.fillText(fmtNum(b.xmax), PL + w, PT + h + 5);
      if (o.xLabel) {
        ctx.textAlign = 'center';
        ctx.fillText(o.xLabel, PL + w / 2, PT + h + 5);
      }
      if (o.yLabel) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(o.yLabel, 2, 0);
      }

      for (var si = 0; si < series.length; si++) {
        ctx.strokeStyle = series[si].color || '#4f8ff7';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        var started = false;
        for (var i2 = 0; i2 < xs.length; i2++) {
          var v2 = ys[i2][si];
          if (typeof v2 !== 'number' || !isFinite(v2) || !isFinite(xs[i2])) { started = false; continue; }
          var px = PL + w * (xs[i2] - b.xmin) / (b.xmax - b.xmin);
          var py = PT + h * (1 - (v2 - b.ymin) / (b.ymax - b.ymin));
          if (started) ctx.lineTo(px, py);
          else { ctx.moveTo(px, py); started = true; }
        }
        ctx.stroke();
      }

      // В режиме xy последняя точка — текущая рабочая точка цикла: помечаем её.
      if (mode === 'xy' && xs.length) {
        var lx = xs[xs.length - 1], ly = ys[ys.length - 1][0];
        if (isFinite(lx) && typeof ly === 'number' && isFinite(ly)) {
          ctx.fillStyle = '#e8ecf1';
          ctx.beginPath();
          ctx.arc(
            PL + w * (lx - b.xmin) / (b.xmax - b.xmin),
            PT + h * (1 - (ly - b.ymin) / (b.ymax - b.ymin)),
            3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function schedule() {
      if (dirty) return;
      dirty = true;
      var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
      raf(draw);
    }

    draw();

    return {
      push: function (x, vals) {
        xs.push(x);
        ys.push(vals && vals.slice ? vals.slice(0) : [vals]);
        if (xs.length > maxPoints) { xs.shift(); ys.shift(); }
        schedule();
      },
      clear: function () { xs = []; ys = []; schedule(); },
      element: cv,
    };
  }

  K.chart = chart;
})();
`;

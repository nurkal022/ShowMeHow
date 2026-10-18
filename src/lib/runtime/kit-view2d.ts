/**
 * Палитра и 2D-сцена в мировых координатах.
 *
 * SimUI.view2d({x: [-1, 5], y: [0, 7]}) — холст #scene на всё окно, ось y вверх, единицы
 * мира (метры, а не пиксели), масштаб с сохранением пропорций, плотность пикселей и
 * resize. Мир вписывается в СВОБОДНУЮ часть экрана: не под панель параметров, баннер
 * и док — главная композиционная ошибка самописных сцен («маятник под панелью»).
 *
 * Примитивы рисования (line, circle, ball, arrow, spring, text, field, fn…) дают
 * одинаково аккуратную картинку у любой модели: слабой модели остаётся сказать, ЧТО
 * нарисовать, а не высчитывать пиксели. Подписи формулами (tex) и кнопки на сцене —
 * HTML поверх холста в непосредственном режиме: вызвал в draw — видно, перестал — скрыто.
 */
export const KIT_VIEW2D_JS = `
(function () {
  var K = window.SimUI;
  var COLORS = {
    blue: '#5b9cff', orange: '#ffa94d', green: '#4ade80', red: '#f87171', purple: '#a78bfa',
    yellow: '#facc15', cyan: '#22d3ee', pink: '#f472b6', teal: '#2dd4bf', gray: '#8b95a3', grey: '#8b95a3',
    white: '#e8ecf1', black: '#0b0e13', text: '#e8ecf1', muted: '#8b95a3', grid: 'rgba(160,175,200,.10)',
    bg: '#0d1117', panel: '#1a2029', accent: '#5b9cff', hot: '#ff6b5b', cold: '#5bb8ff',
    'синий': '#5b9cff', 'оранжевый': '#ffa94d', 'зелёный': '#4ade80', 'зеленый': '#4ade80', 'красный': '#f87171',
    'фиолетовый': '#a78bfa', 'жёлтый': '#facc15', 'желтый': '#facc15', 'голубой': '#22d3ee', 'серый': '#8b95a3', 'белый': '#e8ecf1'
  };
  function color(c) {
    if (c == null || c === true) return COLORS.blue;
    if (typeof c === 'number') { var s = c.toString(16); while (s.length < 6) s = '0' + s; return '#' + s; }
    return COLORS[c] || COLORS[String(c).toLowerCase()] || c;
  }
  /** Цвет по значению 0..1: холодный → горячий (температура, давление, плотность). */
  function heat(k) {
    k = Math.max(0, Math.min(1, Number(k) || 0));
    var stops = [[0, 64, 140, 255], [0.35, 34, 211, 238], [0.6, 250, 204, 21], [0.8, 255, 140, 60], [1, 248, 72, 72]];
    for (var i = 1; i < stops.length; i++) {
      if (k <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i], t = (k - a[0]) / (b[0] - a[0]);
        return 'rgb(' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ',' + Math.round(a[3] + (b[3] - a[3]) * t) + ')';
      }
    }
    return 'rgb(248,72,72)';
  }
  /** Тот же цвет с прозрачностью. */
  function alpha(c, a) {
    c = color(c);
    if (/^#[0-9a-f]{6}$/i.test(c)) {
      return 'rgba(' + parseInt(c.slice(1, 3), 16) + ',' + parseInt(c.slice(3, 5), 16) + ',' + parseInt(c.slice(5, 7), 16) + ',' + a + ')';
    }
    return c;
  }
  K.COLORS = COLORS;
  K.color = color;
  K.heat = heat;
  K.alpha = alpha;

  /**
   * Отступы под интерфейс кита: панель параметров справа, баннер сверху, док и кнопки
   * действий снизу, угловые панели слева (если не заняли треть экрана).
   */
  function insets() {
    var W = innerWidth, H = innerHeight, r = { l: 0, r: 0, t: 0, b: 0 };
    function rect(sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      var b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 ? b : null;
    }
    var mobile = K.__isMobile && K.__isMobile();
    if (!mobile) {
      // Свёрнутая в табличку панель сцену не закрывает — под неё место не берём.
      var pe = document.querySelector('.sim-panel');
      var p = pe && !pe.classList.contains('smh-collapsed') ? rect('.sim-panel') : null;
      if (p && p.left > W * 0.45 && p.top < H * 0.5) r.r = W - p.left + 8;
      var left = 0, cs2 = document.querySelectorAll('.sim-corner-tl, .sim-corner-bl');
      for (var i = 0; i < cs2.length; i++) {
        // Угол, где все панели свёрнуты в таблички, тоже не в счёт.
        if (!cs2[i].querySelector('.sim-side-panel:not(.smh-collapsed)')) continue;
        var b = cs2[i].getBoundingClientRect();
        if (b.width > 0 && b.height > 0 && b.right > left) left = b.right;
      }
      // Левые панели сворачиваются и не закрывают середину высоты: сдвигаем сцену на половину
      // их ширины — объект не уходит под формулу, но и не мельчает вдвое.
      if (left > 0 && left < W * 0.35) r.l = Math.round(left / 2);
    }
    var bn = rect('.sim-banner') || rect('.sim-phase-caption');
    if (bn && bn.top < H * 0.25) r.t = bn.bottom + 6;
    var pb = rect('.sim-phase-bar');
    if (pb && pb.top > H * 0.6) r.b = Math.max(r.b, H - pb.top + 6);
    var dock = rect('.sim-dock');
    if (dock && dock.top > H * 0.6) r.b = H - dock.top + 6;
    var act = rect('.sim-actions');
    if (act && act.top > H * 0.6) r.b = Math.max(r.b, H - act.top + 6);
    return r;
  }
  K.__insets = insets;

  function nice(span, n) {
    var raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }

  function view2d(o) {
    o = o || {};
    var canvas = typeof o.canvas === 'object' && o.canvas ? o.canvas : document.getElementById(o.canvas || 'scene');
    if (!canvas || canvas.tagName !== 'CANVAS') {
      canvas = document.createElement('canvas'); canvas.id = 'scene';
      document.body.insertBefore(canvas, document.body.firstChild);
    }
    canvas.style.position = 'fixed'; canvas.style.left = '0'; canvas.style.top = '0';
    canvas.style.display = 'block'; canvas.style.touchAction = 'none';
    var ctx = canvas.getContext('2d');
    var world = { x0: -1, x1: 1, y0: -1, y1: 1 };
    function setWorld(w) {
      w = w || {};
      var x = w.x || (w.xmin != null ? [w.xmin, w.xmax] : null) || (w.width ? [-w.width / 2, w.width / 2] : null);
      var y = w.y || (w.ymin != null ? [w.ymin, w.ymax] : null) || (w.height ? [-w.height / 2, w.height / 2] : null);
      if (x) { world.x0 = Number(x[0]); world.x1 = Number(x[1]); }
      if (y) { world.y0 = Number(y[0]); world.y1 = Number(y[1]); }
      if (!(world.x1 > world.x0)) { world.x0 = -1; world.x1 = 1; }
      if (!(world.y1 > world.y0)) { world.y0 = -1; world.y1 = 1; }
    }
    setWorld(o);
    var pad = o.pad == null ? 24 : o.pad;
    var area = o.area ? { x0: o.area[0] != null ? o.area[0] : o.area.x0, x1: o.area[1] != null ? o.area[1] : o.area.x1, y0: o.area.y0 || 0, y1: o.area.y1 == null ? 1 : o.area.y1 } : null;
    var v = { canvas: canvas, ctx: ctx, scale: 1, width: 0, height: 0 };
    var ox = 0, oy = 0, dpr = 1, ins = { l: 0, r: 0, t: 0, b: 0 };
    var fitted = false, vig = null;

    function fit(w) {
      if (w) { setWorld(w); target = null; }
      var W = innerWidth, H = innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      }
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ins = o.fullscreen ? { l: 0, r: 0, t: 0, b: 0 } : insets();
      transform();
    }
    /** Пересчёт масштаба и сдвига без обращения к DOM: для плавного зума каждый кадр. */
    function transform() {
      var W = innerWidth, H = innerHeight;
      // Свободная часть экрана; у вида с area — его доля (две сцены на одном холсте: процесс и фазовая плоскость).
      var fx0 = ins.l, fy0 = ins.t, fw = Math.max(80, W - ins.l - ins.r), fh = Math.max(80, H - ins.t - ins.b);
      var ar = area || { x0: 0, x1: 1, y0: 0, y1: 1 };
      var rx = fx0 + fw * ar.x0, ry = fy0 + fh * ar.y0, rw = fw * (ar.x1 - ar.x0), rh = fh * (ar.y1 - ar.y0);
      v.rect0 = { x: rx, y: ry, w: rw, h: rh };
      var aw = Math.max(60, rw - 2 * pad), ah = Math.max(60, rh - 2 * pad);
      var sx = aw / (world.x1 - world.x0), sy = ah / (world.y1 - world.y0);
      v.scale = o.stretch ? sx : Math.min(sx, sy);
      v.scaleY = o.stretch ? sy : v.scale;
      var cx = rx + rw / 2, cy = ry + rh / 2;
      ox = cx - v.scale * (world.x0 + world.x1) / 2;
      oy = cy + v.scaleY * (world.y0 + world.y1) / 2;
      v.width = W; v.height = H;
      // Видимые границы мира (шире заданных, если экран другой пропорции); у вида с area — в его доле.
      var L = area ? rx : 0, R = area ? rx + rw : W, T = area ? ry : 0, B = area ? ry + rh : H;
      var b = { x0: (L - ox) / v.scale, x1: (R - ox) / v.scale, y0: (oy - B) / v.scaleY, y1: (oy - T) / v.scaleY };
      // Синонимы: модели пишут и bounds.x[0], и bounds.xmin, и view.x[0].
      b.x = [b.x0, b.x1]; b.y = [b.y0, b.y1]; b.xmin = b.x0; b.xmax = b.x1; b.ymin = b.y0; b.ymax = b.y1;
      b.width = b.x1 - b.x0; b.height = b.y1 - b.y0;
      // visible — всё, что видно (шире области при другой пропорции экрана): для сетки и полей.
      // bounds — заданная область мира: модели подгоняют её под себя, и «видимое» в ответ
      // раздувало бы область без конца (зум улетал в 1e25).
      v.visible = b;
      var wb = { x0: world.x0, x1: world.x1, y0: world.y0, y1: world.y1 };
      wb.x = [wb.x0, wb.x1]; wb.y = [wb.y0, wb.y1]; wb.xmin = wb.x0; wb.xmax = wb.x1; wb.ymin = wb.y0; wb.ymax = wb.y1;
      wb.width = wb.x1 - wb.x0; wb.height = wb.y1 - wb.y0;
      v.bounds = wb;
      v.x = [world.x0, world.x1]; v.y = [world.y0, world.y1];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function X(x) { return ox + x * v.scale; }
    function Y(y) { return oy - y * v.scaleY; }
    v.toPx = function (x, y) { return [X(x), Y(y)]; };
    v.toWorld = function (px, py) { return [(px - ox) / v.scale, (oy - py) / v.scaleY]; };
    v.px = function (len) { return len * v.scale; };
    v.world = function (px) { return px / v.scale; };
    v.fit = fit;
    v.resize = fit;
    /**
     * Новая видимая область мира, с плавным переходом: v.setWorld({x: [-L, L], y: [-L, 0.5]}).
     * Удобно, когда размеры объекта зависят от параметров: длина нити, дальность полёта.
     */
    var target = null;
    v.setWorld = function (w, so) {
      var save = { x0: world.x0, x1: world.x1, y0: world.y0, y1: world.y1 };
      setWorld(w);
      var nt = { x0: world.x0, x1: world.x1, y0: world.y0, y1: world.y1 };
      if (!fitted || (so && so.snap)) { target = null; transform(); return v; }
      world.x0 = save.x0; world.x1 = save.x1; world.y0 = save.y0; world.y1 = save.y1;
      // Мёртвая зона: зум каждый кадр «по чуть-чуть» (модель подгоняет область под view.bounds)
      // иначе никогда не успокаивается — картинка дрожит даже на паузе.
      var ref = target || save, sx = Math.max(1e-9, ref.x1 - ref.x0), sy = Math.max(1e-9, ref.y1 - ref.y0);
      if (Math.abs(nt.x0 - ref.x0) < sx * 0.01 && Math.abs(nt.x1 - ref.x1) < sx * 0.01 &&
          Math.abs(nt.y0 - ref.y0) < sy * 0.01 && Math.abs(nt.y1 - ref.y1) < sy * 0.01) return v;
      target = nt;
      return v;
    };
    /** Камера следит за точкой: если она выходит из средней части кадра, область мира сдвигается. */
    v.follow = function (x, y, so) {
      so = so || {};
      var m = so.margin == null ? 0.2 : so.margin, cur = target || world;
      var w = cur.x1 - cur.x0, h = cur.y1 - cur.y0, dx = 0, dy = 0;
      if (x < cur.x0 + w * m) dx = x - (cur.x0 + w * m); else if (x > cur.x1 - w * m) dx = x - (cur.x1 - w * m);
      if (so.y !== false) { if (y < cur.y0 + h * m) dy = y - (cur.y0 + h * m); else if (y > cur.y1 - h * m) dy = y - (cur.y1 - h * m); }
      if (dx || dy) v.setWorld({ x: [cur.x0 + dx, cur.x1 + dx], y: [cur.y0 + dy, cur.y1 + dy] });
      return v;
    };
    function ease() {
      if (!target) return;
      var k = 0.18, done = true;
      ['x0', 'x1', 'y0', 'y1'].forEach(function (key) {
        var d = target[key] - world[key];
        if (Math.abs(d) > 1e-4 * Math.max(1, Math.abs(target[key]))) { world[key] += d * k; done = false; } else world[key] = target[key];
      });
      if (done) target = null;
      transform();
    }

    function st(s) {
      if (s == null) return {};
      if (typeof s === 'string' || typeof s === 'number') return { color: s };
      return s;
    }
    function stroke(s, defW) {
      ctx.strokeStyle = color(s.color || s.stroke);
      ctx.lineWidth = s.width || defW || 2;
      ctx.setLineDash(s.dash ? (s.dash === true ? [6, 5] : s.dash) : []);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }
    // save/restore — дорогая пара (тысячи точек сетки съедали на ней секунды): сохраняем
    // состояние, только когда примитив его действительно меняет (прозрачность, свечение, поворот).
    var saved = [];
    function begin(s, force) {
      var need = !!(force || s.alpha != null || s.glow);
      saved.push(need);
      if (!need) return;
      ctx.save();
      if (s.alpha != null) ctx.globalAlpha = s.alpha;
      if (s.glow) { ctx.shadowColor = color(s.glow === true ? (s.color || s.fill) : s.glow); ctx.shadowBlur = s.glowSize || 14; }
    }
    function end() { if (saved.pop()) ctx.restore(); else ctx.setLineDash([]); }

    // ---------- Кадр ----------
    var overlay = null, tags = {}, frameNo = 0;
    v.clear = function (bg) {
      // Первый кадр идёт после всего кода страницы: панели кита уже стоят, вписываем мир под них.
      if (!fitted) { fitted = true; fit(); }
      ease();
      frameNo++;
      sweep();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Два вида на одном холсте: каждый рисует только в своей доле (клип до следующего clear).
      if (canvas.__smhClip) { canvas.__smhClip = false; ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
      var b = bg || o.background || o.bg;
      if (area) {
        var r0 = v.rect0;
        ctx.save(); ctx.beginPath(); ctx.rect(r0.x, r0.y, r0.w, r0.h); ctx.clip(); canvas.__smhClip = true;
        if (b === false) ctx.clearRect(r0.x, r0.y, r0.w, r0.h);
        else {
          ctx.fillStyle = color(b || 'bg'); ctx.fillRect(r0.x, r0.y, r0.w, r0.h);
          ctx.strokeStyle = 'rgba(148,163,184,.14)'; ctx.lineWidth = 1; ctx.strokeRect(r0.x + 4.5, r0.y + 4.5, r0.w - 9, r0.h - 9);
        }
        if (o.grid) v.grid(o.grid === true ? null : o.grid);
        if (o.axes) v.axes(typeof o.axes === 'object' ? o.axes : {});
        return v;
      }
      if (b === false) ctx.clearRect(0, 0, v.width, v.height);
      else {
        if (b) { ctx.fillStyle = color(b); ctx.fillRect(0, 0, v.width, v.height); }
        if (!b) { // лёгкая виньетка: сцена читается глубже, чем плоская заливка; рисуется один раз на размер
          if (!vig || vig.width !== canvas.width || vig.height !== canvas.height) {
            vig = document.createElement('canvas'); vig.width = canvas.width; vig.height = canvas.height;
            var vc = vig.getContext('2d'), VW = vig.width, VH = vig.height;
            var g = vc.createRadialGradient(VW / 2, VH * 0.45, Math.min(VW, VH) * 0.2, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
            g.addColorStop(0, 'rgba(40,60,90,.18)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
            vc.fillStyle = color('bg'); vc.fillRect(0, 0, VW, VH);
            vc.fillStyle = g; vc.fillRect(0, 0, VW, VH);
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(vig, 0, 0);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
      if (o.grid) v.grid(o.grid === true ? null : o.grid);
      if (o.axes) v.axes(typeof o.axes === 'object' ? o.axes : {});
      return v;
    };
    v.grid = function (step, s) {
      s = st(s);
      var bd = v.visible;
      var stp = Number(step) || nice(bd.x1 - bd.x0, 12);
      ctx.save();
      ctx.lineWidth = 1;
      for (var pass = 0; pass < 2; pass++) {
        var sp = pass === 0 ? stp / 5 : stp;
        if (pass === 0 && v.px(sp) < 9) continue;
        ctx.strokeStyle = pass === 0 ? 'rgba(160,175,200,.045)' : color(s.color || 'grid');
        ctx.beginPath();
        for (var x = Math.ceil(bd.x0 / sp) * sp; x <= bd.x1; x += sp) { var px = Math.round(X(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, v.height); }
        for (var y = Math.ceil(bd.y0 / sp) * sp; y <= bd.y1; y += sp) { var py = Math.round(Y(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(v.width, py); }
        ctx.stroke();
      }
      ctx.restore();
      return v;
    };
    v.axes = function (a) {
      a = a || {};
      var bd = v.visible;
      ctx.save();
      ctx.strokeStyle = 'rgba(200,210,225,.45)'; ctx.fillStyle = '#8b95a3'; ctx.lineWidth = 1.2;
      ctx.font = '11px system-ui, sans-serif';
      var y0 = Math.min(Math.max(0, bd.y0), bd.y1), x0 = Math.min(Math.max(0, bd.x0), bd.x1);
      ctx.beginPath(); ctx.moveTo(X(world.x0), Y(y0)); ctx.lineTo(X(world.x1), Y(y0)); ctx.moveTo(X(x0), Y(world.y0)); ctx.lineTo(X(x0), Y(world.y1)); ctx.stroke();
      var sx = a.step || nice(world.x1 - world.x0, 8), sy = a.stepY || a.step || nice(world.y1 - world.y0, 6);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (var x = Math.ceil(world.x0 / sx) * sx; x <= world.x1 + 1e-9; x += sx) {
        if (Math.abs(x) < sx * 1e-6) continue;
        ctx.beginPath(); ctx.moveTo(X(x), Y(y0) - 3); ctx.lineTo(X(x), Y(y0) + 3); ctx.stroke();
        ctx.fillText(+x.toFixed(6) + '', X(x), Y(y0) + 5);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var y = Math.ceil(world.y0 / sy) * sy; y <= world.y1 + 1e-9; y += sy) {
        if (Math.abs(y) < sy * 1e-6) continue;
        ctx.beginPath(); ctx.moveTo(X(x0) - 3, Y(y)); ctx.lineTo(X(x0) + 3, Y(y)); ctx.stroke();
        ctx.fillText(+y.toFixed(6) + '', X(x0) - 6, Y(y));
      }
      ctx.fillStyle = '#c5cdd8';
      if (a.x) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(a.x, X(world.x1), Y(y0) - 6); }
      if (a.y) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(a.y, X(x0) + 6, Y(world.y1)); }
      ctx.restore();
      return v;
    };

    // ---------- Примитивы ----------
    v.line = function (x1, y1, x2, y2, s) {
      s = st(s); begin(s); stroke(s);
      ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke();
      end(); return v;
    };
    function pts(list) {
      var out = [];
      for (var i = 0; i < (list || []).length; i++) {
        var p = list[i];
        if (Array.isArray(p)) out.push([p[0], p[1]]); else if (p) out.push([p.x, p.y]);
      }
      return out;
    }
    v.path = function (list, s) {
      s = st(s);
      var p = pts(list);
      if (p.length < 2) return v;
      begin(s);
      ctx.beginPath(); ctx.moveTo(X(p[0][0]), Y(p[0][1]));
      for (var i = 1; i < p.length; i++) ctx.lineTo(X(p[i][0]), Y(p[i][1]));
      if (s.close || s.fill) ctx.closePath();
      if (s.fill) { ctx.fillStyle = color(s.fill === true ? s.color : s.fill); ctx.fill(); }
      if (!s.fill || s.color || s.stroke) { stroke(s); ctx.stroke(); }
      end(); return v;
    };
    v.polygon = function (list, s) { s = st(s); if (s.fill == null && s.stroke == null) s.fill = s.color || true; s.close = true; return v.path(list, s); };
    v.circle = function (x, y, r, s) {
      s = st(s); begin(s);
      var R = s.px ? r : Math.abs(r * v.scale);
      ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(0.5, R), 0, Math.PI * 2);
      var filled = s.fill !== false && (s.fill || !s.stroke);
      if (filled) { ctx.fillStyle = color(s.fill && s.fill !== true ? s.fill : s.color); ctx.fill(); }
      if (s.stroke || s.fill === false) { if (s.glow) ctx.shadowBlur = 0; stroke({ color: s.stroke && s.stroke !== true ? s.stroke : s.color, width: s.width, dash: s.dash }); ctx.stroke(); }
      end(); return v;
    };
    /** Объёмный шар: радиальный градиент с бликом. Частицы, планеты, грузы. */
    v.ball = function (x, y, r, c, s) {
      if (c && typeof c === 'object') { s = c; c = null; }
      s = st(s); c = color(c || s.color);
      if (s.label) textPx(X(x), Y(y) + (s.px ? r : Math.abs(r * v.scale)) + 12, String(s.label), { size: 12, color: s.color || 'text' });
      var R = s.px ? r : Math.abs(r * v.scale), px = X(x), py = Y(y);
      if (R < 2.5) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, Math.max(1, R), 0, Math.PI * 2); ctx.fill(); return v; }
      begin(s);
      var g = ctx.createRadialGradient(px - R * 0.35, py - R * 0.4, R * 0.1, px, py, R);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.18, c); g.addColorStop(1, shade(c));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
      end(); return v;
    };
    function shade(c) {
      if (!/^#[0-9a-f]{6}$/i.test(c)) return c;
      var r = parseInt(c.slice(1, 3), 16) * 0.45, g = parseInt(c.slice(3, 5), 16) * 0.45, b = parseInt(c.slice(5, 7), 16) * 0.45;
      return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
    }
    v.dot = function (x, y, s) {
      s = st(s); begin(s);
      ctx.fillStyle = color(s.color); ctx.beginPath(); ctx.arc(X(x), Y(y), s.r || s.size || 4, 0, Math.PI * 2); ctx.fill();
      end(); return v;
    };
    /** Точки массивом [[x, y], …] одним проходом — сотни частиц без потерь кадра. */
    v.dots = function (list, s) {
      s = st(s);
      var r = s.r || s.size || 3, c = s.color;
      ctx.save(); if (s.alpha != null) ctx.globalAlpha = s.alpha;
      var p = pts(list);
      if (typeof c === 'function') {
        for (var i = 0; i < p.length; i++) { ctx.fillStyle = color(c(list[i], i)); ctx.beginPath(); ctx.arc(X(p[i][0]), Y(p[i][1]), r, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.fillStyle = color(c); ctx.beginPath();
        for (var j = 0; j < p.length; j++) { var px = X(p[j][0]), py = Y(p[j][1]); ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, Math.PI * 2); }
        ctx.fill();
      }
      ctx.restore(); return v;
    };
    v.rect = function (x, y, w, h, s) {
      s = st(s); begin(s);
      var px = X(x), py = Y(y + h), pw = w * v.scale, ph = h * v.scaleY;
      var rr = s.radius ? Math.min(s.radius, Math.abs(pw) / 2, Math.abs(ph) / 2) : 0;
      ctx.beginPath();
      if (rr && ctx.roundRect) ctx.roundRect(px, py, pw, ph, rr); else ctx.rect(px, py, pw, ph);
      var filled = s.fill !== false && (s.fill || !s.stroke);
      if (filled) { ctx.fillStyle = color(s.fill && s.fill !== true ? s.fill : s.color); ctx.fill(); }
      if (s.stroke) { stroke({ color: s.stroke === true ? s.color : s.stroke, width: s.width }); ctx.stroke(); }
      end(); return v;
    };
    /** Прямоугольник по центру с поворотом (радианы): брусок на наклонной, поршень, тележка. */
    v.box = function (cx, cy, w, h, angle, s) {
      if (typeof angle === 'object' || typeof angle === 'string') { s = angle; angle = 0; }
      s = st(s); begin(s, true);
      ctx.translate(X(cx), Y(cy)); ctx.rotate(-(angle || 0));
      var pw = w * v.scale, ph = h * v.scaleY, rr = s.radius == null ? 3 : s.radius;
      ctx.beginPath();
      if (rr && ctx.roundRect) ctx.roundRect(-pw / 2, -ph / 2, pw, ph, Math.min(rr, pw / 2, ph / 2)); else ctx.rect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = color(s.fill && s.fill !== true ? s.fill : s.color); if (s.fill !== false) ctx.fill();
      if (s.stroke) { stroke({ color: s.stroke === true ? s.color : s.stroke, width: s.width || 1.5 }); ctx.stroke(); }
      if (s.label) { ctx.fillStyle = '#0b0e13'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.label, 0, 0); }
      end(); return v;
    };
    v.arrow = function (x1, y1, x2, y2, s) {
      s = st(s);
      var a = X(x1), b = Y(y1), c = X(x2), d = Y(y2), len = Math.sqrt((c - a) * (c - a) + (d - b) * (d - b));
      if (!(len > 0.5) || !isFinite(len)) return v;
      begin(s); stroke(s, 2.5);
      var head = Math.min(s.head || 11, len * 0.45), ang = Math.atan2(d - b, c - a);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c - Math.cos(ang) * head * 0.7, d - Math.sin(ang) * head * 0.7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color(s.color);
      ctx.beginPath(); ctx.moveTo(c, d);
      ctx.lineTo(c - head * Math.cos(ang - 0.42), d - head * Math.sin(ang - 0.42));
      ctx.lineTo(c - head * Math.cos(ang + 0.42), d - head * Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fill();
      end();
      if (s.label) textPx(c + Math.cos(ang) * 10, d + Math.sin(ang) * 10, s.label, { color: s.color, size: 13, bold: true, align: Math.cos(ang) < -0.3 ? 'right' : Math.cos(ang) > 0.3 ? 'left' : 'center', base: Math.sin(ang) > 0.3 ? 'top' : Math.sin(ang) < -0.3 ? 'bottom' : 'middle' });
      return v;
    };
    /** Вектор из точки: сила, скорость, поле. scale — множитель длины в единицах мира. */
    v.vector = function (x, y, vx, vy, s) {
      s = st(s);
      var k = s.scale == null ? 1 : s.scale;
      return v.arrow(x, y, x + vx * k, y + vy * k, s);
    };
    v.spring = function (x1, y1, x2, y2, s) {
      s = st(s);
      var a = X(x1), b = Y(y1), c = X(x2), d = Y(y2), len = Math.sqrt((c - a) * (c - a) + (d - b) * (d - b));
      if (!(len > 1) || !isFinite(len)) return v;
      var n = s.coils || 12, amp = s.amp != null ? s.amp * v.scale : Math.max(5, Math.min(14, len / n)), ux = (c - a) / len, uy = (d - b) / len;
      begin(s); stroke(s, 2);
      var lead = Math.min(12, len * 0.1);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + ux * lead, b + uy * lead);
      for (var i = 0; i <= n * 2; i++) {
        var t = lead + (len - 2 * lead) * i / (n * 2), sgn = i === 0 || i === n * 2 ? 0 : (i % 2 ? 1 : -1);
        ctx.lineTo(a + ux * t - uy * amp * sgn, b + uy * t + ux * amp * sgn);
      }
      ctx.lineTo(c, d); ctx.stroke();
      end(); return v;
    };
    function textPx(px, py, str, s) {
      s = st(s);
      str = K.uni(str);
      ctx.save();
      var size = s.size || 13;
      ctx.font = (s.bold ? '600 ' : '') + size + 'px ' + (s.font || 'system-ui, -apple-system, sans-serif');
      ctx.textAlign = s.align || 'center';
      ctx.textBaseline = s.base || 'middle';
      px += s.dx || 0; py += s.dy || 0;
      if (s.bg) {
        var w = ctx.measureText(str).width, hh = size + 8, x0 = ctx.textAlign === 'center' ? px - w / 2 - 6 : ctx.textAlign === 'right' ? px - w - 6 : px - 6;
        var y0 = ctx.textBaseline === 'middle' ? py - hh / 2 : ctx.textBaseline === 'top' ? py - 4 : py - hh + 4;
        ctx.fillStyle = s.bg === true ? 'rgba(18,23,31,.88)' : color(s.bg);
        ctx.strokeStyle = alpha(s.color || 'white', 0.35);
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w + 12, hh, 7); else ctx.rect(x0, y0, w + 12, hh);
        ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
      } else if (s.outline !== false) {
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(13,17,23,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(str, px, py);
      }
      ctx.fillStyle = color(s.color || 'text');
      ctx.fillText(str, px, py);
      ctx.restore();
    }
    v.text = function (x, y, str, s) { textPx(X(x), Y(y), String(str), s); return v; };
    v.label = function (x, y, str, s) { s = st(s); if (s.bg == null) s.bg = true; textPx(X(x), Y(y), String(str), s); return v; };
    /** Дуга угла с подписью: a0, a1 — радианы от оси x против часовой. */
    v.angle = function (cx, cy, r, a0, a1, s) {
      s = st(s); begin(s); stroke(s, 1.5);
      var R = s.px ? r : r * v.scale;
      ctx.beginPath(); ctx.arc(X(cx), Y(cy), R, -a0, -a1, a1 > a0); ctx.stroke();
      end();
      if (s.label) { var m = (a0 + a1) / 2; textPx(X(cx) + Math.cos(m) * (R + 12), Y(cy) - Math.sin(m) * (R + 12), s.label, { color: s.color, size: 12 }); }
      return v;
    };
    /** Земля/пол: линия и штриховка снизу. */
    v.ground = function (y, s) {
      s = st(s);
      var py = Y(y == null ? 0 : y);
      ctx.save();
      ctx.fillStyle = 'rgba(120,135,160,.10)'; ctx.fillRect(0, py, v.width, v.height - py);
      ctx.strokeStyle = color(s.color || 'rgba(170,185,210,.6)'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(v.width, py); ctx.stroke();
      ctx.strokeStyle = 'rgba(170,185,210,.18)'; ctx.lineWidth = 1; ctx.beginPath();
      for (var x = -20; x < v.width + 20; x += 14) { ctx.moveTo(x, py + 14); ctx.lineTo(x + 14, py); }
      ctx.stroke();
      ctx.restore(); return v;
    };
    /** Подвес/стена: штрихованная планка от (x1, y) до (x2, y). */
    v.support = function (x1, y, x2, s) {
      s = st(s);
      var a = X(x1), c = X(x2), py = Y(y);
      ctx.save(); ctx.strokeStyle = color(s.color || 'rgba(170,185,210,.7)'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a, py); ctx.lineTo(c, py); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,185,210,.35)'; ctx.beginPath();
      for (var x = a; x < c; x += 8) { ctx.moveTo(x, py); ctx.lineTo(x + 8, py - 8); }
      ctx.stroke(); ctx.restore(); return v;
    };
    /** График функции прямо в сцене: профиль волны y(x), потенциал, траектория. */
    v.fn = function (f, s) {
      s = st(s);
      var bd = v.visible, a = s.from != null ? s.from : (s.x ? s.x[0] : bd.x0), b = s.to != null ? s.to : (s.x ? s.x[1] : bd.x1);
      var n = s.samples || Math.min(800, Math.max(50, Math.round((b - a) * v.scale / 3)));
      var list = [];
      for (var i = 0; i <= n; i++) { var x = a + (b - a) * i / n, y = Number(f(x)); if (isFinite(y)) list.push([x, y]); else if (list.length) { v.path(list, s); list = []; } }
      if (list.length > 1) v.path(list, s);
      return v;
    };
    /** Векторное поле стрелками по сетке: f(x, y) -> [fx, fy]. Длина нормируется, цвет — по модулю. */
    v.field = function (f, s) {
      s = st(s);
      var bd = v.visible, step = s.step || nice(bd.x1 - bd.x0, 18), cells = [], max = 0;
      for (var x = Math.ceil(bd.x0 / step) * step; x <= bd.x1; x += step) {
        for (var y = Math.ceil(bd.y0 / step) * step; y <= bd.y1; y += step) {
          var e = f(x, y); if (!e) continue;
          var fx = Number(e[0] != null ? e[0] : e.x), fy = Number(e[1] != null ? e[1] : e.y), m = Math.sqrt(fx * fx + fy * fy);
          if (!isFinite(m) || m === 0) continue;
          cells.push([x, y, fx / m, fy / m, m]); if (m > max) max = m;
        }
      }
      var L = step * 0.42;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i], k = Math.pow(c[4] / max, 0.35);
        v.arrow(c[0] - c[2] * L, c[1] - c[3] * L, c[0] + c[2] * L, c[1] + c[3] * L,
          { color: s.color || heat(k * 0.85), width: 1.4, head: 6, alpha: 0.35 + 0.6 * k });
      }
      return v;
    };
    /**
     * Тепловая карта: значения на сетке (массив строк или функция f(x, y)) цветом.
     * Теплопроводность, диффузия, потенциал, клеточные автоматы. Рисуется через ImageData —
     * десятки тысяч ячеек без потерь кадра. s: {x: [a, b], y: [c, d], min, max, color: fn(k) -> css, smooth, alpha}.
     */
    var hmCanvas = null, hmCtx = null;
    v.heatmap = function (data, s) {
      s = st(s);
      var bd = v.visible, xr = s.x || [bd.x0, bd.x1], yr = s.y || [bd.y0, bd.y1];
      var grid = data, nx, ny, i, j;
      if (typeof data === 'function') {
        nx = s.nx || 120; ny = s.ny || Math.max(2, Math.round(nx * (yr[1] - yr[0]) / (xr[1] - xr[0])));
        grid = [];
        for (j = 0; j < ny; j++) {
          var row = [], yy = yr[1] - (yr[1] - yr[0]) * (j + 0.5) / ny;
          for (i = 0; i < nx; i++) row.push(Number(data(xr[0] + (xr[1] - xr[0]) * (i + 0.5) / nx, yy)));
          grid.push(row);
        }
      }
      ny = grid.length; nx = ny ? grid[0].length : 0;
      if (!nx || !ny) return v;
      var lo = s.min, hi = s.max;
      if (lo == null || hi == null) {
        var a = Infinity, b = -Infinity;
        for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { var q = grid[j][i]; if (isFinite(q)) { if (q < a) a = q; if (q > b) b = q; } }
        if (lo == null) lo = a; if (hi == null) hi = b;
      }
      if (!(hi > lo)) hi = lo + 1;
      if (!hmCanvas) { hmCanvas = document.createElement('canvas'); hmCtx = hmCanvas.getContext('2d'); }
      if (hmCanvas.width !== nx || hmCanvas.height !== ny) { hmCanvas.width = nx; hmCanvas.height = ny; }
      var img = hmCtx.createImageData(nx, ny), d = img.data, cf = s.color || heat, cache = {};
      var probe = document.createElement('canvas').getContext('2d');
      function rgb(c) {
        if (cache[c]) return cache[c];
        var m = /^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(c);
        if (m) return (cache[c] = [+m[1], +m[2], +m[3]]);
        probe.fillStyle = color(c); probe.fillRect(0, 0, 1, 1);
        var p = probe.getImageData(0, 0, 1, 1).data;
        return (cache[c] = [p[0], p[1], p[2]]);
      }
      for (j = 0; j < ny; j++) {
        for (i = 0; i < nx; i++) {
          var val = grid[j][i], k = (val - lo) / (hi - lo), o4 = (j * nx + i) * 4;
          if (!isFinite(val)) { d[o4 + 3] = 0; continue; }
          var c = rgb(cf(Math.max(0, Math.min(1, k)), val));
          d[o4] = c[0]; d[o4 + 1] = c[1]; d[o4 + 2] = c[2]; d[o4 + 3] = 255;
        }
      }
      hmCtx.putImageData(img, 0, 0);
      ctx.save();
      if (s.alpha != null) ctx.globalAlpha = s.alpha;
      ctx.imageSmoothingEnabled = s.smooth !== false;
      ctx.drawImage(hmCanvas, X(xr[0]), Y(yr[1]), (xr[1] - xr[0]) * v.scale, (yr[1] - yr[0]) * v.scaleY);
      ctx.restore();
      return v;
    };
    /** Столбики по оси x: массивы (сортировка), распределения прямо в сцене. s: {x: [a, b], y0, color, labels, gap}. */
    v.bars = function (values, s) {
      s = st(s);
      var bd = v.visible, xr = s.x || [bd.x0, bd.x1], y0 = s.y0 || 0, n = values.length;
      if (!n) return v;
      var w = (xr[1] - xr[0]) / n, gap = s.gap == null ? 0.15 : s.gap;
      for (var i = 0; i < n; i++) {
        var val = Number(values[i]); if (!isFinite(val)) continue;
        var c = typeof s.color === 'function' ? s.color(val, i) : (Array.isArray(s.color) ? s.color[i % s.color.length] : s.color);
        v.rect(xr[0] + i * w + w * gap / 2, Math.min(y0, y0 + val), w * (1 - gap), Math.abs(val), { color: c || 'blue', radius: 2 });
        if (s.labels && s.labels[i] != null) v.text(xr[0] + (i + 0.5) * w, y0 - v.world(10), String(s.labels[i]), { size: 11, color: 'muted' });
      }
      return v;
    };
    /** След: v.trail(300) -> {push(x, y), draw(style), clear()} — траектория с угасанием. */
    v.trail = function (n) {
      var list = [], max = n || 200;
      return {
        push: function (x, y) {
          if (!isFinite(x) || !isFinite(y)) return;
          // Та же точка (пауза, draw без движения) — не добавляем: иначе след «тает» на паузе.
          var lp = list[list.length - 1];
          if (lp && Math.abs(lp[0] - x) < 1e-9 && Math.abs(lp[1] - y) < 1e-9) return;
          list.push([x, y]); if (list.length > max) list.splice(0, list.length - max); },
        clear: function () { list = []; },
        points: function () { return list; },
        draw: function (s) {
          s = st(s);
          if (list.length < 2) return;
          ctx.save(); stroke(s, s.width || 2);
          var c = color(s.color);
          for (var i = 1; i < list.length; i++) {
            ctx.globalAlpha = (s.alpha == null ? 0.9 : s.alpha) * (s.fade === false ? 1 : i / list.length);
            ctx.strokeStyle = c;
            ctx.beginPath(); ctx.moveTo(X(list[i - 1][0]), Y(list[i - 1][1])); ctx.lineTo(X(list[i][0]), Y(list[i][1])); ctx.stroke();
          }
          ctx.restore();
        },
      };
    };

    // ---------- HTML поверх сцены: формулы и кнопки, непосредственный режим ----------
    function ensureOverlay() {
      if (!overlay) { overlay = document.createElement('div'); overlay.className = 'sim-overlay'; document.body.appendChild(overlay); }
      return overlay;
    }
    function sweep() {
      for (var k in tags) {
        if (!Object.prototype.hasOwnProperty.call(tags, k)) continue;
        var t = tags[k];
        var vis = t.seen >= frameNo - 1;
        if (vis !== t.vis) { t.vis = vis; t.el.style.display = vis ? '' : 'none'; }
      }
    }
    function place(t, x, y, s) {
      t.seen = frameNo;
      var px = Math.round(X(x) + (s.dx || 0)), py = Math.round(Y(y) + (s.dy || 0));
      if (px !== t.px || py !== t.py) { t.px = px; t.py = py; t.el.style.transform = 'translate(' + px + 'px,' + py + 'px) translate(-50%,-50%)'; }
      if (!t.vis) { t.vis = true; t.el.style.display = ''; }
    }
    /** Формула-баллон в точке мира: v.tex(x, y, 'F = -kx'). KaTeX рендерится один раз. */
    v.tex = function (x, y, tex, s) {
      s = st(s);
      tex = String(tex);
      if (!/[\\\\^_{}]/.test(tex)) { s.id = s.id || ('t:' + tex.replace(/[\\d.,\\-\\s]+/g, '#')); return v.tag(x, y, tex, s); }
      tex = K.texSafe ? K.texSafe(tex) : tex;
      var key = 'tex:' + (s.id || tex), t = tags[key];
      if (!t) {
        var el = document.createElement('div'); el.className = 'sim-tag sim-tag-tex';
        if (s.color) el.style.setProperty('--sim-tag-color', color(s.color));
        ensureOverlay().appendChild(el);
        t = tags[key] = { el: el, tex: null, vis: true };
      }
      // KaTeX — дорогой рендер: живое число в формуле обновляем не чаще 8 раз в секунду.
      if (t.tex !== tex) {
        var tn = Date.now();
        if (!t.at || tn - t.at > 125) { t.tex = tex; t.at = tn; K.tex(t.el, tex, false); }
      }
      place(t, x, y, s);
      return v;
    };
    /** HTML-подпись в точке мира (обновляемый текст): v.tag(x, y, 'v = 3 м/с', {color}). */
    v.tag = function (x, y, text, s) {
      s = st(s);
      var key = 'tag:' + (s.id || ''), t = tags[key + text] || (s.id ? tags[key] : null);
      if (!t) {
        var el = document.createElement('div'); el.className = 'sim-tag';
        if (s.color) el.style.setProperty('--sim-tag-color', color(s.color));
        ensureOverlay().appendChild(el);
        t = { el: el, text: null, vis: true };
        tags[s.id ? key : key + text] = t;
      }
      if (t.text !== text) { t.text = text; t.el.textContent = K.uni(text); }
      place(t, x, y, s);
      return v;
    };
    /** Кнопка на сцене в точке мира: v.button(x, y, 'Толкнуть', fn). Видна, пока её вызывают в draw. */
    v.button = function (x, y, label, onClick, s) {
      s = st(s);
      var key = 'btn:' + (s.id || label), t = tags[key];
      if (!t) {
        var el = document.createElement('button'); el.type = 'button'; el.className = 'sim-tag sim-tag-btn';
        el.textContent = label;
        if (s.color) el.style.setProperty('--sim-tag-color', color(s.color));
        ensureOverlay().appendChild(el);
        t = tags[key] = { el: el, vis: true, fn: onClick };
        el.onclick = function () { K.__safe(t.fn, [], 'кнопке «' + label + '»'); };
        K.__register({ kind: 'button', name: s.name || s.id || label, label: label, activate: function () { el.onclick(); } });
      }
      t.fn = onClick;
      if (t.el.textContent !== label) t.el.textContent = label;
      place(t, x, y, s);
      return v;
    };

    // ---------- Перетаскивание и клики в координатах мира ----------
    var drags = [], active = null, clicks = [];
    function evPos(e) { var r = canvas.getBoundingClientRect(); return v.toWorld(e.clientX - r.left, e.clientY - r.top); }
    function hitTest(d, p) {
      try {
        if (typeof d.hit === 'function') return !!d.hit(p[0], p[1]);
        var h = d.hit || d, hx = typeof h.x === 'function' ? h.x() : h.x, hy = typeof h.y === 'function' ? h.y() : h.y;
        var r = (h.r || 0) + v.world(14);
        return (p[0] - hx) * (p[0] - hx) + (p[1] - hy) * (p[1] - hy) <= r * r;
      } catch (e) { return false; }
    }
    canvas.addEventListener('pointerdown', function (e) {
      var p = evPos(e);
      for (var i = drags.length - 1; i >= 0; i--) {
        if (hitTest(drags[i], p)) {
          active = drags[i];
          try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
          K.__safe(active.onStart, [p[0], p[1]], 'начале перетаскивания');
          e.preventDefault();
          return;
        }
      }
      for (var j = 0; j < clicks.length; j++) K.__safe(clicks[j], [p[0], p[1]], 'клике по сцене');
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = evPos(e);
      if (active) { K.__safe(active.onDrag || active.onMove, [p[0], p[1]], 'перетаскивании'); e.preventDefault(); return; }
      var over = false;
      for (var i = 0; i < drags.length; i++) if (hitTest(drags[i], p)) { over = true; break; }
      canvas.style.cursor = over ? 'grab' : (clicks.length ? 'crosshair' : '');
    });
    function up(e) {
      if (!active) return;
      var p = evPos(e);
      K.__safe(active.onEnd, [p[0], p[1]], 'конце перетаскивания');
      active = null;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    /** v.drag({hit: {x: fn, y: fn, r} | fn(x, y), onDrag: fn(x, y), onStart, onEnd}). */
    v.drag = function (d) { drags.push(d || {}); return v; };
    v.dragging = function () { return !!active; };
    v.onClick = function (fn) { clicks.push(fn); return v; };

    // Ошибка в одном примитиве (кривые аргументы от модели) не должна гасить весь кадр: остальное дорисуется.
    var guarded = {};
    Object.keys(v).forEach(function (k) {
      if (typeof v[k] !== 'function' || /^(fit|resize|toPx|toWorld|px|world|trail|drag|onClick|dragging|setWorld|follow)$/.test(k)) return;
      var fn = v[k];
      v[k] = function () {
        try { return fn.apply(v, arguments); }
        catch (e) {
          if (!guarded[k]) { guarded[k] = 1; try { console.error('Ошибка в view.' + k + ': ' + (e && e.message ? e.message : e)); } catch (e2) {} }
          try { while (saved.length) { if (saved.pop()) ctx.restore(); } } catch (e3) {}
          return v;
        }
      };
    });
    // Второй вид на том же холсте без area — делим свободную часть пополам (на узком экране — по высоте).
    var peers = canvas.__smhViews || (canvas.__smhViews = []);
    peers.push({ v: v, setArea: function (a) { area = a; fit(); } });
    if (!o.area && peers.length === 2 && !peers[0].v.__area) {
      var portrait = innerWidth < innerHeight;
      peers[0].setArea(portrait ? { x0: 0, x1: 1, y0: 0, y1: 0.5 } : { x0: 0, x1: 0.5, y0: 0, y1: 1 });
      area = portrait ? { x0: 0, x1: 1, y0: 0.5, y1: 1 } : { x0: 0.5, x1: 1, y0: 0, y1: 1 };
    }
    v.__area = !!o.area;
    window.addEventListener('resize', function () { fit(); });
    fit();
    // Формула догружает KaTeX и меняет ширину панелей — одна поправка, пока сцена ещё разгоняется.
    setTimeout(fit, 900);
    K.__view = v;
    return v;
  }

  K.view2d = view2d;
  K.scene2d = view2d;
})();
`;

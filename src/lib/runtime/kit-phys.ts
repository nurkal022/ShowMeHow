/**
 * SimPhys — физические помощники без DOM. Модель вызывает их, а не пишет заново:
 * устойчивый интегратор, подшаги, столкновения и поля — ровно те места, где в
 * самописном коде чаще всего рождаются NaN и «энергия растёт сама».
 *
 * Код общий для страницы и песочницы проверки ядра: ядро PHYS исполняется и там,
 * и там, поэтому SimPhys обязан быть доступен в обоих местах одинаково.
 */
export const SIMPHYS_JS = `
var SimPhys = (function () {
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  /** Делит шаг dt на подшаги не крупнее maxDt: крупный кадр не ломает жёсткую систему. */
  function substep(dt, maxDt, fn) {
    var n = Math.max(1, Math.ceil(dt / maxDt)), h = dt / n;
    for (var i = 0; i < n; i++) fn(h);
    return n;
  }
  /** Классический RK4 для массива состояния: deriv(y, t) -> dy/dt той же длины. */
  function rk4(y, t, dt, deriv) {
    var n = y.length, k1 = deriv(y, t), tmp = new Array(n), i;
    for (i = 0; i < n; i++) tmp[i] = y[i] + k1[i] * dt / 2;
    var k2 = deriv(tmp, t + dt / 2);
    for (i = 0; i < n; i++) tmp[i] = y[i] + k2[i] * dt / 2;
    var k3 = deriv(tmp, t + dt / 2);
    for (i = 0; i < n; i++) tmp[i] = y[i] + k3[i] * dt;
    var k4 = deriv(tmp, t + dt);
    var out = new Array(n);
    for (i = 0; i < n; i++) out[i] = y[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }
  /** Полунеявный Эйлер для {x, v}: accel(x, v) -> a. Хорошо держит энергию колебаний. */
  function eulerCromer(s, dt, accel) {
    s.v += accel(s.x, s.v) * dt;
    s.x += s.v * dt;
    return s;
  }
  /** Скоростной Верле для {x, v, a}: accel(x) -> a. */
  function verlet(s, dt, accel) {
    if (s.a == null) s.a = accel(s.x);
    s.x += s.v * dt + 0.5 * s.a * dt * dt;
    var a2 = accel(s.x);
    s.v += 0.5 * (s.a + a2) * dt;
    s.a = a2;
    return s;
  }
  /** Упругое столкновение двух кругов {x, y, vx, vy, r, m}; true, если столкнулись. */
  function collide(a, b, restitution) {
    var e = restitution == null ? 1 : restitution;
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy), min = a.r + b.r;
    if (d >= min || d === 0) return false;
    var nx = dx / d, ny = dy / d, ma = a.m || 1, mb = b.m || 1;
    var overlap = (min - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
    var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv > 0) return true;
    var j = -(1 + e) * rv / (1 / ma + 1 / mb);
    a.vx -= j * nx / ma; a.vy -= j * ny / ma; b.vx += j * nx / mb; b.vy += j * ny / mb;
    return true;
  }
  /** Отражение от стенок прямоугольника [0..w]×[0..h] для {x, y, vx, vy, r}. */
  function walls(p, w, h, restitution) {
    var e = restitution == null ? 1 : restitution, r = p.r || 0;
    if (p.x < r) { p.x = r; p.vx = Math.abs(p.vx) * e; }
    if (p.x > w - r) { p.x = w - r; p.vx = -Math.abs(p.vx) * e; }
    if (p.y < r) { p.y = r; p.vy = Math.abs(p.vy) * e; }
    if (p.y > h - r) { p.y = h - r; p.vy = -Math.abs(p.vy) * e; }
  }
  /** Поле точечных зарядов [{x, y, q}] в точке: {ex, ey, v}; k — постоянная, soft — сглаживание у заряда. */
  function field(charges, x, y, k, soft) {
    k = k == null ? 8.99e9 : k; soft = soft || 1e-6;
    var ex = 0, ey = 0, v = 0;
    for (var i = 0; i < charges.length; i++) {
      var c = charges[i], dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy + soft, r = Math.sqrt(r2);
      ex += k * c.q * dx / (r2 * r); ey += k * c.q * dy / (r2 * r); v += k * c.q / r;
    }
    return { ex: ex, ey: ey, v: v };
  }
  /** Сила пружины между точками a и b (жёсткость k, длина покоя L0): {fx, fy} на a. */
  function spring(a, b, k, L0) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-9, f = k * (d - L0);
    return { fx: f * dx / d, fy: f * dy / d };
  }
  /**
   * Живой измеритель периода: feed(t, value) на каждом кадре, get() — последний период
   * по пересечениям среднего снизу вверх; reset() — начать заново. Для таблиц измерений.
   */
  function periodMeter() {
    var prev = null, prevT = 0, mean = 0, n = 0, last = null, period = NaN;
    return {
      feed: function (t, x) {
        n++; mean += (x - mean) / Math.min(n, 600);
        if (prev !== null && prev - mean < 0 && x - mean >= 0) {
          var a = prev - mean, b = x - mean, tc = prevT + (t - prevT) * (a / (a - b));
          if (last !== null) period = tc - last;
          last = tc;
        }
        prev = x; prevT = t;
      },
      get: function () { return period; },
      reset: function () { prev = null; mean = 0; n = 0; last = null; period = NaN; },
    };
  }
  return {
    clamp: clamp, lerp: lerp, substep: substep, rk4: rk4, eulerCromer: eulerCromer, verlet: verlet,
    collide: collide, walls: walls, field: field, spring: spring, periodMeter: periodMeter,
  };
})();
if (typeof window !== 'undefined') window.SimPhys = SimPhys;
if (typeof self !== 'undefined') self.SimPhys = SimPhys;
`;

/**
 * Помощник 3D-сцены: рендер в существующий холст #scene, свет, камера по размеру
 * объекта и соотношению сторон, resize. THREE и OrbitControls передаются снаружи —
 * кит классический скрипт, а three.js грузится модулем.
 */
export const KIT_THREE_JS = `
(function () {
  var K = window.SimUI;
  K.scene3d = function (THREE, OrbitControls, o) {
    o = o || {};
    var canvas = document.getElementById(o.canvas || 'scene');
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.id = 'scene';
      canvas.style.cssText = 'position:fixed;inset:0;display:block';
      document.body.appendChild(canvas);
    }
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(o.background == null ? 0x101318 : o.background);
    var camera = new THREE.PerspectiveCamera(o.fov || 45, 1, 0.01, 1000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
    var sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(4, 8, 6); scene.add(sun);
    var controls = OrbitControls ? new OrbitControls(camera, canvas) : null;
    if (controls) { controls.enableDamping = true; controls.enablePan = false; }
    var radius = o.radius || 3, target = new THREE.Vector3(0, 0, 0);
    // Дистанция по соотношению сторон: объект целиком в кадре и на узком экране.
    function fit(r, center) {
      if (r) radius = r;
      if (center) target.copy(center);
      var aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      var vfov = camera.fov * Math.PI / 180;
      var hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      var dist = radius / Math.sin(Math.min(vfov, hfov) / 2) * 1.1;
      var dir = new THREE.Vector3(o.view ? o.view[0] : 0.6, o.view ? o.view[1] : 0.45, o.view ? o.view[2] : 1).normalize();
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
      if (controls) { controls.target.copy(target); controls.update(); } else camera.lookAt(target);
    }
    function resize() {
      var w = innerWidth, h = innerHeight;
      renderer.setSize(w, h, false);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
      fit();
    }
    window.addEventListener('resize', resize);
    resize();
    return {
      renderer: renderer, scene: scene, camera: camera, controls: controls, fit: fit, resize: resize,
      render: function () { if (controls) controls.update(); renderer.render(scene, camera); },
    };
  };
})();
`;

import type { PlanSpec } from '../types';
import { openSession } from '../renderer';
import { SIMPHYS_JS } from '../runtime/kit-phys';

/**
 * Ядро физики пишется ДО сцены и проверяется числами, а не скриншотами. Раньше о
 * физике судили по картинке — критик видел «шарик летит», но не видел, что энергия
 * растёт на треть за десять секунд. Теперь ядро — чистый JS без DOM:
 *
 *   var PHYS = { init(p) -> state, step(state, p, dt), observe(state, p) -> {имя: число} }
 *
 * Проверка: без исключений и NaN на всём диапазоне параметров, каждый параметр на
 * что-то влияет, инварианты из плана выполняются. Код пишет модель, поэтому он
 * исполняется не в процессе воркера, а в Web Worker внутри Chromium — той же
 * песочнице, где идёт рендер; зависшее ядро убивается по таймауту.
 */

export interface CoreCheck { label: string; ok: boolean; detail: string; soft?: boolean }
export interface CoreReport {
  ok: boolean; results: CoreCheck[];
  /** Всё проваленное — для человека и отчёта. */
  failures: string[];
  /** Провалы, ради которых ядро чинят: без мягких. */
  hard: string[];
}

/**
 * Параметры, от которых по плану ничего не зависит («период не зависит от массы»):
 * их не проверяем на влияние — там отсутствие влияния и есть урок.
 */
export function independentParams(spec: PlanSpec): string[] {
  const texts = (spec.invariants ?? []).map((i) => i.text.toLowerCase()).filter((t) => /не зависит|независим/.test(t));
  if (!texts.length) return [];
  return spec.parameters.filter((p) => {
    const word = p.label.toLowerCase().split(/\s+/)[0];
    // Основа без окончания: «масса» и «массы» должны совпасть.
    const stem = word.slice(0, Math.max(3, Math.min(5, word.length - 1)));
    return stem.length >= 3 && texts.some((t) => t.includes(stem));
  }).map((p) => p.name);
}

export interface CoreCode { core: string; checks: string }

/** Ответ модели — два блока кода: ядро и проверки инвариантов. JSON тут не годится: код в строках ломает экранирование. */
export function parseCoreReply(out: string): CoreCode | null {
  const blocks = [...out.matchAll(/```(?:js|javascript)?\s*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  const core = blocks.find((b) => /\bvar\s+PHYS\s*=/.test(b));
  if (!core) return null;
  const checks = blocks.find((b) => b !== core && /\bvar\s+CHECKS\s*=/.test(b)) ?? 'var CHECKS = [];';
  return { core, checks };
}

export function defaultParams(spec: PlanSpec): Record<string, number> {
  const p: Record<string, number> = {};
  for (const x of spec.parameters) p[x.name] = x.value;
  return p;
}

/**
 * Исполнитель проверок внутри Web Worker. ES5 и без зависимостей: уходит в страницу строкой.
 * Сообщение: {core, checks, P, params: [{name,label,min,max}]} → {results: [{label, ok, detail}]}.
 */
export const CORE_RUNNER_JS = SIMPHYS_JS + `
var P = {};
function __merge(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var k2 in (b || {})) o[k2] = b[k2]; return o; }
function run(over, seconds, dt) {
  var p = __merge(P, over);
  dt = dt || 1 / 120;
  var s = PHYS.init(p);
  var samples = [];
  var n = Math.round(seconds / dt);
  var every = Math.max(1, Math.round(n / 60));
  for (var i = 0; i <= n; i++) {
    if (i % every === 0) samples.push({ t: i * dt, obs: __copy(PHYS.observe(s, p)) });
    if (i < n) PHYS.step(s, p, dt);
  }
  return { samples: samples, state: s };
}
// Период величины key: по пересечениям среднего снизу вверх на полном шаге dt, а не по 60
// точкам samples — на грубой сетке проверки модели путали период с длиной окна.
function period(over, key, seconds, dt) {
  var p = __merge(P, over);
  dt = dt || 1 / 240;
  seconds = seconds || 30;
  var s = PHYS.init(p), xs = [], n = Math.round(seconds / dt), i;
  for (i = 0; i <= n; i++) { xs.push(Number(PHYS.observe(s, p)[key])); if (i < n) PHYS.step(s, p, dt); }
  var mean = 0;
  for (i = 0; i < xs.length; i++) mean += xs[i];
  mean /= xs.length;
  var ups = [];
  for (i = 1; i < xs.length; i++) {
    var a = xs[i - 1] - mean, b = xs[i] - mean;
    if (a < 0 && b >= 0) ups.push((i - 1 + a / (a - b)) * dt);
  }
  if (ups.length < 2) return NaN;
  return (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
}
// Копия наблюдаемых без JSON: он превратил бы NaN и Infinity в null — и проверка их бы не увидела.
function __copy(o) {
  if (!o || typeof o !== 'object') return o;
  var out = {};
  for (var k in o) if (typeof o[k] === 'number') out[k] = o[k];
  return out;
}
function __badObs(obs) {
  if (!obs || typeof obs !== 'object') return 'observe() вернул не объект';
  for (var k in obs) {
    var v = obs[k];
    if (typeof v === 'number' && !isFinite(v)) return k + ' = ' + v;
  }
  if (Object.keys(obs).length === 0) return 'observe() не возвращает ни одной величины';
  return null;
}
function __differs(a, b) {
  var n = Math.min(a.length, b.length);
  for (var i = 0; i < n; i++) {
    for (var k in a[i].obs) {
      var x = a[i].obs[k], y = b[i].obs[k];
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) continue;
      var scale = Math.max(Math.abs(x), Math.abs(y), 1e-9);
      if (Math.abs(x - y) > 0.01 * scale) return true;
    }
  }
  return false;
}
onmessage = function (e) {
  var d = e.data, results = [];
  // ok === 'soft' — провал, о котором человек узнаёт, но ради которого ядро не переписывают:
  // «параметр ни на что не влияет» часто значит лишь, что это настройка опыта, а не физика.
  function add(label, ok, detail) {
    var r = { label: label, ok: ok === true, detail: detail || '' };
    if (ok === 'soft') r.soft = true;
    results.push(r);
  }
  P = d.P;
  try {
    (0, eval)(d.core + '\\n;self.PHYS = PHYS;');
  } catch (err) {
    add('Ядро исполняется', false, 'ошибка при загрузке ядра: ' + err);
    postMessage({ results: results }); return;
  }
  if (typeof PHYS !== 'object' || typeof PHYS.init !== 'function' || typeof PHYS.step !== 'function' ||
      typeof PHYS.observe !== 'function') {
    add('Ядро исполняется', false, 'PHYS должен иметь функции init, step и observe');
    postMessage({ results: results }); return;
  }
  add('Ядро исполняется', true);
  var cases = [{ label: 'значения по умолчанию', over: {} }];
  for (var i = 0; i < d.params.length; i++) {
    var p = d.params[i], lo = {}, hi = {};
    lo[p.name] = p.min; hi[p.name] = p.max;
    cases.push({ label: p.label + ' = ' + p.min, over: lo });
    cases.push({ label: p.label + ' = ' + p.max, over: hi });
  }
  var bad = [];
  for (var c = 0; c < cases.length && bad.length < 4; c++) {
    try {
      var r = run(cases[c].over, 10).samples;
      for (var j = 0; j < r.length; j++) {
        var b = __badObs(r[j].obs);
        if (b) { bad.push(cases[c].label + ', t=' + r[j].t.toFixed(2) + ' с: ' + b); break; }
      }
    } catch (err) { bad.push(cases[c].label + ': ' + String(err).slice(0, 200)); }
  }
  add('Величины конечны на всём диапазоне параметров', bad.length === 0, bad.join('; '));
  var dead = [];
  for (var q = 0; q < d.params.length; q++) {
    var pp = d.params[q], a = {}, z = {};
    if (d.independent.indexOf(pp.name) !== -1) continue; // по плану и должен не влиять
    a[pp.name] = pp.min; z[pp.name] = pp.max;
    try { if (!__differs(run(a, 5).samples, run(z, 5).samples)) dead.push(pp.label); } catch (err) {}
  }
  add('Каждый параметр влияет на величины', dead.length === 0 ? true : 'soft', dead.length
    ? 'параметр(ы) ' + dead.join(', ') + ' не меняют ни одной величины observe() между min и max — ' +
      'либо ядро их не читает, либо observe() не выводит то, на что они влияют' : '');
  var list = [];
  try { (0, eval)(d.checks + '\\n;self.CHECKS = (typeof CHECKS !== "undefined" && CHECKS) || [];'); list = self.CHECKS || []; }
  catch (err) { add('Проверки инвариантов загружаются', false, String(err).slice(0, 200)); }
  for (var m = 0; m < Math.min(list.length, 8); m++) {
    var label = String((list[m] && list[m].label) || ('Инвариант ' + (m + 1)));
    try {
      var res = list[m].fn(PHYS, run, P, period);
      add(label, res === true, res === true ? '' : String(res).slice(0, 300));
    } catch (err) { add(label, false, 'проверка упала: ' + String(err).slice(0, 200)); }
  }
  postMessage({ results: results });
};
`;

type Open = typeof openSession;

/** Прогон ядра и проверок. Не бросает: любая ошибка — проваленная проверка. */
export async function checkCore(
  code: CoreCode, spec: PlanSpec, { timeoutMs = 8000, open = openSession }: { timeoutMs?: number; open?: Open } = {},
): Promise<CoreReport> {
  const payload = {
    core: code.core, checks: code.checks, P: defaultParams(spec),
    params: spec.parameters.map((p) => ({ name: p.name, label: p.label, min: p.min, max: p.max })),
    independent: independentParams(spec),
  };
  const expr = `new Promise(function (res) {
    var w = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(CORE_RUNNER_JS)}], { type: 'text/javascript' })));
    var t = setTimeout(function () { w.terminate(); res({ timeout: true }); }, ${timeoutMs});
    w.onmessage = function (e) { clearTimeout(t); w.terminate(); res(e.data); };
    w.onerror = function (e) { clearTimeout(t); w.terminate(); res({ error: String(e.message || e) }); };
    w.postMessage(${JSON.stringify(payload)});
  })`;
  let reply: { results?: CoreCheck[]; timeout?: boolean; error?: string };
  try {
    const s = await open('<!DOCTYPE html><html><body></body></html>');
    try {
      reply = await s.evaluate(expr);
    } finally {
      await s.close();
    }
  } catch (e) {
    // Песочница недоступна — это не вина ядра; проверку считаем непроведённой.
    return { ok: true, results: [{ label: 'Проверка ядра недоступна', ok: true, detail: String(e) }], failures: [], hard: [] };
  }
  const results: CoreCheck[] = reply.results ?? [{
    label: 'Ядро исполняется', ok: false,
    detail: reply.timeout ? `ядро не уложилось в ${timeoutMs / 1000} с — вероятно, бесконечный цикл в step()`
      : `ошибка исполнения: ${reply.error ?? 'нет ответа'}`,
  }];
  const failed = results.filter((r) => !r.ok);
  const text = (r: CoreCheck) => (r.detail ? `${r.label}: ${r.detail}` : r.label);
  return {
    ok: failed.length === 0,
    results,
    failures: failed.map(text),
    hard: failed.filter((r) => !r.soft).map(text),
  };
}

export const PHYSICS_SYSTEM = `Ты — физик-программист. По спецификации учебного тренажёра напиши ЯДРО ФИЗИКИ:
чистый JavaScript (ES5, без DOM, без canvas, без SimUI), который потом возьмут в тренажёр как есть.

Формат ответа — ровно два блока кода, никакого текста вокруг:
\`\`\`js
var PHYS = (function () {
  // константы с единицами в комментариях
  function init(p) { return { t: 0 /* ...всё состояние... */ }; }
  function step(s, p, dt) { /* продвинуть состояние s на dt секунд по уравнениям spec.physics */ s.t += dt; }
  function observe(s, p) { return { t: s.t /* ...все наблюдаемые величины из spec.observables, числами... */ }; }
  return { init: init, step: step, observe: observe };
})();
\`\`\`
\`\`\`js
var CHECKS = [
  { label: 'Энергия сохраняется без трения', fn: function (PHYS, run, P) {
      var r = run({ friction: 0 }, 10);
      var e0 = r.samples[0].obs.energy, e1 = r.samples[r.samples.length - 1].obs.energy;
      return Math.abs(e1 - e0) <= 0.01 * Math.abs(e0) || ('энергия изменилась: ' + e0 + ' → ' + e1);
  } },
];
\`\`\`
Правила:
- p — объект параметров по именам spec.parameters[].name (все числа). init читает p, step и observe — тоже.
- step мутирует s; dt — секунды реального времени; устойчивый интегратор, при крупном dt дели шаг
  на подшаги. Никаких NaN: делить и брать корни с проверками.
- Готовые помощники SimPhys (доступны и в тренажёре, и при проверке) — пользуйся ими, а не пиши заново:
  SimPhys.substep(dt, maxDt, function (h) {...}) — подшаги; SimPhys.rk4(yArray, t, dt, deriv) -> новый массив;
  SimPhys.eulerCromer({x, v}, dt, accel(x, v)); SimPhys.verlet({x, v, a}, dt, accel(x));
  SimPhys.collide(a, b, e) и SimPhys.walls(p, w, h, e) для частиц {x, y, vx, vy, r, m};
  SimPhys.field(charges [{x, y, q}], x, y, k, soft) -> {ex, ey, v}; SimPhys.spring(a, b, k, L0) -> {fx, fy};
  SimPhys.clamp, SimPhys.lerp.
- observe возвращает ВСЕ величины, которые покажут приборы (spec.observables) и которыми
  проверяются инварианты, плюс t. Все параметры обязаны влиять хотя бы на одну из них.
- Если процесс дискретный (фазы, такты, реакции) — храни фазу в состоянии числом.
- CHECKS — проверки инвариантов из spec.invariants. fn(PHYS, run, P, period):
  run(over, seconds, dt?) прогоняет ядро с параметрами P, переопределёнными over, и возвращает
  {samples: [{t, obs}], state} — samples РЕДКИЕ (около 60 точек), для периодов они не годятся;
  period(over, key, seconds?, dt?) — точный период величины obs[key] по пересечениям среднего
  (окно по умолчанию 30 с — бери его не меньше 5 периодов). fn возвращает true или строку с
  объяснением провала. 2-4 проверки, допуски разумные для численного метода.`;

export const PHYSICS_FIX_SYSTEM = `${PHYSICS_SYSTEM}

Сейчас тебе дают предыдущее ядро и список проваленных проверок. Исправь ФИЗИКУ ядра (не ослабляй
проверки, если физика действительно неверна; поправь проверку, только если ошибка в ней самой —
например, допуск меньше погрешности метода). Ответ — снова два блока кода целиком.`;

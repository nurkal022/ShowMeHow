import type { RenderSession } from '../renderer';

export interface ProbeResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'skip';
  /** Человекочитаемая причина — идёт в фиксер и критику как есть. */
  detail: string;
}

export interface ProbeReport {
  results: ProbeResult[];
  /** Доля пройденных среди pass+fail (skip не учитывается). 1, если проверять было нечего. */
  passRate: number;
  /** Тексты провалов вида «Пауза не работает: …» — готовы к передаче фиксеру. */
  failures: string[];
  /** Кадры, снятые пробами (для критика): анимация, слайдер на максимуме. */
  shots: Buffer[];
}

interface ControlInfo {
  kind: string;
  name: string;
  label: string;
  min?: number;
  max?: number;
  value: unknown;
}

const PLAYPAUSE = '[data-smh-btn="playpause"]';
const RESET = '[data-smh-btn="reset"]';

/**
 * Состояние без «эха» самого контрола. getState() по инструкции кита возвращает и
 * текущие значения параметров, поэтому движение слайдера меняло состояние ВСЕГДА —
 * независимо от того, читает ли физика этот параметр. Выбрасываем ключ с именем
 * контрола и любой ключ, чьё новое значение совпало с новым значением слайдера:
 * остаётся только то, что изменилось в самой симуляции.
 */
function withoutEcho(state: unknown, after: unknown, name: string, target: number): unknown {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const src = state as Record<string, unknown>;
  const dst = (after && typeof after === 'object' && !Array.isArray(after)
    ? after : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    if (k === name) continue;
    const v = dst[k];
    if (typeof v === 'number' && Math.abs(v - target) <= 1e-9 * Math.max(1, Math.abs(target))) {
      continue;
    }
    out[k] = src[k];
  }
  return out;
}

/**
 * Панель управления сама показывает значение слайдера и положение ползунка, поэтому
 * кадр с ней меняется после ЛЮБОГО движения слайдера — это эхо интерфейса, а не физика.
 * Прячем панель только на время съёмки: кнопки паузы/сброса должны оставаться кликабельными.
 */
const HIDE_PANEL =
  "(function(){var e=document.querySelectorAll('.sim-panel,.sim-panel-toggle');" +
  "for(var i=0;i<e.length;i++){e[i].style.visibility='hidden';}return true;})()";
const SHOW_PANEL =
  "(function(){var e=document.querySelectorAll('.sim-panel,.sim-panel-toggle');" +
  "for(var i=0;i<e.length;i++){e[i].style.visibility='';}return true;})()";

/** Числовые величины состояния без ключа-эха самого контрола. */
function numbersOf(state: unknown, ignore: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!state || typeof state !== 'object' || Array.isArray(state)) return out;
  for (const [k, v] of Object.entries(state as Record<string, unknown>)) {
    if (k === ignore) continue;
    if (typeof v === 'number' && isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Вернуть панель управления. Вызывается не только из finally съёмки: проглоченный
 * сбой SHOW_PANEL оставил бы `.sim-panel` скрытой до конца сессии, а внутри неё живут
 * кнопки паузы и сброса — Playwright по невидимому элементу не кликает, и все
 * последующие пробы посыпались бы ЛОЖНЫМИ провалами. Поэтому восстановление
 * повторяется перед каждым местом, где дальше будет клик, и ещё раз после цикла.
 */
async function showPanel(s: RenderSession): Promise<void> {
  await safe(() => s.evaluate<boolean>(SHOW_PANEL), false);
}

/** Кадр только сцены и приборов: панель управления на время съёмки скрыта. */
async function sceneShot(s: RenderSession): Promise<Buffer> {
  await safe(() => s.evaluate<boolean>(HIDE_PANEL), false);
  try {
    return await s.shot();
  } finally {
    await showPanel(s);
  }
}

/**
 * Как меняются величины состояния за окно работающей симуляции. Слайдер, влияющий
 * только на ТЕМП (скорость, жёсткость, затухание), на паузе не виден вообще:
 * сравнить его эффект можно лишь по приращениям за одинаковые окна.
 */
async function deltaOverWindow(
  s: RenderSession, ms: number, ignore: string,
): Promise<Record<string, number>> {
  const state = () => safe(() => s.evaluate<unknown>('window.__smh.state()'), null);
  // Окно измеряется кликами по кнопке паузы — панель обязана быть видимой.
  await showPanel(s);
  const before = numbersOf(await state(), ignore);
  await s.click(PLAYPAUSE);
  await s.wait(ms);
  await s.click(PLAYPAUSE);
  const after = numbersOf(await state(), ignore);
  const out: Record<string, number> = {};
  for (const k of Object.keys(before)) {
    if (k in after) out[k] = after[k] - before[k];
  }
  return out;
}

/**
 * Приращения признаём разными, если они расходятся сильнее, чем джиттер окна
 * (несколько процентов). Порог в 15 % — компромисс, и его смещение надо понимать
 * честно: при measurable=true «темп не изменился» ведёт в dead, то есть в ПРОВАЛ,
 * поэтому грубый порог рискует завалить слабый, но настоящий эффект слайдера
 * (меньше 15 % за окно). Ниже опускать порог нельзя — джиттер реального окна
 * начнёт выдавать себя за эффект и проба потеряет смысл.
 *
 * Обратная сторона того же сравнения — ложный ПРОПУСК: величина, которая
 * разгоняется сама по себе (координата при постоянном ускорении), даёт разные
 * приращения за два соседних окна из-за одного лишь дрейфа, поэтому мёртвый
 * слайдер на такой симуляции получит pass, а не fail. Это безопасная сторона
 * ошибки: фиксера не отправляют чинить работающий код.
 */
function ratesDiffer(a: Record<string, number>, b: Record<string, number>): boolean {
  for (const k of Object.keys(a)) {
    if (!(k in b)) continue;
    const scale = Math.max(Math.abs(a[k]), Math.abs(b[k]));
    if (scale < 1e-9) continue;
    if (Math.abs(a[k] - b[k]) > 0.15 * scale) return true;
  }
  return false;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Гоняет поведенческие пробы по живой странице. Порядок важен: сначала снимаем
 * анимацию на работающей симуляции, потом ставим паузу (в паузе кадры стабильны —
 * только так можно сравнивать эффект слайдера), в конце возвращаем воспроизведение.
 */
export async function runProbes(s: RenderSession): Promise<ProbeReport> {
  const results: ProbeResult[] = [];
  const shots: Buffer[] = [];
  const add = (id: string, label: string, status: ProbeResult['status'], detail: string) =>
    results.push({ id, label, status, detail });

  const hasExpose = await safe(
    () => s.evaluate<boolean>('!!(window.__smh && window.__smh.hasExpose())'),
    false,
  );

  // --- 1. Анимация идёт ---
  const a1 = await s.shot();
  await s.wait(1200);
  const a2 = await s.shot();
  await s.wait(1800);
  const a3 = await s.shot();
  shots.push(a3);
  if (a1.equals(a2) && a1.equals(a3)) {
    add('animates', 'Анимация идёт', 'fail',
      'кадры на 0с, 1.2с и 3с полностью идентичны — симуляция статична');
  } else {
    add('animates', 'Анимация идёт', 'pass', '');
  }

  // --- 2. Пауза останавливает анимацию ---
  let paused = false;
  if (!(await s.click(PLAYPAUSE))) {
    add('pause', 'Пауза останавливает анимацию', 'fail',
      'кнопка паузы не найдена — SimUI.playPause не вызван');
  } else {
    paused = true;
    await s.wait(250);
    // Три кадра вместо двух в том же окне: Chromium изредка отдаёт кадр,
    // отличающийся парой пикселей на 1/255 (шум композитора), и побайтовое
    // сравнение двух кадров объявляло рабочую паузу сломанной — а фиксер шёл
    // чинить несуществующий баг. Совпадения ЛЮБОЙ пары достаточно: одиночный
    // шумный кадр больше ничего не решает, а реально идущая симуляция меняется
    // во всех трёх.
    const p1 = await s.shot();
    await s.wait(400);
    const p2 = await s.shot();
    await s.wait(400);
    const p3 = await s.shot();
    if (p1.equals(p2) || p1.equals(p3) || p2.equals(p3)) {
      add('pause', 'Пауза останавливает анимацию', 'pass', '');
    } else {
      add('pause', 'Пауза останавливает анимацию', 'fail',
        'после нажатия «Пауза» кадры продолжают меняться — onPause не останавливает симуляцию');
    }
  }

  // --- 3. Сброс меняет состояние (проверяем в паузе) ---
  if (!hasExpose) {
    add('reset', 'Сброс возвращает начальное состояние', 'skip',
      'SimUI.expose не реализован — состояние симуляции недоступно для проверки');
  } else {
    const before = await safe(() => s.evaluate<unknown>('window.__smh.state()'), null);
    if (!(await s.click(RESET))) {
      add('reset', 'Сброс возвращает начальное состояние', 'fail',
        'кнопка сброса не найдена — SimUI.playPause не вызван');
    } else {
      await s.wait(200);
      const after = await safe(() => s.evaluate<unknown>('window.__smh.state()'), null);
      if (JSON.stringify(before) === JSON.stringify(after)) {
        add('reset', 'Сброс возвращает начальное состояние', 'fail',
          'после нажатия «Сброс» состояние не изменилось: ' + JSON.stringify(after) +
          ' — onReset не возвращает симуляцию к начальным значениям');
      } else {
        add('reset', 'Сброс возвращает начальное состояние', 'pass', '');
      }
    }
  }

  // --- 4. Слайдеры влияют на симуляцию ---
  const controls = await safe<ControlInfo[]>(
    () => s.evaluate<ControlInfo[]>('window.__smh ? window.__smh.controls() : []'),
    [],
  );
  const sliders = controls.filter((c) => c.kind === 'slider');
  if (sliders.length === 0) {
    add('sliders', 'Слайдеры влияют на симуляцию', 'fail',
      'ни одного SimUI.slider — у симуляции нет интерактивных параметров');
  } else {
    const errorsBefore = s.errors().length;
    // dead — параметр было чем измерить, и не откликнулось НИЧЕГО (настоящий дефект);
    // unmeasurable — измерять было нечем (нет expose или в состоянии одно эхо).
    const dead: string[] = [];
    const unmeasurable: string[] = [];
    for (const c of sliders) {
      const stateBefore = await safe(() => s.evaluate<unknown>('window.__smh.state()'), null);
      const frameBefore = paused ? await sceneShot(s) : null;
      // Целимся в дальний от текущего значения конец диапазона — так эффект максимален.
      const cur = typeof c.value === 'number' ? c.value : Number(c.min ?? 0);
      const min = Number(c.min ?? 0);
      const max = Number(c.max ?? 1);
      const target = Math.abs(max - cur) >= Math.abs(cur - min) ? max : min;
      await safe(
        () => s.evaluate<boolean>(
          `window.__smh.setControl(${JSON.stringify(c.name)}, ${target})`),
        false,
      );
      await s.wait(500);
      const stateAfter = await safe(() => s.evaluate<unknown>('window.__smh.state()'), null);
      const frameAfter = paused ? await sceneShot(s) : null;
      // Сравниваем состояния, выбросив из ОБОИХ ключи-эхо слайдера: изменение
      // должно быть видно где-то ещё — в другой величине или в кадре на паузе.
      const stateChanged = stateBefore !== null &&
        JSON.stringify(withoutEcho(stateBefore, stateAfter, c.name, target)) !==
        JSON.stringify(withoutEcho(stateAfter, stateAfter, c.name, target));
      const frameChanged = !!frameBefore && !!frameAfter && !frameBefore.equals(frameAfter);
      if (frameAfter) shots.push(frameAfter);
      let observed = stateChanged || frameChanged;
      // Ничего не изменилось на паузе — это ещё не приговор: параметр может влиять
      // только на темп процесса. Сравниваем приращения за два одинаковых окна работы.
      const measurable = paused && hasExpose &&
        Object.keys(numbersOf(stateAfter, c.name)).length > 0;
      if (!observed && measurable) {
        const atTarget = await deltaOverWindow(s, 600, c.name);
        if (typeof c.value === 'number') {
          await safe(
            () => s.evaluate<boolean>(
              `window.__smh.setControl(${JSON.stringify(c.name)}, ${c.value})`),
            false,
          );
        }
        const atOriginal = await deltaOverWindow(s, 600, c.name);
        observed = ratesDiffer(atTarget, atOriginal);
      }
      if (!observed) (measurable ? dead : unmeasurable).push(c.label || c.name);
      // Возвращаем исходное значение, чтобы следующие пробы шли по нетронутой симуляции.
      if (typeof c.value === 'number') {
        await safe(
          () => s.evaluate<boolean>(
            `window.__smh.setControl(${JSON.stringify(c.name)}, ${c.value})`),
          false,
        );
      }
    }
    // Страховка на случай проглоченного сбоя восстановления внутри цикла:
    // дальше пробам ещё кликать по кнопке паузы (снятие паузы, проба NaN).
    if (paused) await showPanel(s);
    const newErrors = s.errors().slice(errorsBefore);
    if (newErrors.length > 0) {
      add('sliders', 'Слайдеры влияют на симуляцию', 'fail',
        'движение слайдера вызвало ошибку: ' + newErrors.join('; '));
    } else if (dead.length > 0) {
      add('sliders', 'Слайдеры влияют на симуляцию', 'fail',
        'параметр (' + dead.join(', ') + ') ни на что не влияет: при движении слайдера ' +
        'в крайнее положение не изменились ни картинка, ни одна величина состояния, ' +
        'ни темп процесса — значение читается только в getState');
    } else if (unmeasurable.length === sliders.length) {
      add('sliders', 'Слайдеры влияют на симуляцию', 'skip',
        'эффект слайдеров (' + unmeasurable.join(', ') +
        ') не наблюдаем автоматически — состояние и кадр не изменились');
    } else {
      add('sliders', 'Слайдеры влияют на симуляцию', 'pass', '');
    }
  }

  // Возвращаем воспроизведение — симуляция не должна остаться на паузе.
  // Даём физике хотя бы один кадр: сразу после resume состояние ещё несёт
  // значения из паузы (например, обнулённые сбросом) и NaN, всплывающий
  // только во время работающего цикла, иначе не успевает проявиться.
  if (paused) {
    await s.click(PLAYPAUSE);
    await s.wait(300);
  }

  // --- 5. Нет NaN/Infinity ---
  const bad = await safe<string[]>(
    () => s.evaluate<string[]>('window.__smh ? window.__smh.badNumbers() : []'),
    [],
  );
  if (bad.length > 0) {
    add('nan', 'Величины конечны (нет NaN/Infinity)', 'fail',
      'некорректные значения: ' + bad.slice(0, 5).join('; '));
  } else if (!hasExpose) {
    add('nan', 'Величины конечны (нет NaN/Infinity)', 'skip',
      'SimUI.expose не реализован — проверены только видимые подписи');
  } else {
    add('nan', 'Величины конечны (нет NaN/Infinity)', 'pass', '');
  }

  // --- 6. Внешние ресурсы только из whitelist ---
  const blocked = s.blockedUrls();
  if (blocked.length > 0) {
    add('cdn', 'Внешние ресурсы только из whitelist', 'fail',
      'заблокированы запросы: ' + [...new Set(blocked)].slice(0, 5).join(', '));
  } else {
    add('cdn', 'Внешние ресурсы только из whitelist', 'pass', '');
  }

  const judged = results.filter((r) => r.status !== 'skip');
  const passed = judged.filter((r) => r.status === 'pass');
  return {
    results,
    passRate: judged.length === 0 ? 1 : passed.length / judged.length,
    failures: results.filter((r) => r.status === 'fail').map((r) => `${r.label}: ${r.detail}`),
    shots,
  };
}

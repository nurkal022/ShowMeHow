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
    const p1 = await s.shot();
    await s.wait(800);
    const p2 = await s.shot();
    if (p1.equals(p2)) {
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
    const unobservable: string[] = [];
    for (const c of sliders) {
      const stateBefore = await safe(() => s.evaluate<unknown>('window.__smh.state()'), null);
      const frameBefore = paused ? await s.shot() : null;
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
      const frameAfter = paused ? await s.shot() : null;
      const stateChanged = stateBefore !== null &&
        JSON.stringify(stateBefore) !== JSON.stringify(stateAfter);
      const frameChanged = !!frameBefore && !!frameAfter && !frameBefore.equals(frameAfter);
      if (frameAfter) shots.push(frameAfter);
      if (!stateChanged && !frameChanged) unobservable.push(c.label || c.name);
      // Возвращаем исходное значение, чтобы следующие пробы шли по нетронутой симуляции.
      if (typeof c.value === 'number') {
        await safe(
          () => s.evaluate<boolean>(
            `window.__smh.setControl(${JSON.stringify(c.name)}, ${c.value})`),
          false,
        );
      }
    }
    const newErrors = s.errors().slice(errorsBefore);
    if (newErrors.length > 0) {
      add('sliders', 'Слайдеры влияют на симуляцию', 'fail',
        'движение слайдера вызвало ошибку: ' + newErrors.join('; '));
    } else if (unobservable.length === sliders.length) {
      add('sliders', 'Слайдеры влияют на симуляцию', 'skip',
        'эффект слайдеров (' + unobservable.join(', ') +
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

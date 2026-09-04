# «Сначала демонстрация» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** убрать из интерфейса всё, что не касается показа явления на занятии (провайдеры, число кандидатов), и сделать так, чтобы симуляция открывалась спокойно и читаемо.

**Architecture:** конфигурация провайдера переезжает в переменные окружения, страница настроек и её API удаляются. Пайплайн всегда порождает одного кандидата: режим качества управляет глубиной доводки, а не числом вариантов, и пять «акцентов» сворачиваются в единое требование внутри `GENERATION_RULES`. Спокойный старт решается разгоном времени в `SimUI.speed`, правилом о начальных значениях в промптах планировщика и генератора, и правкой демок.

**Tech Stack:** Next.js 15 (App Router), TypeScript 6 (`strict`, `moduleResolution: bundler`), React 19, Playwright 1.61, Vitest 3, `openai` SDK 6.

**Spec:** `docs/superpowers/specs/2026-09-04-demonstration-first-design.md`

## Global Constraints

- Node ≥ 20. Гейты: `npx vitest run`, `npx tsc --noEmit`, `npm run build`.
- **Код внутри шаблонных строк рантайма и внутри демо-артефактов — строго ES5**: `var`, `function`, без стрелок, без `const`/`let`, без шаблонных строк, без `class`. Окружающий TypeScript — обычный современный TS. Исключение, уже присутствующее в двигателе, — обёртка `<script type="module">` для импорта three.js; код внутри неё остаётся в стиле ES5.
- Комментарии — русские, как в существующих файлах. Имена переменных и функций — английские. Строки, которые видит преподаватель или читает LLM, — русские.
- `instrument()` остаётся идемпотентным по маркеру `<!--showmehow-runtime-->`; `reinstrument()` остаётся ретроактивным.
- **Не запускать `npm run test:e2e`.** Набор красный с 3 падениями из 4 по причинам, возникшим до ветки `agent-2.0-phase-a` (проверено: 4 падения из 4 на точке ветвления, те же конфликты локаторов Playwright в strict-режиме). Он вне рамок этой работы.
- Начальное состояние: 273 теста зелёные, `tsc` чистый, сборка проходит.
- Коммит в конце каждой задачи, сообщение заканчивается строкой:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## Файловая структура

**Удаляются:**

| Файл | Почему |
|---|---|
| `src/app/settings/page.tsx` | страница настроек уходит из интерфейса |
| `src/app/api/settings/route.ts` | её API |
| `src/lib/candidate-defaults.ts` | число кандидатов больше не зависит от режима |
| `tests/unit/candidate-defaults.test.ts` | тест удалённого модуля |

**Изменяются:**

| Файл | Что |
|---|---|
| `src/lib/settings.ts` | синтез профиля из переменных окружения, приоритет над файлом |
| `src/components/NavLinks.tsx` | ссылка «Настройки» уходит |
| `src/app/globals.css` | блок `.settings*` уходит |
| `src/components/Workbench.tsx` | селектор кандидатов уходит, режим остаётся; `/api/settings` больше не запрашивается |
| `src/app/api/generate/route.ts` | `candidates` уходит из тела запроса |
| `src/lib/jobs.ts` | `candidates` уходит из `JobRequest` |
| `src/lib/types.ts` | `styleHint` уходит из события `candidate` |
| `src/lib/pipeline/run.ts` | `MODES` без `candidates`, один кандидат, `resolveCandidates` удаляется |
| `src/lib/pipeline/stages.ts` | `styleHint` уходит из сигнатур и событий |
| `src/lib/pipeline/prompts.ts` | `STYLE_HINTS`/`STYLE_NAMES` сворачиваются в `GENERATION_RULES`; правило о начальных значениях в `PLANNER_SYSTEM` и `GENERATION_RULES`; `SimUI.speed` обязателен |
| `src/lib/runtime/kit-widgets.ts` | разгон времени в `SimUI.speed` |
| `src/lib/runtime/doc.ts` | описание разгона |
| `src/lib/pipeline/probes.ts` | выдержка после пробы сброса |
| `src/components/progress/{deriveProgress.ts,CandidateCard.tsx,ProgressView.tsx}` | без `styleHint`, без короны победителя |
| `demos/engine/artifact.html`, `demos/engine/meta.json` | обороты 120, камера от аспекта |
| остальные девять `demos/*/artifact.html` | начальные значения, где цикл быстрее секунды |
| тесты: `run`, `stages`, `jobs`, `jobs-api`, `derive-progress`, `prompts`, `api`, `probes` | под новые сигнатуры |

---

### Task 1: Провайдеры уходят из интерфейса

**Files:**
- Delete: `src/app/settings/page.tsx`, `src/app/api/settings/route.ts`
- Modify: `src/lib/settings.ts`, `src/components/NavLinks.tsx`, `src/app/globals.css`, `src/components/Workbench.tsx`, `src/lib/pipeline/run.ts:makeCtx`, `src/app/api/generate/route.ts`
- Test: `tests/unit/settings.test.ts`, `tests/unit/api.test.ts`

**Interfaces:**
- Consumes: ничего из этого плана.
- Produces: `envProvider(): ProviderProfile | null` в `src/lib/settings.ts`; `activeProvider()` отдаёт профиль из переменных окружения, если он есть, иначе из файла.

- [ ] **Step 1: Написать падающий тест на конфигурацию из окружения**

В `tests/unit/settings.test.ts` добавить:

```ts
import { envProvider, activeProvider } from '@/lib/settings';

describe('провайдер из переменных окружения', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('нет ключа или модели -> null', () => {
    delete process.env.SHOWMEHOW_API_KEY;
    delete process.env.SHOWMEHOW_MODEL;
    expect(envProvider()).toBeNull();
    process.env.SHOWMEHOW_API_KEY = 'k';
    expect(envProvider()).toBeNull();
  });

  it('ключ и модель заданы -> профиль с дефолтным baseURL', () => {
    process.env.SHOWMEHOW_API_KEY = 'k';
    process.env.SHOWMEHOW_MODEL = 'm';
    delete process.env.SHOWMEHOW_BASE_URL;
    delete process.env.SHOWMEHOW_VISION_MODEL;
    const p = envProvider()!;
    expect(p.apiKey).toBe('k');
    expect(p.generationModel).toBe('m');
    expect(p.baseURL).toBe('https://api.openai.com/v1');
    expect(p.visionModel).toBe('');
  });

  it('все переменные заданы -> все поля из окружения', () => {
    process.env.SHOWMEHOW_API_KEY = 'k';
    process.env.SHOWMEHOW_MODEL = 'gen';
    process.env.SHOWMEHOW_BASE_URL = 'http://local/v1';
    process.env.SHOWMEHOW_VISION_MODEL = 'vis';
    const p = envProvider()!;
    expect(p.baseURL).toBe('http://local/v1');
    expect(p.visionModel).toBe('vis');
  });

  it('окружение побеждает settings.json', () => {
    process.env.SHOWMEHOW_API_KEY = 'k';
    process.env.SHOWMEHOW_MODEL = 'from-env';
    const fromFile = {
      activeProviderId: 'a', qualityMode: 'max' as const,
      providers: [{ id: 'a', name: 'file', baseURL: 'http://file/v1', apiKey: 'f',
        generationModel: 'from-file', visionModel: '' }],
    };
    expect(activeProvider(fromFile)!.generationModel).toBe('from-env');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/settings.test.ts`
Expected: FAIL — `envProvider` не экспортирован.

- [ ] **Step 3: Реализовать конфигурацию из окружения**

В `src/lib/settings.ts` добавить перед `activeProvider`:

```ts
/**
 * Профиль из переменных окружения. Основной путь настройки после того, как
 * страница настроек убрана из интерфейса: Next.js подхватывает .env.local сам.
 * Требуются как минимум ключ и модель генерации — без них профиль не имеет смысла.
 */
export function envProvider(): ProviderProfile | null {
  const apiKey = process.env.SHOWMEHOW_API_KEY;
  const generationModel = process.env.SHOWMEHOW_MODEL;
  if (!apiKey || !generationModel) return null;
  return {
    id: 'env',
    name: 'Из переменных окружения',
    baseURL: process.env.SHOWMEHOW_BASE_URL || 'https://api.openai.com/v1',
    apiKey,
    generationModel,
    visionModel: process.env.SHOWMEHOW_VISION_MODEL || '',
  };
}
```

и заменить `activeProvider`:

```ts
/**
 * Окружение побеждает файл: развёртывание задаётся переменными, а data/settings.json
 * остаётся запасным путём для ручной правки и per-role настроек.
 */
export function activeProvider(s: Settings = loadSettings()): ProviderProfile | null {
  return envProvider() ?? s.providers.find((p) => p.id === s.activeProviderId) ?? null;
}
```

- [ ] **Step 4: Удалить страницу, её API и ссылку**

```bash
rm -rf src/app/settings src/app/api/settings
```

В `src/components/NavLinks.tsx` убрать из `LINKS` строку `{ href: '/settings', label: 'Настройки' },`.

В `src/app/globals.css` удалить весь блок правил `.settings*` (`.settings`, `.settings .field`, `.settings .field span`, `.settings input`/`select`, `.settings .provider`, `.settings .radio`, `.settings-actions`, `.settings button` и его модификаторы) и упоминание `.settings` в медиазапросе.

В `src/components/Workbench.tsx` удалить весь `useEffect`, который делает `fetch('/api/settings')` и подставляет `qualityMode` — режим по умолчанию задаётся начальным состоянием `useState<QualityMode>('max')`.

В `tests/unit/api.test.ts` удалить блок `describe('settings api', …)`.

- [ ] **Step 5: Переписать сообщение об отсутствии провайдера**

В `src/lib/pipeline/run.ts`, в `makeCtx`, заменить текст ошибки:

```ts
  if (!p) {
    throw new Error(
      'Провайдер не настроен. Задайте SHOWMEHOW_API_KEY и SHOWMEHOW_MODEL ' +
      '(при необходимости SHOWMEHOW_BASE_URL и SHOWMEHOW_VISION_MODEL) в файле .env.local ' +
      'и перезапустите сервер.',
    );
  }
```

Тот же текст — в `src/app/api/generate/route.ts`, где проверяется `activeProvider()` перед созданием job. Вынести его в экспортируемую константу `NO_PROVIDER_MESSAGE` в `src/lib/settings.ts` и использовать в обоих местах, чтобы формулировка не разъезжалась.

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: зелёные. `/settings` отдаёт 404 — маршрута нет.

```bash
git add -A
git commit -m "feat: configure provider via env, drop settings UI

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Один кандидат вместо перебора

**Files:**
- Delete: `src/lib/candidate-defaults.ts`, `tests/unit/candidate-defaults.test.ts`
- Modify: `src/lib/pipeline/run.ts`, `src/lib/pipeline/stages.ts`, `src/lib/types.ts`, `src/lib/jobs.ts`, `src/app/api/generate/route.ts`, `src/components/Workbench.tsx`
- Test: `tests/unit/{run,stages,jobs,jobs-api}.test.ts`

**Interfaces:**
- Consumes: Task 1 (сообщение о провайдере уже вынесено в константу).
- Produces: `MODES: Record<QualityMode, { useJudge: boolean; maxRefine: number; threshold: number }>`; `generateCandidate(ctx, spec, exemplar?)` без `styleHint`; `verifyCandidate(ctx, spec, html, index)` без `styleName`; событие `candidate` без поля `styleHint`.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/run.test.ts` добавить:

```ts
describe('один кандидат', () => {
  it('генерируется ровно один кандидат в любом режиме', async () => {
    for (const mode of ['fast', 'standard', 'max'] as const) {
      const c = ctx();
      await runPipeline(c, { prompt: 'тест', mode });
      const gen = (c.chat as ReturnType<typeof vi.fn>).mock.calls
        .filter((call) => call[0] === 'generator');
      expect(gen, `режим ${mode}`).toHaveLength(1);
    }
  });

  it('MODES больше не содержит числа кандидатов', () => {
    for (const m of Object.values(MODES)) {
      expect(m).not.toHaveProperty('candidates');
    }
  });

  it('событие candidate не несёт styleHint', async () => {
    const c = ctx();
    await runPipeline(c, { prompt: 'тест', mode: 'fast' });
    const events = (c.emit as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    for (const e of events.filter((x) => x.type === 'candidate')) {
      expect(e).not.toHaveProperty('styleHint');
    }
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/run.test.ts`
Expected: FAIL — в режимах `standard` и `max` генератор вызывается 2 и 3 раза.

- [ ] **Step 3: Свернуть режимы к одному кандидату**

В `src/lib/pipeline/run.ts` заменить `MODES` и удалить `resolveCandidates`:

```ts
/**
 * Режим задаёт глубину полировки, а не число вариантов: кандидат всегда один.
 * Перебор акцентов был механизмом разнообразия, но хорошая учебная симуляция
 * обязана быть точной, наглядной и интерактивной одновременно — теперь этого
 * требуют от единственного кандидата сразу (см. GENERATION_RULES).
 */
export const MODES: Record<QualityMode, {
  useJudge: boolean; maxRefine: number; threshold: number;
}> = {
  fast: { useJudge: false, maxRefine: 0, threshold: 0 },
  standard: { useJudge: true, maxRefine: 1, threshold: 0 },
  max: { useJudge: true, maxRefine: 3, threshold: 8 },
};
```

Удалить импорт `CANDIDATE_DEFAULTS` и функцию `resolveCandidates` целиком.

В `runPipeline` заменить блок генерации кандидатов (весь `Promise.all(hints.map(...))` вместе с массивами `hints`/`styleNames`) на одиночную генерацию:

```ts
  emitStage(ctx, 'generating', 'start');
  let candidate: CandidateResult | null = null;
  try {
    checkCancelled();
    ctx.emit({ type: 'candidate', index: 0, status: 'generating' });
    try {
      const html = await generateCandidate(ctx, spec, exemplarHtml);
      candidate = await verifyCandidate(ctx, spec, html, 0);
    } catch {
      ctx.emit({ type: 'candidate', index: 0, status: 'failed' });
      candidate = null;
    }
  } finally {
    // Отмена не должна оставить висящий stage-start: без end чип таймлайна
    // пульсировал бы вечно.
    emitStage(ctx, 'generating', 'end');
  }
```

Дальнейшую логику отбора заменить: `alive`/`aliveIndices` больше не нужны.

```ts
  let best: CandidateResult;
  let feedback = '';

  if (!candidate || !candidate.alive) {
    // Кандидат один: подстраховки «возьмём другого» больше нет. Сломанный
    // сохраняем best-effort, но заражённый запрещённым CDN — никогда.
    if (!candidate) throw new Error('Не удалось сгенерировать кандидата.');
    if (findForbiddenUrls(candidate.html, CDN_ALLOWED).length > 0) {
      throw new Error('Кандидат содержит запрещённые внешние ресурсы.');
    }
    const msg = 'Кандидат завершился с ошибками — сохранён как есть.';
    warnings.push(msg);
    ctx.emit({ type: 'warning', message: msg });
    best = candidate;
  } else if (mode.useJudge && ctx.hasVision) {
    …
  } else {
    best = candidate;
  }
```

Внутри ветки судьи `best = alive[verdict.winnerIndex]` заменить на `best = candidate;`, `bestOrigIndex` удалить (индекс всегда 0), `candidateIndices` в событии `judge-verdict` — `[0]`. В цикле доводки `verifyCandidate(ctx, spec, refined, bestOrigIndex, styleNames[...])` заменить на `verifyCandidate(ctx, spec, refined, 0)`.

- [ ] **Step 4: Убрать styleHint из сигнатур, событий и промптов**

Акценты удаляются здесь, а не в задаче 4, потому что без этого шага код не компилируется: `run.ts` импортирует `STYLE_HINTS`/`STYLE_NAMES`, а `generateCandidate` передаёт акцент в `generatorSystem`. Задача 4 добавит новый текст правил в уже очищенный файл.

В `src/lib/types.ts` в варианте события `candidate` удалить поле `styleHint`:

```ts
  | { type: 'candidate'; index: number;
      status: 'generating' | 'rendering' | 'fixing' | 'critiquing' | 'ok' | 'failed' }
```

В `src/lib/pipeline/prompts.ts`:
- удалить `STYLE_HINTS` и `STYLE_NAMES` целиком;
- `generatorSystem(styleHint: string, exemplar?: string)` → `generatorSystem(exemplar?: string)`, из тела убрать интерполяцию `${styleHint}`.

В `src/lib/pipeline/stages.ts`:
- `generateCandidate(ctx, spec, styleHint, exemplar?)` → `generateCandidate(ctx, spec, exemplar?)`, вызов `generatorSystem(styleHint, exemplar)` → `generatorSystem(exemplar)`.
- `verifyCandidate(ctx, spec, html, index, styleName)` → `verifyCandidate(ctx, spec, html, index)`; во всех `ctx.emit({ type: 'candidate', … })` убрать `styleHint`.

В `tests/unit/prompts.test.ts` и `tests/unit/stages.test.ts` обновить вызовы `generatorSystem(...)` и `generateCandidate(...)` под новые сигнатуры; тесты, утверждающие про пять акцентов (`has exactly 5 style hints`, `STYLE_NAMES has 5 entries…`), удалить — проверяемого поведения больше нет.

Удалить модуль числа кандидатов:

```bash
rm src/lib/candidate-defaults.ts tests/unit/candidate-defaults.test.ts
```

- [ ] **Step 5: Убрать кандидатов из API, job и клиента**

В `src/app/api/generate/route.ts`: убрать `candidates` из разбора тела, из `GenerateInput`, из вызова `createJob` и из вызова `runPipeline`. Удалить импорт `resolveCandidates`.

В `src/lib/jobs.ts`: убрать поле `candidates` из `JobRequest`.

В `src/components/Workbench.tsx`: удалить состояние `candidates`, его `useState`, обработчик в `onModeChange`, второй `<select aria-label="Число кандидатов">` целиком и поле `candidates` из тела `POST /api/generate`. Импорт `CANDIDATE_DEFAULTS` удалить. `onModeChange` сводится к `setMode`.

В `tests/unit/{jobs,jobs-api}.test.ts` убрать `candidates` из фикстур `JobRequest`.

- [ ] **Step 6: Обновить UI прогресса**

В `src/components/progress/deriveProgress.ts` убрать `styleHint` из `CandidateInfo` и из обработчика события `candidate`. Поле `isWinner` оставить — событие `judge-verdict` его по-прежнему выставляет, но в UI корона больше не рисуется (кандидат один).

В `src/components/progress/CandidateCard.tsx` убрать из заголовка вывод акцента и корону победителя: заголовок становится просто «Кандидат». В `ProgressView.tsx` убрать заголовок-счётчик кандидатов, если он есть.

В `tests/unit/derive-progress.test.ts` убрать `styleHint` из событий-фикстур и утверждения о нём.

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat: single candidate, mode controls polish depth only

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Разгон времени в `SimUI.speed`

**Files:**
- Modify: `src/lib/runtime/kit-widgets.ts`, `src/lib/runtime/doc.ts`, `src/lib/pipeline/probes.ts`
- Test: `tests/unit/artifact.test.ts`, `tests/unit/probes.test.ts`

**Interfaces:**
- Consumes: `SimUI.speed({values, value, onChange}) → {get()}` (существует).
- Produces: `get()` возвращает `value * warm`, где `warm` идёт от 0 к 1 по косинусу за `WARMUP_MS`; `SimUI.speed` дополнительно возвращает `restart()` для перезапуска разгона, который кит сам вызывает по «Сбросу».

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/artifact.test.ts` добавить браузерный тест по образцу теста графика:

```ts
describe('разгон времени в SimUI.speed', () => {
  const WARM_DEMO = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>warm</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{position:fixed;top:0;left:0}</style>
</head><body><canvas id="c"></canvas><script>
(function () {
  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var st = { t: 0 }, running = true, last = null;
  function resetSim() { st = { t: 0 }; }
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  SimUI.title('Разгон');
  var sp = SimUI.speed({ values: [1], value: 1 });
  SimUI.playPause({ onPlay: function () { running = true; last = null; },
    onPause: function () { running = false; }, onReset: resetSim });
  SimUI.expose({ getState: function () { return { t: st.t }; }, reset: resetSim });
  function loop(now) {
    if (last == null) last = now;
    var dt = Math.min(0.05, (now - last) / 1000) * sp.get();
    last = now;
    if (running) st.t += dt;
    ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#4f8ff7'; ctx.fillRect((st.t * 60) % 400, 40, 30, 30);
    requestAnimationFrame(loop);
  }
  addEventListener('resize', resize); resize(); requestAnimationFrame(loop);
})();
</script></body></html>`;

  it('первые кадры идут медленнее установившегося темпа', async () => {
    const s = await openSession(instrument(WARM_DEMO));
    try {
      await s.wait(300);
      const early = await s.evaluate<{ t: number }>('window.__smh.state()');
      await s.wait(2000);
      const late = await s.evaluate<{ t: number }>('window.__smh.state()');
      // За первые 300 мс разгона накопится заметно меньше, чем 300 мс модельного
      // времени; после разгона множитель ровно 1, поэтому за 2 с прибавится ~2 с.
      expect(early.t).toBeLessThan(0.2);
      expect(late.t - early.t).toBeGreaterThan(1.7);
      expect(s.errors()).toEqual([]);
    } finally {
      await s.close();
    }
  }, 60000);
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — без разгона за первые 300 мс накопится ≈0.3 с, что больше 0.2.

- [ ] **Step 3: Реализовать разгон**

В `src/lib/runtime/kit-widgets.ts`, внутри `speed(o)`, перед `return`:

```js
    // Разгон: симуляция открывается неподвижной и за WARMUP_MS выходит на
    // выбранный множитель по косинусу. Инструмент нужен для показа на занятии,
    // а рывок с первого кадра читается как сбой, а не как начало демонстрации.
    var WARMUP_MS = 900;
    var startedAt = null;
    function warm() {
      if (startedAt == null) startedAt = (window.performance && performance.now) ?
        performance.now() : Date.now();
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      var k = (now - startedAt) / WARMUP_MS;
      if (k >= 1) return 1;
      if (k <= 0) return 0;
      return 0.5 - 0.5 * Math.cos(Math.PI * k);
    }
```

и заменить возвращаемый объект:

```js
    return {
      get: function () { return cur * warm(); },
      restart: function () { startedAt = null; },
    };
```

Кит сам перезапускает разгон по «Сбросу». В `kit-core.ts`, в `playPause(o)`, в обработчике кнопки сброса добавить оповещение, а в `kit-widgets.ts` — подписку. Проще всего через общий реестр: в `speed()` зарегистрировать контрол с `kind: 'speed'`, у которого есть `restart`, и в `kit-core.ts` в `b2.onclick` перед `o.onReset()` пройти по `controls` и вызвать `restart`, если он есть:

```js
    b2.onclick = function () {
      for (var i = 0; i < controls.length; i++) {
        if (controls[i].restart) controls[i].restart();
      }
      o.onReset();
    };
```

В регистрацию контрола в `speed()` добавить `restart: function () { startedAt = null; }`.

- [ ] **Step 4: Закрыть взаимодействие с пробой слайдеров**

Проба сброса кликает «Сброс» и тем самым перезапускает разгон; идущая следом проба слайдеров сравнивает темп за два окна и приняла бы разгон за эффект слайдера. В `src/lib/pipeline/probes.ts`, сразу после блока пробы `reset` и перед блоком `sliders`, добавить выдержку:

```ts
  // «Сброс» перезапускает разгон времени в SimUI.speed. Проба слайдеров ниже
  // сравнивает темп за два соседних окна — окно, попавшее на разгон, дало бы
  // расхождение само по себе. Пережидаем разгон целиком.
  await s.wait(1100);
```

- [ ] **Step 5: Описать в документации кита**

В `src/lib/runtime/doc.ts` заменить строку про `SimUI.speed`:

```
- SimUI.speed({values:[0.25,0.5,1,2], value:1}) -> {get()} — ОБЯЗАТЕЛЕН. Множитель dt.
    Первую секунду get() плавно разгоняется от нуля: симуляция открывается спокойно,
    а не рывком. Умножай dt на get() в каждом кадре.
```

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`
Expected: зелёные, включая демо-гейт и пробы (обе демки используют `SimUI.speed`).

```bash
git add -A
git commit -m "feat(kit): ease time in on open so simulations start calm

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Правила о начальных значениях и свёрнутые акценты

**Files:**
- Modify: `src/lib/pipeline/prompts.ts`
- Test: `tests/unit/prompts.test.ts`

**Interfaces:**
- Consumes: Task 2 — `STYLE_HINTS`/`STYLE_NAMES` уже удалены, `generatorSystem(exemplar?)` уже без акцента. Эта задача только добавляет текст правил.
- Produces: `GENERATION_RULES` содержит требование наблюдаемости, четыре качества сразу и обязательность `SimUI.speed`; `PLANNER_SYSTEM` требует демонстрационных начальных значений.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/prompts.test.ts` заменить тесты, ссылающиеся на `STYLE_HINTS`/`STYLE_NAMES`, на:

```ts
describe('демонстрационные начальные значения', () => {
  it('планировщик требует наблюдаемого масштаба времени', () => {
    expect(P.PLANNER_SYSTEM).toContain('1-10');
    expect(P.PLANNER_SYSTEM.toLowerCase()).toContain('демонстрац');
  });
  it('правила генерации требуют наблюдаемости и обязательного SimUI.speed', () => {
    expect(P.GENERATION_RULES).toContain('SimUI.speed');
    expect(P.GENERATION_RULES).toContain('1-10');
  });
  it('правила требуют всех четырёх качеств сразу, а не одного акцента', () => {
    const r = P.GENERATION_RULES.toLowerCase();
    for (const q of ['точн', 'наглядн', 'интерактив', 'приборы']) {
      expect(r, `нет требования «${q}»`).toContain(q);
    }
  });
  it('акценты удалены', () => {
    expect(P).not.toHaveProperty('STYLE_HINTS');
    expect(P).not.toHaveProperty('STYLE_NAMES');
  });
  it('каркас демонстрирует разгон через speed.get()', () => {
    expect(P.EXAMPLE_SKELETON).toContain('speed.get()');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/prompts.test.ts`
Expected: FAIL — `STYLE_HINTS` ещё экспортируется, требований о масштабе времени нет.

- [ ] **Step 3: Удалить акценты и усилить правила**

В `GENERATION_RULES` добавить перед строкой про русский язык:

```
- Симуляция обязана быть одновременно физически ТОЧНОЙ (уравнения и величины по
  спецификации), НАГЛЯДНОЙ (крупные элементы, цветовое кодирование, подписи),
  ИНТЕРАКТИВНОЙ (параметры реально меняют картину) и снабжённой ПРИБОРАМИ (живой
  график и численные показания). Это не выбор из четырёх, а четыре требования сразу.
- НАБЛЮДАЕМОСТЬ: при начальных значениях характерное время явления — секунды.
  Полный период, цикл или проход укладывается примерно в 1-10 с. Если естественная
  величина быстрая (рабочие обороты двигателя, частота волны), по умолчанию ставь
  ДЕМОНСТРАЦИОННОЕ значение, а реальное оставь достижимым слайдером и пресетами.
- SimUI.speed обязателен, и dt каждый кадр умножается на speed.get(): кит через него
  плавно разгоняет симуляцию при открытии.
- КОМПОЗИЦИЯ: объект целиком помещается в кадр и на широком экране, и на узком.
  Для 3D дистанцию камеры считай от соотношения сторон, не фиксируй числом.
```

В `PLANNER_SYSTEM` добавить в конец блока требований:

```
Начальные значения parameters[].value выбирай ДЕМОНСТРАЦИОННЫМИ: при них полный период,
цикл или проход явления должен занимать примерно 1-10 секунд, чтобы студент успевал
следить. Реальные рабочие величины оставляй достижимыми через min/max и пресеты.
```

- [ ] **Step 4: Обновить README**

В `README.md`: раздел про настройку переписать под `.env.local` с четырьмя переменными вместо «Откройте Настройки → добавьте провайдера»; из описания пайплайна убрать «1-3 кандидата» и селектор «Кандидатов», заменив на «один кандидат, доводимый до порога качества»; описание режимов переформулировать как глубину доводки.

- [ ] **Step 5: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(prompts): demand watchable defaults, fold accents into one bar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Демки открываются спокойно

**Files:**
- Modify: `demos/engine/artifact.html`, остальные девять `demos/*/artifact.html` по результатам проверки
- Test: `tests/integration/demos.test.ts`

**Interfaces:**
- Consumes: Task 3 (разгон в `SimUI.speed`).
- Produces: демки, у которых характерный цикл при начальных значениях не быстрее секунды.

- [ ] **Step 1: Измерить, что происходит при открытии**

Для каждой демки открыть `openSession(instrument(html))`, подождать 2 с и снять `window.__smh.state()` дважды с интервалом 1 с. Записать в отчёт, за сколько секунд проходит характерный цикл: для двигателя — оборот коленвала, для маятника — период, для волновых — период колебания, для орбитальных — оборот.

Демки без `SimUI.expose` (все, кроме двигателя и маятника) состояние не отдают — для них оценить по коду: найти начальное значение основного параметра и посчитать характерное время аналитически. Записать вывод по каждой из десяти.

- [ ] **Step 2: Двигатель — обороты и камера**

В `demos/engine/artifact.html` заменить начальное значение оборотов:

```js
  var rpm = 120;             // об/мин, слайдер; демонстрационное значение —
                             // полный цикл около секунды, такт различим глазом
```

и в `SimUI.slider` для `rpm` заменить `value: rpm` остаётся как есть (берёт новое значение), но убедиться, что `min: 60` по-прежнему ниже дефолта.

Камера: заменить фиксированную дистанцию на расчёт от аспекта. В `updateCamera` и в обработчиках пресетов ракурса заменить `var Rc = 5.4;` на:

```js
      // Дистанция от пропорций окна: на широком и коротком экране объект
      // иначе обрезается сверху.
      var aspect = window.innerWidth / Math.max(1, window.innerHeight);
      var Rc = 5.4 * Math.max(1, 1.15 / Math.min(aspect, 1.6));
```

Проверить визуально на 1440×900 и 390×844, что цилиндр целиком в кадре.

- [ ] **Step 3: Поправить демки, где цикл быстрее секунды**

По результатам Step 1 поднять начальные значения там, где явление пролетает быстрее секунды. Не менять `min`/`max` — только `value` и соответствующую переменную в коде. Каждое изменение сопроводить комментарием, почему выбрано это значение.

Если по итогам замера правки не нужны ни одной демке, кроме двигателя, — записать это в отчёт явно, с числами.

- [ ] **Step 4: Прогнать демо-гейт**

Run: `npx vitest run tests/integration/demos.test.ts`
Expected: десять демок рендерятся, анимируются и проходят пробы без провалов.

Проба `animates` сравнивает кадры на 0.3/1.2/3.0 с. Разгон длится 0.9 с, поэтому первый кадр снимается на медленном ходу — на общий вердикт это не влияет, так как сравниваются и первый с последним. Если какая-то демка стала проваливать `animates` из-за того, что теперь слишком медленная, это настоящая находка: значит начальное значение занижено. Поднять его, а не ослаблять пробу.

- [ ] **Step 5: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add -A
git commit -m "feat(demos): watchable defaults on open, aspect-aware engine camera

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Приёмка

- [ ] `npx vitest run` — зелёные.
- [ ] `npx tsc --noEmit` — без вывода.
- [ ] `npm run build` — успешно.
- [ ] В шапке нет «Настроек»; `/settings` отдаёт 404.
- [ ] Генерация без переменных окружения даёт сообщение, называющее `SHOWMEHOW_API_KEY` и `SHOWMEHOW_MODEL`.
- [ ] В композере остался один селектор — режим качества, по умолчанию «Максимум».
- [ ] Двигатель при открытии: движение начинается плавно, такт держится около секунды, цилиндр целиком в кадре и на 1440×900, и на 390×844.
- [ ] `README.md` обновлён: раздел про настройку провайдера описывает `.env.local`, упоминание числа кандидатов убрано.

# Агент 2.0, фаза A: кит и надёжность — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** поднять потолок качества генерации: дать модели богатый UI-kit (графики, показания, формулы, баннер фазы, пресеты), детерминированную проверку поведения артефакта (пробы) и надёжный вывод LLM (max_tokens, продолжение при обрыве, модели по ролям).

**Architecture:** `src/lib/runtime.ts` разбивается на модули `src/lib/runtime/*`; UI-kit собирается конкатенацией ES5-чанков (`KIT_CORE_JS` + виджеты + мост интроспекции). Рантайм получает мост `window.__smh`, через который headless-сессия Playwright гоняет пробы (пауза, сброс, слайдеры, NaN, CDN). Промпты собираются из одного блока `GENERATION_RULES`, общего для генератора, фиксера и рефайнера, и включают ближайший эталон из `demos/` целиком. Провайдер-слой получает роли (планировщик/генератор/фиксер/критик/судья/рефайнер) с отдельными моделями, `max_tokens` и склейкой оборванных ответов.

**Tech Stack:** Next.js 15 (App Router), TypeScript 6 (`strict`, `moduleResolution: bundler`), React 19, Playwright 1.61 (Chromium), Vitest 3, `openai` SDK 6 (любой OpenAI-совместимый baseURL).

**Spec:** `docs/superpowers/specs/2026-09-03-agent-upgrade-design.md` (фаза A из §5; компоненты §3.1, §3.3, §3.4 без ассертов, §3.5)

## Global Constraints

- **Node ≥ 20** (`package.json` engines). Тесты: `npx vitest run`. Типы: `npx tsc --noEmit`. Сборка: `npm run build`. E2E: `npm run test:e2e`.
- **Код рантайма (всё, что попадает внутрь артефакта) — строго ES5**: `var`, `function`, без стрелок, без `const/let`, без шаблонных строк, без `class`, без `??`/`?.`. Артефакт исполняется как есть в `<iframe sandbox="allow-scripts">` и в headless-Chromium.
- **Язык интерфейса и подписей — русский.** Комментарии в коде — русские, как в существующих файлах. Имена переменных и функций — английские.
- **Артефакт остаётся самодостаточным HTML-файлом.** Внешние ресурсы — только из `CDN_WHITELIST`. Никаких `fetch`/`XHR`/`WebSocket` в артефакте.
- **`instrument()` остаётся идемпотентным** по маркеру `<!--showmehow-runtime-->`, а `reinstrument()` — ретроактивным: правка рантайма обязана применяться к уже сохранённым симуляциям при чтении.
- **Существующие 197 юнит-тестов должны остаться зелёными** после каждой задачи, кроме явно перечисленных в задаче изменений тестов.
- **Playwright Chromium должен быть установлен**: `npx playwright install chromium`. Без него падают `tests/unit/renderer.test.ts` и `tests/integration/demos.test.ts`.
- **Коммит после каждой задачи**, сообщение в стиле репозитория (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`), текст — русский или английский, как в соседних коммитах.

---

## Файловая структура

**Создаются:**

| Файл | Ответственность |
|---|---|
| `src/lib/cdn.ts` | `CDN_WHITELIST` и `allowedPrefixes()` — единственный источник правды по разрешённым URL; не зависит ни от чего (разрывает цикл renderer→prompts). |
| `src/lib/runtime/harness.ts` | `HARNESS_JS` — перехват ошибок, мост `postMessage` (пауза/пуск/сброс из родителя). |
| `src/lib/runtime/kit-css.ts` | `UIKIT_CSS` — стили панели, углов, сворачивания и всех виджетов. |
| `src/lib/runtime/kit-core.ts` | `KIT_CORE_JS` — панель управления, угловые контейнеры, слой сворачивания, `title/slider/playPause/panel`, реестр контролов. |
| `src/lib/runtime/kit-chart.ts` | `KIT_CHART_JS` — `SimUI.chart`: живой график на canvas (оси, сетка, легенда, автомасштаб, режимы `time`/`xy`). |
| `src/lib/runtime/kit-widgets.ts` | `KIT_WIDGETS_JS` — `readout/formula/banner/legend/select/toggle/button/presets/speed/goals`. |
| `src/lib/runtime/kit-expose.ts` | `KIT_EXPOSE_JS` — `SimUI.expose` и мост интроспекции `window.__smh` для проб. |
| `src/lib/runtime/doc.ts` | `UIKIT_DOC` — справочник API кита для системного промпта генератора. |
| `src/lib/runtime/index.ts` | Сборка `UIKIT_JS` из чанков + реэкспорт `HARNESS_JS`/`UIKIT_CSS`/`UIKIT_DOC`. Точка импорта `@/lib/runtime` не меняется. |
| `src/lib/pipeline/probes.ts` | `runProbes(session)` → `ProbeReport`: детерминированные поведенческие пробы без LLM. |
| `src/lib/roles.ts` | `Role`, `resolveRole(profile, role)` — модель/температура/`max_tokens`/`extraBody` на роль. |
| `src/lib/exemplars.ts` | `scoreExemplar`, `pickExemplar` — детерминированный подбор эталонной демки под спецификацию. |
| `tests/fixtures/probe-*.html` | Фикстуры под каждый режим отказа проб. |
| `tests/unit/probes.test.ts`, `tests/unit/roles.test.ts`, `tests/unit/exemplars.test.ts` | Юниты новых модулей. |
| `tests/integration/kit.test.ts` | Дымовой тест: артефакт, использующий каждый примитив SimUI 2.0, рендерится без ошибок и проходит пробы. |

**Изменяются:**

| Файл | Что |
|---|---|
| `src/lib/renderer.ts` | Сессионный API (`openSession`), блокировка сети вне whitelist, `renderArtifact` поверх сессии, `probes` в отчёте. |
| `src/lib/artifact.ts` | Инжект importmap для three; guard от двойного importmap. |
| `src/lib/pipeline/prompts.ts` | `GENERATION_RULES`, новый `EXAMPLE_SKELETON`, эталон в промпте генератора, снятие противоречия по chart.js. |
| `src/lib/pipeline/stages.ts` | `Ctx.chat(role, …)`, пробы в `verifyCandidate`, severity критика, целевая починка. |
| `src/lib/pipeline/run.ts`, `judge.ts` | Переход на `ctx.chat(role, …)`, события `usage`/`probe-report`/`targeted-fix`. |
| `src/lib/provider.ts` | `max_tokens`, склейка при `finish_reason: 'length'`, телеметрия usage. |
| `src/lib/types.ts` | `ProviderProfile.roles`, `CriticIssue`, `PipelineEvent` +3 типа, `RenderReport.probes`. |
| `src/lib/demos.ts` | Поля `mode/libs/keywords/techniques/exemplar` в `DemoEntry`. |
| `src/components/progress/deriveProgress.ts`, `CandidateCard.tsx` | Отображение проб и токенов. |
| `demos/engine/*`, `demos/pendulum/*` | Переписаны на SimUI 2.0 (эталоны). |
| `tests/unit/{artifact,stages,run,judge,renderer}.test.ts`, `tests/integration/demos.test.ts` | Обновления под новые сигнатуры и расширенный гейт. |

---

### Task 1: Разбить `runtime.ts` на модули `runtime/`

Чистый рефактор без изменения поведения: содержимое строк переносится дословно, точка импорта `@/lib/runtime` сохраняется. Это подготовка — все следующие задачи добавляют чанки в кит.

**Files:**
- Create: `src/lib/runtime/harness.ts`, `src/lib/runtime/kit-css.ts`, `src/lib/runtime/kit-core.ts`, `src/lib/runtime/doc.ts`, `src/lib/runtime/index.ts`
- Delete: `src/lib/runtime.ts`
- Test: `tests/unit/artifact.test.ts` (дополняется)

**Interfaces:**
- Consumes: ничего.
- Produces: `HARNESS_JS: string`, `UIKIT_CSS: string`, `UIKIT_DOC: string`, `UIKIT_JS: string` из `@/lib/runtime`; `KIT_CORE_JS: string` из `@/lib/runtime/kit-core`.

- [ ] **Step 1: Написать падающий тест на состав модулей**

В конец `tests/unit/artifact.test.ts` добавить:

```ts
describe('runtime module layout', () => {
  it('UIKIT_JS собирается из чанков и включает ядро кита', async () => {
    const { KIT_CORE_JS } = await import('@/lib/runtime/kit-core');
    expect(UIKIT_JS).toContain(KIT_CORE_JS);
  });
  it('HARNESS_JS живёт в отдельном модуле', async () => {
    const { HARNESS_JS } = await import('@/lib/runtime/harness');
    expect(HARNESS_JS).toContain('sim-error');
  });
  it('UIKIT_CSS живёт в отдельном модуле', async () => {
    const mod = await import('@/lib/runtime/kit-css');
    expect(mod.UIKIT_CSS).toContain('.sim-panel');
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что он падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — `Cannot find module '@/lib/runtime/kit-core'`.

- [ ] **Step 3: Разнести содержимое по модулям**

```bash
mkdir -p src/lib/runtime
```

`src/lib/runtime/harness.ts` — перенести дословно блок `HARNESS_JS` из `src/lib/runtime.ts` (строки 1-20) вместе с JSDoc-комментарием.

`src/lib/runtime/kit-css.ts` — перенести дословно блок `UIKIT_CSS` (строки 22-91).

`src/lib/runtime/kit-core.ts` — перенести блок `UIKIT_JS` (строки 93-264), **переименовав экспорт** в `KIT_CORE_JS`:

```ts
/** Ядро UI-kit'а: панель управления, углы, сворачивание, базовые контролы. */
export const KIT_CORE_JS = `
window.SimUI = (function () {
  … (тело без изменений) …
})();

(function () {
  … (слой сворачивания без изменений) …
})();
`;
```

`src/lib/runtime/doc.ts` — перенести дословно блок `UIKIT_DOC` (строки 266-279).

`src/lib/runtime/index.ts`:

```ts
export { HARNESS_JS } from './harness';
export { UIKIT_CSS } from './kit-css';
export { UIKIT_DOC } from './doc';
import { KIT_CORE_JS } from './kit-core';

/**
 * Полный JS UI-kit'а. Собирается конкатенацией ES5-чанков: ядро, затем виджеты
 * и мост интроспекции (добавляются следующими задачами). Порядок важен —
 * виджеты обращаются к уже созданному window.SimUI.
 */
export const UIKIT_JS = [KIT_CORE_JS].join('\n');
```

```bash
rm src/lib/runtime.ts
```

- [ ] **Step 4: Проверить тесты и типы**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 200 passed, tsc без вывода. Импорты `@/lib/runtime` в `src/lib/artifact.ts:1` и `src/lib/pipeline/prompts.ts:1` продолжают работать (`moduleResolution: bundler` резолвит директорию в `index.ts`).

- [ ] **Step 5: Коммит**

```bash
git add src/lib/runtime tests/unit/artifact.test.ts && git rm -q --cached src/lib/runtime.ts 2>/dev/null; git add -A
git commit -m "refactor: split runtime.ts into runtime/ modules

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Реестр контролов и мост интроспекции `window.__smh`

Кит начинает вести список созданных контролов, а `SimUI.expose` даёт симуляции объявить своё состояние. Через `window.__smh` эту информацию читает headless-сессия — это фундамент всех проб.

**Files:**
- Modify: `src/lib/runtime/kit-core.ts`
- Create: `src/lib/runtime/kit-expose.ts`
- Modify: `src/lib/runtime/index.ts`, `src/lib/runtime/doc.ts`
- Test: `tests/unit/artifact.test.ts`

**Interfaces:**
- Consumes: `KIT_CORE_JS` (Task 1).
- Produces: `KIT_EXPOSE_JS: string`. В артефакте: `SimUI.__register(ctl)`, `SimUI.__controls()`, `SimUI.__set(name, value)`, `SimUI.__panel()`, `SimUI.expose({getState, setParam, step, reset})`, `window.__smh.{hasExpose, state, badNumbers, controls, setControl, activate, reset}`. Кнопки паузы и сброса помечены `data-smh-btn="playpause"` и `data-smh-btn="reset"`.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/artifact.test.ts` добавить:

```ts
describe('мост интроспекции __smh', () => {
  it('KIT_EXPOSE_JS входит в UIKIT_JS и определяет window.__smh', async () => {
    const { KIT_EXPOSE_JS } = await import('@/lib/runtime/kit-expose');
    expect(UIKIT_JS).toContain(KIT_EXPOSE_JS);
    expect(KIT_EXPOSE_JS).toContain('window.__smh');
    expect(KIT_EXPOSE_JS).toContain('SimUI.expose');
  });
  it('ядро кита ведёт реестр контролов и помечает кнопки паузы/сброса', async () => {
    const { KIT_CORE_JS } = await import('@/lib/runtime/kit-core');
    expect(KIT_CORE_JS).toContain('__register');
    expect(KIT_CORE_JS).toContain('__controls');
    expect(KIT_CORE_JS).toContain("data-smh-btn', 'playpause'");
    expect(KIT_CORE_JS).toContain("data-smh-btn', 'reset'");
  });
  it('весь UIKIT_JS остаётся валидным JS', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
  it('UIKIT_DOC требует SimUI.expose', async () => {
    const { UIKIT_DOC } = await import('@/lib/runtime');
    expect(UIKIT_DOC).toContain('SimUI.expose');
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что он падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — `Cannot find module '@/lib/runtime/kit-expose'`.

- [ ] **Step 3: Добавить реестр в ядро кита**

В `src/lib/runtime/kit-core.ts`, внутри `window.SimUI = (function () { … })()`, сразу после `var cornerEls = {};` добавить:

```js
  var controls = [];
  function register(c) { controls.push(c); return c; }
  function setByName(name, value) {
    for (var i = 0; i < controls.length; i++) {
      if (controls[i].name === name && controls[i].set) { controls[i].set(value); return true; }
    }
    return false;
  }
```

В `slider(o)`, сразу перед `return inp;`, добавить регистрацию:

```js
    register({
      kind: 'slider', name: o.name || o.label, label: o.label,
      min: Number(o.min), max: Number(o.max), step: Number(o.step),
      get: function () { return parseFloat(inp.value); },
      set: function (v) {
        inp.value = v;
        val.textContent = fmt(inp.value);
        o.onChange(parseFloat(inp.value));
      },
    });
```

В `playPause(o)` пометить кнопки, сразу после их создания (`var b2 = document.createElement('button'); b2.textContent = '↺ Сброс';`):

```js
    b1.setAttribute('data-smh-btn', 'playpause');
    b2.setAttribute('data-smh-btn', 'reset');
```

В `panel(o)` пробросить опцию свёрнутого старта — заменить строку `if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(el);` на:

```js
    if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(el, { collapsed: !!o.collapsed });
```

Расширить возвращаемый объект фабрики — заменить `return { slider: slider, playPause: playPause, title: title, panel: panel };` на:

```js
  return {
    slider: slider, playPause: playPause, title: title, panel: panel,
    // Служебное API для виджетов (kit-widgets) и моста интроспекции (kit-expose).
    __panel: ensurePanel, __register: register, __controls: function () { return controls; },
    __set: setByName,
  };
```

- [ ] **Step 4: Создать `src/lib/runtime/kit-expose.ts`**

```ts
/**
 * Мост интроспекции. Симуляция объявляет своё состояние через SimUI.expose,
 * а headless-сессия читает его и дёргает контролы через window.__smh —
 * так пробы проверяют реальное поведение, а не только картинку.
 */
export const KIT_EXPOSE_JS = `
(function () {
  var api = {};
  window.SimUI.expose = function (o) { api = o || {}; };

  function scanBad(v, path, out, depth) {
    if (depth > 4 || v == null) return;
    if (typeof v === 'number') { if (!isFinite(v)) out.push((path || 'значение') + ' = ' + v); return; }
    if (typeof v === 'object') {
      for (var k in v) {
        if (Object.prototype.hasOwnProperty.call(v, k)) {
          scanBad(v[k], path ? path + '.' + k : k, out, depth + 1);
        }
      }
    }
  }

  window.__smh = {
    hasExpose: function () { return typeof api.getState === 'function'; },
    state: function () {
      if (typeof api.getState !== 'function') return null;
      try { return JSON.parse(JSON.stringify(api.getState())); } catch (e) { return null; }
    },
    badNumbers: function () {
      var out = [];
      if (typeof api.getState === 'function') {
        try { scanBad(api.getState(), '', out, 0); } catch (e) { out.push('getState() бросил: ' + e); }
      }
      var els = document.querySelectorAll('.sim-value, .sim-readout-value, .sim-formula-nums');
      for (var i = 0; i < els.length; i++) {
        var t = els[i].textContent || '';
        if (/NaN|Infinity|undefined/.test(t)) out.push('подпись: ' + t.slice(0, 60));
      }
      return out;
    },
    controls: function () {
      var cs = window.SimUI.__controls();
      var out = [];
      for (var i = 0; i < cs.length; i++) {
        var v = null;
        try { v = cs[i].get ? cs[i].get() : null; } catch (e) { v = null; }
        out.push({ kind: cs[i].kind, name: cs[i].name, label: cs[i].label,
          min: cs[i].min, max: cs[i].max, value: v });
      }
      return out;
    },
    setControl: function (name, value) {
      try { return window.SimUI.__set(name, value); } catch (e) { return false; }
    },
    activate: function (name) {
      var cs = window.SimUI.__controls();
      for (var i = 0; i < cs.length; i++) {
        if (cs[i].name === name && cs[i].activate) { cs[i].activate(); return true; }
      }
      return false;
    },
    reset: function () { if (typeof api.reset === 'function') api.reset(); },
  };
})();
`;
```

- [ ] **Step 5: Подключить чанк и описать в doc**

`src/lib/runtime/index.ts` — заменить сборку:

```ts
import { KIT_CORE_JS } from './kit-core';
import { KIT_EXPOSE_JS } from './kit-expose';

export const UIKIT_JS = [KIT_CORE_JS, KIT_EXPOSE_JS].join('\n');
```

В `src/lib/runtime/doc.ts` добавить в конец строки `UIKIT_DOC` перед закрывающим бэктиком:

```
- SimUI.expose({getState:function(){return {...числовые величины...}},
    reset:function(){...}}) — ОБЯЗАТЕЛЬНО. getState отдаёт текущее состояние
  (простой объект с числами: время, координаты, скорости, измеряемые величины).
  Это контракт самопроверки: без него симуляция не пройдёт автоматические пробы.
```

- [ ] **Step 6: Проверить**

Run: `npx vitest run && npx tsc --noEmit`
Expected: все тесты зелёные (включая 4 новых).

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat(kit): control registry + SimUI.expose introspection bridge

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Сессионный API рендерера и блокировка сети вне whitelist

Пробам нужна живая страница, с которой можно взаимодействовать, а не серия скриншотов. `renderArtifact` переписывается поверх сессии, поведение и существующие тесты сохраняются.

**Files:**
- Create: `src/lib/cdn.ts`
- Modify: `src/lib/renderer.ts`, `src/lib/pipeline/prompts.ts:3-12`
- Test: `tests/unit/renderer.test.ts`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces:
  - `src/lib/cdn.ts`: `CDN_WHITELIST: Record<string, string>`, `allowedPrefixes(): string[]`.
  - `src/lib/renderer.ts`: `openSession(html, opts?): Promise<RenderSession>`; интерфейс `RenderSession { shot(): Promise<Buffer>; evaluate<T>(expression: string): Promise<T>; click(selector: string): Promise<boolean>; wait(ms: number): Promise<void>; errors(): string[]; blockedUrls(): string[]; close(): Promise<void> }`. `renderArtifact` сохраняет прежнюю сигнатуру.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/renderer.test.ts` добавить:

```ts
import { openSession } from '@/lib/renderer';

describe('openSession', () => {
  it('даёт кадры, evaluate и клик по селектору', async () => {
    const s = await openSession(
      '<html><body><button id="b" onclick="window.__n=(window.__n||0)+1">x</button></body></html>',
    );
    try {
      expect((await s.shot()).length).toBeGreaterThan(0);
      expect(await s.click('#b')).toBe(true);
      expect(await s.evaluate<number>('window.__n')).toBe(1);
      expect(await s.click('#missing')).toBe(false);
      expect(s.errors()).toEqual([]);
    } finally {
      await s.close();
    }
  }, 30000);

  it('блокирует запрос вне whitelist и записывает его', async () => {
    const s = await openSession(
      '<html><body><img src="https://evil.example.com/x.png"></body></html>',
    );
    try {
      await s.wait(300);
      expect(s.blockedUrls()).toContain('https://evil.example.com/x.png');
    } finally {
      await s.close();
    }
  }, 30000);
});
```

- [ ] **Step 2: Запустить тест — убедиться, что он падает**

Run: `npx vitest run tests/unit/renderer.test.ts`
Expected: FAIL — `openSession is not a function` / ошибка импорта.

- [ ] **Step 3: Вынести whitelist в отдельный модуль**

Создать `src/lib/cdn.ts`:

```ts
/**
 * Единственный источник правды по разрешённым внешним ресурсам артефакта.
 * Отдельный модуль (а не часть prompts.ts), чтобы рендерер мог блокировать
 * сеть, не завися от промптов.
 */
export const CDN_WHITELIST: Record<string, string> = {
  // three@0.164.0 больше не публикует классическую глобальную сборку build/three.min.js
  // (только ES-модуль build/three.module.min.js) — build/three.min.js отдаёт 404 на jsdelivr.
  three: 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.min.js',
  p5: 'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/p5.min.js',
  matter: 'https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js',
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  katexJs: 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js',
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css',
};

/** Разрешённый префикс — директория каждого whitelist-URL (строго origin+path). */
export function allowedPrefixes(): string[] {
  return Object.values(CDN_WHITELIST).map((u) => u.slice(0, u.lastIndexOf('/') + 1));
}
```

В `src/lib/pipeline/prompts.ts` удалить объявление `CDN_WHITELIST` (строки 3-12) и заменить на реэкспорт, чтобы все существующие импортеры (`stages.ts`, `run.ts`, тесты) продолжали работать:

```ts
import { CDN_WHITELIST } from '../cdn';
export { CDN_WHITELIST };
```

- [ ] **Step 4: Переписать рендерер на сессии**

Заменить в `src/lib/renderer.ts` всё от `export async function renderArtifact` до конца файла на:

```ts
export interface RenderSession {
  shot(): Promise<Buffer>;
  /** Выражение исполняется в контексте страницы; результат должен быть сериализуем. */
  evaluate<T = unknown>(expression: string): Promise<T>;
  /** false, если элемент не найден или клик не удался. */
  click(selector: string): Promise<boolean>;
  wait(ms: number): Promise<void>;
  errors(): string[];
  blockedUrls(): string[];
  close(): Promise<void>;
}

export interface SessionOpts {
  timeoutMs?: number;
  viewport?: { width: number; height: number };
}

export async function openSession(
  html: string,
  { timeoutMs = 15000, viewport = { width: 1280, height: 800 } }: SessionOpts = {},
): Promise<RenderSession> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  const blocked: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Сеть вне whitelist режется на уровне браузера: regex-скан по исходнику
  // ловит не всё (например, URL, собранный из строк в рантайме).
  const prefixes = allowedPrefixes();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!/^https?:\/\//i.test(url) || prefixes.some((p) => url.startsWith(p))) {
      route.continue().catch(() => {});
      return;
    }
    blocked.push(url);
    route.abort().catch(() => {});
  });

  try {
    await page.setContent(html, { timeout: timeoutMs, waitUntil: 'load' });
  } catch (e) {
    errors.push('render timeout/navigation: ' + String(e));
  }

  return {
    shot: () => page.screenshot({ timeout: timeoutMs }),
    evaluate: <T>(expression: string) => page.evaluate(expression) as Promise<T>,
    click: async (selector) => {
      try {
        await page.click(selector, { timeout: 2000 });
        return true;
      } catch {
        return false;
      }
    },
    wait: (ms) => page.waitForTimeout(ms),
    errors: () => errors,
    blockedUrls: () => blocked,
    close: async () => { await page.close().catch(() => {}); },
  };
}

export async function renderArtifact(
  html: string,
  { timeoutMs = 15000, shotTimes = [300, 1200, 3000] }:
    { timeoutMs?: number; shotTimes?: number[] } = {},
): Promise<RenderReport> {
  let session: RenderSession;
  try {
    session = await openSession(html, { timeoutMs });
  } catch (e) {
    return {
      ok: false,
      errors: ['browser launch/page failure: ' + String(e)],
      animated: false,
      screenshots: [],
    };
  }
  const screenshots: Buffer[] = [];
  try {
    let prev = 0;
    for (const t of shotTimes) {
      await session.wait(t - prev);
      prev = t;
      screenshots.push(await session.shot());
    }
  } catch (e) {
    session.errors().push('screenshot failure: ' + String(e));
  }
  const errors = [...session.errors()];
  for (const url of session.blockedUrls()) {
    errors.push('Заблокирован запрос вне whitelist: ' + url);
  }
  await session.close();
  const animated = screenshots.length >= 2 &&
    !screenshots[0].equals(screenshots[screenshots.length - 1]);
  return { ok: errors.length === 0 && screenshots.length > 0, errors, animated, screenshots };
}
```

Добавить импорт в шапку файла: `import { allowedPrefixes } from './cdn';`

- [ ] **Step 5: Проверить весь набор**

Run: `npx vitest run && npx tsc --noEmit`
Expected: все зелёные. Тест `resolves ok:false … when the browser fails to launch` продолжает проходить: `openSession` пробрасывает ошибку `getBrowser()`, `renderArtifact` её ловит. Тест `hanging artifact: times out` — `setContent` бросает, ошибка попадает в `errors`, `ok:false`.

Если тесты с `fakeBrowser` (self-heal, stale disconnect) упадут из-за отсутствия `page.route`/`page.click` в фейке — дополнить фейковую страницу заглушками:

```ts
      function fakePage() {
        return {
          on: () => {},
          route: async () => {},
          setContent: async () => {},
          waitForTimeout: async () => {},
          screenshot: async () => Buffer.from([launchCount]),
          click: async () => {},
          evaluate: async () => null,
          close: async () => {},
        };
      }
```

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat(renderer): session API + network whitelist enforcement

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Модуль проб

Детерминированная проверка поведения артефакта без участия LLM: идёт ли анимация, работает ли пауза, меняет ли что-то сброс, живые ли слайдеры, нет ли NaN, не лезет ли артефакт в чужие URL.

**Files:**
- Create: `src/lib/pipeline/probes.ts`
- Create: `tests/fixtures/probe-ok.html`, `probe-dead-pause.html`, `probe-dead-reset.html`, `probe-nan.html`, `probe-static.html`
- Create: `tests/unit/probes.test.ts`

**Interfaces:**
- Consumes: `RenderSession` (Task 3), `window.__smh` (Task 2).
- Produces: `ProbeResult`, `ProbeReport`, `runProbes(session: RenderSession): Promise<ProbeReport>`.

- [ ] **Step 1: Написать фикстуры**

`tests/fixtures/probe-ok.html` — эталонный артефакт (кит инжектится тестом через `instrument`):

```html
<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>probe ok</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{position:fixed;top:0;left:0}</style>
</head><body><canvas id="c"></canvas><script>
(function () {
  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var state = { t: 0, x: 0 }, speed = 60, running = true, last = null;
  function resetSim() { state = { t: 0, x: 0 }; }
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  function draw() {
    ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#4f8ff7'; ctx.fillRect(state.x % 600, 100, 40, 40);
  }
  function loop(now) {
    if (last == null) last = now;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (running) { state.t += dt; state.x += speed * dt; }
    draw(); requestAnimationFrame(loop);
  }
  SimUI.title('Проба');
  SimUI.slider({ name: 'speed', label: 'Скорость', min: 10, max: 400, step: 10, value: speed,
    unit: 'px/с', onChange: function (v) { speed = v; } });
  SimUI.playPause({ onPlay: function () { running = true; last = null; },
    onPause: function () { running = false; }, onReset: function () { resetSim(); } });
  SimUI.expose({ getState: function () { return { t: state.t, x: state.x, speed: speed }; },
    reset: resetSim });
  addEventListener('resize', resize); resize(); requestAnimationFrame(loop);
})();
</script></body></html>
```

`tests/fixtures/probe-dead-pause.html` — копия `probe-ok.html`, в которой `onPause` пустой:

```
onPause: function () { /* забыли остановить */ },
```

`tests/fixtures/probe-dead-reset.html` — копия `probe-ok.html`, в которой `onReset` пустой и `SimUI.expose` отдаёт то же состояние:

```
onReset: function () { /* забыли сбросить */ },
```

`tests/fixtures/probe-nan.html` — копия `probe-ok.html`, где физика уходит в NaN:

```
if (running) { state.t += dt; state.x += speed * dt * Math.sqrt(-1); }
```

`tests/fixtures/probe-static.html` — копия `probe-ok.html`, где цикл не двигает состояние:

```
if (running) { /* картинка не меняется */ }
```

- [ ] **Step 2: Написать падающий тест**

`tests/unit/probes.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openSession, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';
import { runProbes, type ProbeReport } from '@/lib/pipeline/probes';

const fx = (n: string) =>
  instrument(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures', n), 'utf8'));

async function probe(name: string): Promise<ProbeReport> {
  const s = await openSession(fx(name));
  try {
    return await runProbes(s);
  } finally {
    await s.close();
  }
}

function status(r: ProbeReport, id: string): string {
  return r.results.find((x) => x.id === id)?.status ?? 'missing';
}

describe('runProbes', () => {
  afterAll(() => closeBrowser());

  it('здоровый артефакт: ни одного провала', async () => {
    const r = await probe('probe-ok.html');
    expect(r.failures).toEqual([]);
    expect(status(r, 'animates')).toBe('pass');
    expect(status(r, 'pause')).toBe('pass');
    expect(status(r, 'reset')).toBe('pass');
    expect(status(r, 'nan')).toBe('pass');
    expect(status(r, 'cdn')).toBe('pass');
    expect(r.passRate).toBe(1);
  }, 60000);

  it('ловит неработающую паузу', async () => {
    const r = await probe('probe-dead-pause.html');
    expect(status(r, 'pause')).toBe('fail');
  }, 60000);

  it('ловит неработающий сброс', async () => {
    const r = await probe('probe-dead-reset.html');
    expect(status(r, 'reset')).toBe('fail');
  }, 60000);

  it('ловит NaN в состоянии', async () => {
    const r = await probe('probe-nan.html');
    expect(status(r, 'nan')).toBe('fail');
  }, 60000);

  it('ловит отсутствие анимации', async () => {
    const r = await probe('probe-static.html');
    expect(status(r, 'animates')).toBe('fail');
  }, 60000);
});
```

- [ ] **Step 3: Запустить тест — убедиться, что он падает**

Run: `npx vitest run tests/unit/probes.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pipeline/probes'`.

- [ ] **Step 4: Реализовать `src/lib/pipeline/probes.ts`**

```ts
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
        'кнопка сброса не найдена — SimUI.playPause вызван без onReset');
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
  if (paused) await s.click(PLAYPAUSE);

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
```

- [ ] **Step 5: Запустить тесты проб**

Run: `npx vitest run tests/unit/probes.test.ts`
Expected: PASS (5 тестов).

Если проба `sliders` на `probe-ok.html` даёт `skip` — это ожидаемо и тестом не проверяется: значение `speed` входит в `getState()`, поэтому должно быть `pass`. Если `pass` не получается, проверить, что фикстура передаёт `name: 'speed'` в слайдер и что `getState()` возвращает `speed`.

- [ ] **Step 6: Проверить весь набор и коммит**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(pipeline): behavioural probes for generated artifacts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `SimUI.chart` — живой график на canvas

Убирает главную причину, по которой модель пишет 150 строк кода на каждый график (и ломает chart.js).

**Files:**
- Create: `src/lib/runtime/kit-chart.ts`
- Modify: `src/lib/runtime/kit-css.ts`, `src/lib/runtime/index.ts`, `src/lib/runtime/doc.ts`
- Test: `tests/unit/artifact.test.ts`

**Interfaces:**
- Consumes: `SimUI.panel` (Task 1).
- Produces: `KIT_CHART_JS: string`. В артефакте: `SimUI.chart({title, xLabel, yLabel, series, maxPoints, mode, corner, width, height, xRange, yRange}) → {push(x, values[]), clear(), element}`.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/artifact.test.ts`:

```ts
describe('SimUI.chart', () => {
  it('KIT_CHART_JS входит в UIKIT_JS и определяет chart', async () => {
    const { KIT_CHART_JS } = await import('@/lib/runtime/kit-chart');
    expect(UIKIT_JS).toContain(KIT_CHART_JS);
    expect(KIT_CHART_JS).toContain('K.chart = chart');
  });
  it('UIKIT_JS остаётся валидным JS', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
  it('UIKIT_CSS содержит стили графика', async () => {
    const { UIKIT_CSS } = await import('@/lib/runtime');
    expect(UIKIT_CSS).toContain('.sim-chart');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — `Cannot find module '@/lib/runtime/kit-chart'`.

- [ ] **Step 3: Создать `src/lib/runtime/kit-chart.ts`**

```ts
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
```

- [ ] **Step 4: Добавить стили и подключить чанк**

В `src/lib/runtime/kit-css.ts`, перед закрывающим бэктиком `UIKIT_CSS`, добавить:

```
.sim-chart { display:block; border-radius:8px; border:1px solid #2a3341; }
.sim-chart-legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:6px;
  font-size:10.5px; color:var(--sim-muted); }
.sim-chart-legend span { display:inline-flex; align-items:center; gap:4px; }
.sim-chart-legend i { width:9px; height:9px; border-radius:2px; display:inline-block; }
```

`src/lib/runtime/index.ts`:

```ts
import { KIT_CORE_JS } from './kit-core';
import { KIT_CHART_JS } from './kit-chart';
import { KIT_EXPOSE_JS } from './kit-expose';

export const UIKIT_JS = [KIT_CORE_JS, KIT_CHART_JS, KIT_EXPOSE_JS].join('\n');
```

- [ ] **Step 5: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(kit): SimUI.chart canvas plotting widget

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Виджеты SimUI 2.0

`readout`, `formula`, `banner`, `legend`, `select`, `toggle`, `button`, `presets`, `speed`, `goals` — всё, что раньше модель рисовала руками через `position:fixed`.

**Files:**
- Create: `src/lib/runtime/kit-widgets.ts`
- Modify: `src/lib/runtime/kit-css.ts`, `src/lib/runtime/index.ts`, `src/lib/runtime/doc.ts`
- Create: `tests/integration/kit.test.ts`

**Interfaces:**
- Consumes: `SimUI.panel`, `SimUI.__panel`, `SimUI.__register`, `SimUI.__set` (Tasks 1-2), `CDN_WHITELIST` (Task 3).
- Produces: `KIT_WIDGETS_JS: string`. В артефакте: `SimUI.readout({label,unit,digits,corner}) → {set(v)}`; `SimUI.formula({title,tex,vars,corner}) → {set(values)}`; `SimUI.banner({items}) → {set(i)}`; `SimUI.legend({title,items,corner})`; `SimUI.select({name,label,options,value,onChange})`; `SimUI.toggle({name,label,value,onChange})`; `SimUI.button({name,label,onClick})`; `SimUI.presets({items})`; `SimUI.speed({values,value,onChange}) → {get()}`; `SimUI.goals(list)`.

- [ ] **Step 1: Написать падающий интеграционный тест**

`tests/integration/kit.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { openSession, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';
import { runProbes } from '@/lib/pipeline/probes';

// Артефакт, использующий КАЖДЫЙ примитив SimUI 2.0. Дымовой тест кита:
// если примитив падает или ломает лейаут, это видно здесь, а не в генерации.
const KIT_DEMO = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>kit smoke</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas#c{position:fixed;top:0;left:0}</style>
</head><body><canvas id="c"></canvas><script>
(function () {
  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var st = { t: 0, x: 0, e: 0 }, amp = 50, running = true, last = null, shape = 'circle';
  function resetSim() { st = { t: 0, x: 0, e: 0 }; ch.clear(); }
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  SimUI.title('Дымовой тест кита');
  SimUI.goals(['проверить все примитивы кита']);
  var banner = SimUI.banner({ items: [
    { name: 'Фаза A', sub: 'первая половина', color: '#4f8ff7' },
    { name: 'Фаза B', sub: 'вторая половина', color: '#ff6a3d' }] });
  var rd = SimUI.readout({ label: 'Время', unit: 'с', digits: 1, corner: 'bl' });
  var rx = SimUI.readout({ label: 'Смещение', unit: 'px', digits: 1, corner: 'bl' });
  var fm = SimUI.formula({ title: 'Модель', tex: 'x = A\\\\sin(\\\\omega t)',
    vars: { A: { label: 'A', unit: 'px' }, t: { label: 't', unit: 'с' } }, corner: 'tl' });
  SimUI.legend({ items: [{ color: '#4f8ff7', label: 'синий' }, { color: '#ff6a3d', label: 'красный' }],
    corner: 'tl' });
  var ch = SimUI.chart({ title: 'x(t)', xLabel: 't, с', yLabel: 'x',
    series: [{ name: 'x', color: '#4f8ff7' }], corner: 'br' });
  SimUI.slider({ name: 'amp', label: 'Амплитуда', min: 10, max: 200, step: 5, value: amp,
    unit: 'px', onChange: function (v) { amp = v; } });
  SimUI.select({ name: 'shape', label: 'Форма', options: ['circle', 'square'], value: 'circle',
    onChange: function (v) { shape = v; } });
  SimUI.toggle({ name: 'grid', label: 'Сетка', value: false, onChange: function () {} });
  SimUI.button({ name: 'kick', label: 'Толчок', onClick: function () { st.x += 20; } });
  SimUI.presets({ items: [{ label: 'Слабо', values: { amp: 20 } }, { label: 'Сильно', values: { amp: 180 } }] });
  var sp = SimUI.speed({ values: [0.5, 1, 2], value: 1 });
  SimUI.playPause({ onPlay: function () { running = true; last = null; },
    onPause: function () { running = false; }, onReset: resetSim });
  SimUI.expose({ getState: function () { return { t: st.t, x: st.x, amp: amp }; }, reset: resetSim });
  function loop(now) {
    if (last == null) last = now;
    var dt = Math.min(0.05, (now - last) / 1000) * sp.get(); last = now;
    if (running) {
      st.t += dt;
      st.x = amp * Math.sin(st.t * 2);
      ch.push(st.t, [st.x]);
      rd.set(st.t); rx.set(st.x);
      fm.set({ A: amp, t: st.t });
      banner.set(Math.floor(st.t) % 2);
    }
    ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = shape === 'circle' ? '#4f8ff7' : '#ff6a3d';
    ctx.fillRect(cv.width / 2 + st.x, cv.height / 2, 30, 30);
    requestAnimationFrame(loop);
  }
  addEventListener('resize', resize); resize(); requestAnimationFrame(loop);
})();
</script></body></html>`;

describe('SimUI 2.0 kit smoke', () => {
  afterAll(() => closeBrowser());

  it('артефакт со всеми примитивами рендерится без ошибок и проходит пробы', async () => {
    const s = await openSession(instrument(KIT_DEMO));
    try {
      const report = await runProbes(s);
      expect(s.errors()).toEqual([]);
      expect(report.failures).toEqual([]);
    } finally {
      await s.close();
    }
  }, 90000);

  it('все примитивы реально создали свои узлы в DOM', async () => {
    const s = await openSession(instrument(KIT_DEMO));
    try {
      await s.wait(600);
      const counts = await s.evaluate<Record<string, number>>(`(function () {
        return {
          panel: document.querySelectorAll('.sim-panel').length,
          side: document.querySelectorAll('.sim-side-panel').length,
          banner: document.querySelectorAll('.sim-banner').length,
          chart: document.querySelectorAll('canvas.sim-chart').length,
          readout: document.querySelectorAll('.sim-readout').length,
          select: document.querySelectorAll('.sim-select').length,
          presets: document.querySelectorAll('.sim-presets button').length,
        };
      })()`);
      expect(counts.panel).toBe(1);
      expect(counts.banner).toBe(1);
      expect(counts.chart).toBe(1);
      expect(counts.readout).toBe(2);
      expect(counts.select).toBe(1);
      expect(counts.presets).toBe(2);
      expect(counts.side).toBeGreaterThanOrEqual(4);
    } finally {
      await s.close();
    }
  }, 60000);

  it('пресет двигает слайдер через реестр контролов', async () => {
    const s = await openSession(instrument(KIT_DEMO));
    try {
      await s.wait(400);
      await s.click('.sim-presets button:last-child');
      await s.wait(200);
      const amp = await s.evaluate<number>(
        "window.__smh.controls().filter(function(c){return c.name==='amp';})[0].value");
      expect(amp).toBe(180);
    } finally {
      await s.close();
    }
  }, 60000);
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/integration/kit.test.ts`
Expected: FAIL — в консоли страницы `SimUI.banner is not a function`.

- [ ] **Step 3: Создать `src/lib/runtime/kit-widgets.ts`**

```ts
import { CDN_WHITELIST } from '../cdn';

/**
 * Виджеты SimUI 2.0. Всё, что раньше модель рисовала руками через position:fixed
 * (показания, формулы, баннер такта, легенда), теперь примитив кита: единый вид,
 * докировка по углам, сворачивание и мобильный лейаут — бесплатно.
 */
export const KIT_WIDGETS_JS = `
(function () {
  var K = window.SimUI;

  // ---------- Показания величин: одна панель «Величины» на угол ----------
  var readoutBodies = {};
  function readout(o) {
    o = o || {};
    var corner = o.corner || 'bl';
    if (!readoutBodies[corner]) {
      readoutBodies[corner] = K.panel({ title: o.panelTitle || 'Величины', corner: corner });
    }
    var row = document.createElement('div');
    row.className = 'sim-readout';
    var lab = document.createElement('span');
    lab.className = 'sim-readout-label';
    lab.textContent = o.label;
    var val = document.createElement('b');
    val.className = 'sim-readout-value';
    val.textContent = '—';
    row.appendChild(lab);
    row.appendChild(val);
    readoutBodies[corner].appendChild(row);
    var digits = o.digits == null ? 2 : o.digits;
    return {
      set: function (v) {
        var t = (typeof v === 'number' && isFinite(v)) ? v.toFixed(digits) : String(v);
        val.textContent = t + (o.unit ? ' ' + o.unit : '');
      },
      element: row,
    };
  }

  // ---------- Легенда цветов ----------
  function legend(o) {
    o = o || {};
    var body = K.panel({ title: o.title || 'Легенда', corner: o.corner || 'bl' });
    var wrap = document.createElement('div');
    wrap.className = 'sim-legend';
    var items = o.items || [];
    for (var i = 0; i < items.length; i++) {
      var sp = document.createElement('span');
      var sw = document.createElement('i');
      sw.style.background = items[i].color;
      sp.appendChild(sw);
      sp.appendChild(document.createTextNode(items[i].label));
      wrap.appendChild(sp);
    }
    body.appendChild(wrap);
    return wrap;
  }

  // ---------- Баннер фазы/такта: крупная плашка сверху по центру ----------
  function banner(o) {
    o = o || {};
    var el = document.createElement('div');
    el.className = 'sim-banner';
    var name = document.createElement('div');
    name.className = 'sim-banner-name';
    var sub = document.createElement('div');
    sub.className = 'sim-banner-sub';
    el.appendChild(name);
    el.appendChild(sub);
    document.body.appendChild(el);
    var items = o.items || [];
    var cur = -1;
    function set(i) {
      if (i === cur || !items[i]) return;
      cur = i;
      name.textContent = items[i].name;
      sub.textContent = items[i].sub || '';
      el.style.setProperty('--sim-banner-color', items[i].color || '#4f8ff7');
    }
    set(0);
    return { set: set, element: el };
  }

  // ---------- Формула KaTeX с подстановкой живых значений ----------
  var katexState = 0; // 0 — не грузили, 1 — грузится, 2 — готово/провалилось
  var katexQueue = [];
  function withKatex(cb) {
    if (katexState === 2 || window.katex) { cb(); return; }
    katexQueue.push(cb);
    if (katexState === 1) return;
    katexState = 1;
    function flush() {
      katexState = 2;
      for (var i = 0; i < katexQueue.length; i++) katexQueue[i]();
      katexQueue = [];
    }
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '${CDN_WHITELIST.katexCss}';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = '${CDN_WHITELIST.katexJs}';
    js.onload = flush;
    js.onerror = flush; // CDN недоступен — остаёмся на текстовом виде формулы
    document.head.appendChild(js);
  }

  function formula(o) {
    o = o || {};
    var body = K.panel({ title: o.title || 'Как это работает', corner: o.corner || 'bl' });
    var tex = document.createElement('div');
    tex.className = 'sim-formula-tex';
    tex.textContent = o.tex || '';
    var nums = document.createElement('div');
    nums.className = 'sim-formula-nums';
    body.appendChild(tex);
    body.appendChild(nums);
    if (o.note) {
      var note = document.createElement('div');
      note.className = 'sim-formula-note';
      note.textContent = o.note;
      body.appendChild(note);
    }
    if (o.tex) {
      withKatex(function () {
        if (!window.katex) return;
        try { window.katex.render(o.tex, tex, { throwOnError: false }); } catch (e) {}
      });
    }
    var vars = o.vars || {};
    return {
      set: function (values) {
        var parts = [];
        for (var k in values) {
          if (!Object.prototype.hasOwnProperty.call(values, k)) continue;
          var meta = vars[k] || {};
          var v = values[k];
          var t = (typeof v === 'number' && isFinite(v)) ? (Math.round(v * 1000) / 1000) : v;
          parts.push((meta.label || k) + ' = ' + t + (meta.unit ? ' ' + meta.unit : ''));
        }
        nums.textContent = parts.join('   ·   ');
      },
      element: body,
    };
  }

  // ---------- Дискретные контролы в панели управления ----------
  function controlRow(labelText) {
    var wrap = document.createElement('div');
    wrap.className = 'sim-control';
    var lab = document.createElement('label');
    lab.textContent = labelText;
    wrap.appendChild(lab);
    return { wrap: wrap, label: lab };
  }

  function select(o) {
    var p = K.__panel();
    var row = controlRow(o.label);
    var sel = document.createElement('select');
    sel.className = 'sim-select';
    var opts = o.options || [];
    for (var i = 0; i < opts.length; i++) {
      var op = document.createElement('option');
      var raw = opts[i];
      op.value = String(raw && raw.value !== undefined ? raw.value : raw);
      op.textContent = String(raw && raw.label !== undefined ? raw.label : raw);
      sel.appendChild(op);
    }
    if (o.value !== undefined) sel.value = String(o.value);
    sel.addEventListener('change', function () { o.onChange(sel.value); });
    row.wrap.appendChild(sel);
    p.appendChild(row.wrap);
    K.__register({
      kind: 'select', name: o.name || o.label, label: o.label,
      get: function () { return sel.value; },
      set: function (v) { sel.value = String(v); o.onChange(sel.value); },
    });
    return sel;
  }

  function toggle(o) {
    var p = K.__panel();
    var row = controlRow(o.label);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sim-toggle';
    var on = !!o.value;
    function sync() {
      btn.textContent = on ? 'вкл' : 'выкл';
      btn.className = on ? 'sim-toggle sim-toggle-on' : 'sim-toggle';
    }
    btn.onclick = function () { on = !on; sync(); o.onChange(on); };
    sync();
    row.wrap.appendChild(btn);
    p.appendChild(row.wrap);
    K.__register({
      kind: 'toggle', name: o.name || o.label, label: o.label,
      get: function () { return on; },
      set: function (v) { on = !!v; sync(); o.onChange(on); },
      activate: function () { btn.onclick(); },
    });
    return btn;
  }

  function button(o) {
    var p = K.__panel();
    var box = document.createElement('div');
    box.className = 'sim-btns';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    b.onclick = function () { o.onClick(); };
    box.appendChild(b);
    p.appendChild(box);
    K.__register({
      kind: 'button', name: o.name || o.label, label: o.label,
      activate: function () { b.onclick(); },
    });
    return b;
  }

  function presets(o) {
    var p = K.__panel();
    var box = document.createElement('div');
    box.className = 'sim-presets';
    var items = o.items || [];
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.label;
        b.onclick = function () {
          for (var k in item.values) {
            if (Object.prototype.hasOwnProperty.call(item.values, k)) K.__set(k, item.values[k]);
          }
          if (item.onApply) item.onApply();
        };
        box.appendChild(b);
      })(items[i]);
    }
    p.appendChild(box);
    return box;
  }

  function speed(o) {
    o = o || {};
    var values = o.values || [0.25, 0.5, 1, 2];
    var cur = o.value == null ? 1 : o.value;
    var p = K.__panel();
    var wrap = document.createElement('div');
    wrap.className = 'sim-control';
    var lab = document.createElement('label');
    var val = document.createElement('span');
    val.className = 'sim-value';
    lab.textContent = 'Скорость времени';
    lab.appendChild(val);
    var box = document.createElement('div');
    box.className = 'sim-btns';
    function sync() { val.textContent = cur + '×'; }
    for (var i = 0; i < values.length; i++) {
      (function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = v + '×';
        b.onclick = function () { cur = v; sync(); if (o.onChange) o.onChange(v); };
        box.appendChild(b);
      })(values[i]);
    }
    sync();
    wrap.appendChild(lab);
    wrap.appendChild(box);
    p.appendChild(wrap);
    K.__register({
      kind: 'speed', name: o.name || 'speed', label: 'Скорость времени',
      get: function () { return cur; },
      set: function (v) { cur = Number(v); sync(); if (o.onChange) o.onChange(cur); },
    });
    return { get: function () { return cur; } };
  }

  function goals(list) {
    var body = K.panel({ title: 'Чему учит', corner: 'tl', collapsed: true });
    var ul = document.createElement('ul');
    ul.className = 'sim-goals';
    for (var i = 0; i < list.length; i++) {
      var li = document.createElement('li');
      li.textContent = list[i];
      ul.appendChild(li);
    }
    body.appendChild(ul);
    return ul;
  }

  K.readout = readout;
  K.legend = legend;
  K.banner = banner;
  K.formula = formula;
  K.select = select;
  K.toggle = toggle;
  K.button = button;
  K.presets = presets;
  K.speed = speed;
  K.goals = goals;
})();
`;
```

- [ ] **Step 4: Добавить стили виджетов**

В `src/lib/runtime/kit-css.ts`, перед закрывающим бэктиком, добавить:

```
.sim-readout { display:flex; justify-content:space-between; gap:12px; font-size:12px;
  color:var(--sim-muted); line-height:1.7; }
.sim-readout-value { color:var(--sim-text); font-variant-numeric:tabular-nums; font-weight:600; }
.sim-legend { display:flex; flex-wrap:wrap; gap:10px; font-size:11px; color:var(--sim-muted); }
.sim-legend span { display:inline-flex; align-items:center; gap:5px; }
.sim-legend i { width:10px; height:10px; border-radius:2px; display:inline-block; }
.sim-formula-tex { font-size:15px; margin-bottom:8px; color:var(--sim-text); }
.sim-formula-nums { font-size:11.5px; color:var(--sim-muted); font-variant-numeric:tabular-nums;
  line-height:1.6; }
.sim-formula-note { font-size:10.5px; color:#5c6675; margin-top:8px; line-height:1.45; }
.sim-goals { margin:0; padding-left:16px; font-size:11.5px; color:var(--sim-muted); line-height:1.6; }
.sim-select, .sim-toggle { width:100%; padding:6px 8px; border-radius:8px; border:1px solid #2a3341;
  background:var(--sim-panel); color:var(--sim-text); font:inherit; font-size:13px; cursor:pointer; }
.sim-toggle-on { border-color:var(--sim-accent); color:var(--sim-accent); }
.sim-presets { display:flex; flex-wrap:wrap; gap:6px; }
.sim-presets button { flex:1 1 auto; padding:6px 10px; border-radius:8px; border:1px solid #2a3341;
  background:var(--sim-panel); color:var(--sim-text); font:inherit; font-size:12px; cursor:pointer; }
.sim-presets button:hover { border-color:var(--sim-accent); }

/* Баннер фазы: сверху по центру, не заезжает под панель управления (она справа). */
.sim-banner { position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:11;
  min-width:220px; max-width:min(440px, calc(100vw - 300px)); padding:10px 22px; text-align:center;
  background:color-mix(in srgb, var(--sim-panel) 90%, transparent);
  border:1px solid #2a3341; border-bottom:3px solid var(--sim-banner-color, var(--sim-accent));
  border-radius:12px; backdrop-filter:blur(6px);
  box-shadow:0 0 22px 0 color-mix(in srgb, var(--sim-banner-color, var(--sim-accent)) 32%, transparent); }
.sim-banner-name { font-size:21px; font-weight:700; color:var(--sim-text); letter-spacing:.3px; }
.sim-banner-sub { font-size:12px; color:var(--sim-muted); margin-top:2px; }
@media (max-width:640px) {
  .sim-banner { left:8px; right:8px; transform:none; max-width:none; min-width:0; padding:8px 14px; }
  .sim-banner-name { font-size:17px; }
}
```

- [ ] **Step 5: Подключить чанк и описать API в doc**

`src/lib/runtime/index.ts`:

```ts
import { KIT_CORE_JS } from './kit-core';
import { KIT_CHART_JS } from './kit-chart';
import { KIT_WIDGETS_JS } from './kit-widgets';
import { KIT_EXPOSE_JS } from './kit-expose';

export const UIKIT_JS = [KIT_CORE_JS, KIT_CHART_JS, KIT_WIDGETS_JS, KIT_EXPOSE_JS].join('\n');
```

Заменить `src/lib/runtime/doc.ts` целиком:

```ts
/** Справочник API кита для системного промпта генератора. */
export const UIKIT_DOC = `
В артефакт УЖЕ встроен UI-kit (не подключай его сам, не пиши свои position:fixed
панели, легенды и инфо-блоки). Всё, что не является самой сценой, делается через SimUI.

Панель управления (правый верхний угол):
- SimUI.title('Название симуляции')
- SimUI.slider({name:'temp', label:'Температура', min:0, max:100, step:1, value:20,
    unit:'°C', onChange:function(v){...}}) — name обязателен, совпадает с spec.parameters
- SimUI.select({name:'view', label:'Вид', options:['сбоку','сверху'], value:'сбоку',
    onChange:function(v){...}})
- SimUI.toggle({name:'cut', label:'Разрез', value:true, onChange:function(on){...}})
- SimUI.button({name:'kick', label:'Толчок', onClick:function(){...}})
- SimUI.presets({items:[{label:'Холостой ход', values:{rpm:800}},
    {label:'Трасса', values:{rpm:2600}}]}) — двигает слайдеры по их name
- SimUI.speed({values:[0.25,0.5,1,2], value:1}) -> {get()} — множитель dt, замедление
- SimUI.playPause({onPlay:..., onPause:..., onReset:...}) — ОБЯЗАТЕЛЬНО

Информация (докируется по углам, сворачивается, на мобиле свёрнута):
- SimUI.readout({label:'Температура', unit:'К', digits:1, corner:'bl'}) -> {set(v)}
- SimUI.chart({title:'Энергия', xLabel:'t, с', yLabel:'E, Дж', mode:'time'|'xy',
    series:[{name:'Кинетическая', color:'#4f8ff7'}], corner:'br'}) -> {push(x,[y...]), clear()}
    mode:'xy' — фазовые и индикаторные диаграммы (p-V), последняя точка подсвечена
- SimUI.formula({title:'Как это работает', tex:'E = mc^2',
    vars:{m:{label:'m', unit:'кг'}}, note:'пояснение', corner:'tl'}) -> {set({m: 2})}
    KaTeX грузится китом сам, подключать его не надо
- SimUI.legend({items:[{color:'#4f8ff7', label:'холодные'}], corner:'tl'})
- SimUI.goals(['что должен понять студент', ...])
- SimUI.banner({items:[{name:'Впуск', sub:'клапан открыт', color:'#4f8ff7'}, ...]}) -> {set(i)}
    крупная плашка сверху по центру: текущий такт/фаза/режим
- SimUI.panel({title:'Своё', corner:'bl'}) -> DIV для произвольного содержимого

Самопроверка (ОБЯЗАТЕЛЬНО):
- SimUI.expose({getState:function(){return {t:state.t, x:state.x, temp:temp};},
    reset:resetSim}) — getState отдаёт простой объект с числами (время, координаты,
    измеряемые величины и текущие значения параметров). Без него симуляция не проходит
    автоматические пробы качества.

Лейаут: центр экрана — только под визуализацию (canvas на всё окно); все подписи,
величины, графики и формулы — через примитивы выше, они сами докируются по углам.
`;
```

- [ ] **Step 6: Запустить дымовой тест кита**

Run: `npx vitest run tests/integration/kit.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 7: Полный прогон и коммит**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(kit): readout, formula, banner, legend, select, toggle, presets, speed, goals

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: three.js addons и importmap

`examples/jsm/` открывается для OrbitControls и подписей, а кит инжектит importmap, чтобы модель писала `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'` вместо длинных URL.

**Files:**
- Modify: `src/lib/cdn.ts`, `src/lib/artifact.ts`
- Test: `tests/unit/artifact.test.ts`

**Interfaces:**
- Consumes: `CDN_WHITELIST` (Task 3).
- Produces: `CDN_WHITELIST.threeAddons` — URL-префикс `…/three@0.164.0/examples/jsm/`; `instrument()` вставляет `<script type="importmap">` с `three` и `three/addons/`, но только если в документе нет собственного importmap.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/artifact.test.ts` — **заменить** существующий тест `blocks a three.js file outside the whitelisted build/ directory` на:

```ts
  it('разрешает three.js addons из examples/jsm/', () => {
    const html = '<script type="module">import { OrbitControls } from ' +
      "'https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/controls/OrbitControls.js';</script>";
    expect(findForbiddenUrls(html, allowed)).toEqual([]);
  });

  it('блокирует файл three.js вне build/ и examples/jsm/', () => {
    const url = 'https://cdn.jsdelivr.net/npm/three@0.164.0/src/Three.js';
    expect(findForbiddenUrls(`<script src="${url}"></script>`, allowed)).toEqual([url]);
  });
```

И добавить новый блок:

```ts
describe('importmap для three', () => {
  it('instrument вставляет importmap с three и three/addons/', () => {
    const out = instrument('<!DOCTYPE html><html><head></head><body></body></html>');
    expect(out).toContain('type="importmap"');
    expect(out).toContain('"three/addons/"');
    expect(out).toContain(CDN_WHITELIST.three);
    // importmap обязан идти до любого модульного скрипта артефакта
    expect(out.indexOf('type="importmap"')).toBeLessThan(out.indexOf('</head>'));
  });

  it('не вставляет второй importmap, если артефакт объявил свой', () => {
    const own = '<!DOCTYPE html><html><head><script type="importmap">{"imports":{}}</script>' +
      '</head><body></body></html>';
    const out = instrument(own);
    expect(out.split('type="importmap"').length - 1).toBe(1);
  });

  it('bare-спецификаторы three/addons не считаются запрещёнными URL', () => {
    const html = `<script type="module">import { OrbitControls } from 'three/addons/controls/OrbitControls.js';</script>`;
    expect(findForbiddenUrls(html, Object.values(CDN_WHITELIST))).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — OrbitControls всё ещё в списке запрещённых, importmap отсутствует.

- [ ] **Step 3: Открыть addons в whitelist**

В `src/lib/cdn.ts` добавить в `CDN_WHITELIST` после `three`:

```ts
  // Директория аддонов three (OrbitControls, CSS2DRenderer и пр.). Значение —
  // сама директория: allowedPrefixes() берёт путь до последнего '/', поэтому
  // разрешает любой файл под examples/jsm/, включая подкаталоги.
  threeAddons: 'https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/',
```

- [ ] **Step 4: Инжектить importmap в `instrument()`**

В `src/lib/artifact.ts` заменить начало `instrument()`:

```ts
export function instrument(html: string): string {
  if (html.includes(MARKER)) return html;
  // Свой importmap артефакта уважаем: два importmap'а в документе — ошибка браузера.
  const importMap = /type\s*=\s*["']importmap["']/i.test(html)
    ? ''
    : `<script type="importmap">${JSON.stringify({
      imports: {
        three: CDN_WHITELIST.three,
        'three/addons/': CDN_WHITELIST.threeAddons,
      },
    })}</script>`;
  const runtime = `${MARKER}${importMap}<script>${HARNESS_JS}</script>` +
    `<style>${UIKIT_CSS}</style><script>${UIKIT_JS}</script>${END_MARKER}`;
  …
```

Добавить импорт в шапку `src/lib/artifact.ts`: `import { CDN_WHITELIST } from './cdn';`

- [ ] **Step 5: Проверить, что `stripRuntime` снимает и importmap**

`stripRuntime` вырезает всё между `MARKER` и `END_MARKER`, importmap внутри — снимается автоматически. Убедиться прогоном:

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: PASS, включая существующий `reinstrument is idempotent`.

- [ ] **Step 6: Полный прогон и коммит**

Run: `npx vitest run && npx tsc --noEmit`
Expected: все зелёные. Демки, импортирующие three по полному URL (`demos/engine`), продолжают работать — importmap не мешает абсолютным импортам.

```bash
git add -A
git commit -m "feat(kit): allow three addons + inject importmap

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `GENERATION_RULES` и новый каркас промптов

Один блок правил на генератор, фиксер и рефайнер; каркас переписан на SimUI 2.0; снято противоречие по chart.js.

**Files:**
- Modify: `src/lib/pipeline/prompts.ts`
- Test: `tests/unit/prompts.test.ts`

**Interfaces:**
- Consumes: `UIKIT_DOC` (Task 6), `CDN_WHITELIST` (Tasks 3, 7).
- Produces: `GENERATION_RULES: string`; `generatorSystem(styleHint: string, exemplar?: string): string`; `REFINER_SYSTEM`, `FIXER_SYSTEM` включают `GENERATION_RULES`. `STYLE_HINTS[4]` больше не упоминает chart.js.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/prompts.test.ts` добавить:

```ts
import { GENERATION_RULES, generatorSystem, FIXER_SYSTEM, REFINER_SYSTEM, STYLE_HINTS }
  from '@/lib/pipeline/prompts';

describe('GENERATION_RULES', () => {
  it('единый блок правил входит в генератор, фиксер и рефайнер', () => {
    expect(generatorSystem(STYLE_HINTS[0])).toContain(GENERATION_RULES);
    expect(FIXER_SYSTEM).toContain(GENERATION_RULES);
    expect(REFINER_SYSTEM).toContain(GENERATION_RULES);
  });
  it('правила требуют SimUI.expose и запрещают свои fixed-панели', () => {
    expect(GENERATION_RULES).toContain('SimUI.expose');
    expect(GENERATION_RULES).toContain('position:fixed');
  });
  it('ни один акцент не требует chart.js', () => {
    for (const hint of STYLE_HINTS) expect(hint.toLowerCase()).not.toContain('chart.js');
  });
  it('генератор вставляет эталон, когда он передан', () => {
    const withEx = generatorSystem(STYLE_HINTS[0], '<!DOCTYPE html><html>ЭТАЛОН_МАРКЕР</html>');
    expect(withEx).toContain('ЭТАЛОН_МАРКЕР');
    expect(withEx).toContain('ЭТАЛОН КАЧЕСТВА');
    expect(generatorSystem(STYLE_HINTS[0])).not.toContain('ЭТАЛОН КАЧЕСТВА');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/prompts.test.ts`
Expected: FAIL — `GENERATION_RULES` не экспортирован.

- [ ] **Step 3: Переписать `STYLE_HINTS[4]` и добавить `GENERATION_RULES`**

В `src/lib/pipeline/prompts.ts` заменить пятый элемент `STYLE_HINTS`:

```ts
  'Акцент на ДАННЫЕ И ГРАФИКИ: приборная панель через SimUI.chart и SimUI.readout — живые графики величин, численные индикаторы, фазовые/индикаторные диаграммы (mode:"xy").',
```

Добавить после `STYLE_NAMES`:

```ts
/**
 * Правила, общие для генератора, фиксера и рефайнера. Один источник правды:
 * раньше рефайнер их не видел и регрессировал лейаут при каждой доводке.
 */
export const GENERATION_RULES = `Жёсткие правила:
- Ответ — только HTML-документ в блоке \`\`\`html ... \`\`\`. Никакого текста вне блока.
- Один самодостаточный файл. Внешние ресурсы разрешены ТОЛЬКО отсюда (точные URL):
${cdnList}
  Подключай только то, что реально используешь. Без fetch/XHR/WebSocket.
- НЕ создавай своих position:fixed панелей, легенд, баннеров и инфо-блоков.
  Всё это — примитивы SimUI (см. описание кита ниже). Центр экрана — только сцена.
- НЕ подключай библиотеки графиков (chart.js и любые другие) — используй SimUI.chart.
- НЕ подключай KaTeX вручную — используй SimUI.formula, кит грузит KaTeX сам.
- three.js: глобальной сборки нет. В \`<script type="module">\` пиши
  \`import * as THREE from 'three';\` и \`import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\`
  — importmap уже вставлен китом. renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true}).
- Анимация через requestAnimationFrame с dt-шагом и клампом (Math.min(0.05, dt)); от FPS не зависеть.
- Пауза обязана останавливать И физику, И картинку; сброс — возвращать начальное состояние.
- Каждый параметр из spec.parameters — SimUI.slider с тем же name/label/min/max/step/value/unit.
- SimUI.expose({getState, reset}) ОБЯЗАТЕЛЕН: getState возвращает простой объект с числами.
- Никаких NaN и Infinity в подписях и состоянии: делить на ноль и брать корень из
  отрицательного — через Math.max(0, ...) и проверки.
- Физика обязана следовать spec.physics: те же уравнения, разумные величины, единицы.
- Русский язык во всех подписях, единицы измерения у всех величин.
- Никаких заглушек и TODO: всё работает сразу.`;
```

- [ ] **Step 4: Переписать каркас и системные промпты**

Заменить `EXAMPLE_SKELETON` (сохранив комментарий-заголовок) — тело скелета на SimUI 2.0:

```ts
export const EXAMPLE_SKELETON = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Название симуляции</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  canvas#scene { position: fixed; top: 0; left: 0; display: block; }
</style>
</head>
<body>
<canvas id="scene"></canvas>
<script>
(function () {
  // ---------- Константы физики (единицы в комментариях) ----------
  var G = 9.8;    // м/с^2

  // ---------- Состояние + сброс ----------
  var state = {}, param = 20;
  function resetSim() { state = { t: 0, x: 0, v: 0 }; chart.clear(); }
  resetSim();

  // ---------- Канвас ----------
  var canvas = document.getElementById('scene');
  var ctx2d = canvas.getContext('2d');
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }

  // ---------- Физический шаг: чистая функция от dt ----------
  function physics(dt) {
    state.v += -G * dt;
    state.x += state.v * dt;
    state.t += dt;
  }

  // ---------- Отрисовка сцены (по мотивам spec.visualPlan) ----------
  function draw() {
    ctx2d.fillStyle = '#101318';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ---------- Панель управления ----------
  SimUI.title('Название симуляции');
  SimUI.goals(['что должен понять студент']);
  SimUI.slider({ name: 'param', label: 'Параметр', min: 0, max: 100, step: 1, value: param,
    unit: '', onChange: function (v) { param = v; } });
  SimUI.presets({ items: [{ label: 'Слабо', values: { param: 10 } },
    { label: 'Сильно', values: { param: 90 } }] });
  var speed = SimUI.speed({ values: [0.25, 0.5, 1, 2], value: 1 });
  SimUI.playPause({
    onPlay: function () { running = true; lastFrame = null; },
    onPause: function () { running = false; },
    onReset: function () { resetSim(); },
  });

  // ---------- Приборы: баннер фазы, показания, график, формула ----------
  var banner = SimUI.banner({ items: [{ name: 'Фаза 1', sub: 'что происходит', color: '#4f8ff7' }] });
  var rT = SimUI.readout({ label: 'Время', unit: 'с', digits: 2, corner: 'bl' });
  var rX = SimUI.readout({ label: 'Высота', unit: 'м', digits: 2, corner: 'bl' });
  var chart = SimUI.chart({ title: 'Высота от времени', xLabel: 't, с', yLabel: 'h, м',
    series: [{ name: 'h', color: '#4f8ff7' }], corner: 'br' });
  var formula = SimUI.formula({ title: 'Как это работает',
    tex: 'h = h_0 + v_0 t - \\\\frac{g t^2}{2}',
    vars: { g: { label: 'g', unit: 'м/с²' }, t: { label: 't', unit: 'с' } }, corner: 'tl' });

  // ---------- Самопроверка ----------
  SimUI.expose({
    getState: function () { return { t: state.t, x: state.x, v: state.v, param: param }; },
    reset: resetSim,
  });

  // ---------- Главный цикл: dt-clamp, на паузе всё замирает ----------
  var running = true, lastFrame = null;
  function loop(now) {
    if (lastFrame == null) lastFrame = now;
    var dt = Math.min(0.05, (now - lastFrame) / 1000) * speed.get();
    lastFrame = now;
    if (running) {
      physics(dt);
      chart.push(state.t, [state.x]);
      rT.set(state.t); rX.set(state.x);
      formula.set({ g: G, t: state.t });
    }
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`;
```

Заменить `generatorSystem`, `FIXER_SYSTEM`, `REFINER_SYSTEM`:

```ts
export function generatorSystem(styleHint: string, exemplar?: string): string {
  const exemplarBlock = exemplar
    ? `

ЭТАЛОН КАЧЕСТВА — реальная одобренная симуляция на ДРУГУЮ тему. Копируй уровень
проработки, структуру кода и приёмы (баннер фазы, показания, график, формула с живыми
числами, пресеты), но НЕ копируй её тему и физику:
\`\`\`html
${exemplar}
\`\`\``
    : '';
  return `Ты — эксперт по учебным визуализациям (уровень лучших примеров Claude Artifacts).
Напиши ОДИН самодостаточный HTML-файл с интерактивной симуляцией по спецификации.

${styleHint}

${GENERATION_RULES}

Планка качества: у симуляции обязаны быть сцена, приборы (показания и хотя бы один
живой график), формула с подстановкой текущих значений, пресеты режимов и один
запоминающийся момент, ради которого её показывают на занятии.

${UIKIT_DOC}

Каркас качественной симуляции (следуй структуре, содержимое подставь по спецификации):
\`\`\`html
${EXAMPLE_SKELETON}
\`\`\`${exemplarBlock}`;
}

export const FIXER_SYSTEM = `Ты чинишь сломанный HTML-артефакт симуляции. Тебе дают полный
HTML и список проблем: ошибки консоли headless-браузера и/или провалы автоматических проб
поведения. Найди причину и исправь минимальной правкой, сохранив всю функциональность и
стиль. Не переписывай с нуля.

${GENERATION_RULES}`;

export const REFINER_SYSTEM = `Ты улучшаешь HTML-артефакт симуляции по замечаниям судьи,
физика-рецензента и/или запросу преподавателя. Внеси все запрошенные изменения, сохранив
работающее. Не ломай лейаут и контролы.

${GENERATION_RULES}`;
```

- [ ] **Step 5: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`
Expected: все зелёные. Мок-провайдер в `e2e/mock-provider.ts` различает генератор по маркеру `Каркас качественной симуляции` — строка сохранена, e2e не ломается.

```bash
git add -A
git commit -m "feat(prompts): shared GENERATION_RULES, SimUI 2.0 skeleton, exemplar slot

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Роли, `max_tokens`, склейка обрыва, телеметрия

Самая вероятная причина «все кандидаты сломаны» на реальных провайдерах — обрезанный по лимиту токенов HTML. Плюс возможность дать планировщику сильную модель, а фиксеру дешёвую.

**Files:**
- Create: `src/lib/roles.ts`, `tests/unit/roles.test.ts`
- Modify: `src/lib/provider.ts`, `src/lib/types.ts`, `src/lib/pipeline/{run,stages,judge}.ts`
- Test: `tests/unit/provider.test.ts`, `tests/unit/{stages,run,judge}.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `src/lib/roles.ts`: `type Role = 'planner'|'generator'|'fixer'|'critic'|'judge'|'refiner'`; `HTML_ROLES: Role[]`; `resolveRole(p: ProviderProfile, role: Role): { model: string; maxTokens: number; extraBody: Record<string, unknown> }`.
  - `src/lib/types.ts`: `RoleConfig { model?, temperature?, maxTokens?, extraBody? }`; `ProviderProfile.roles?: Partial<Record<Role, RoleConfig>>`; событие `{ type:'usage'; role: Role; model: string; promptTokens: number; completionTokens: number; ms: number }`.
  - `src/lib/provider.ts`: `chatWithClient(client, model, messages, { retries, sleep, extraBody, maxTokens, maxContinuations, onUsage })`; `bindChat(p, role, onUsage?): ChatFn`.
  - `Ctx` (в `stages.ts`) меняется на `{ chat(role, messages), hasVision, render, emit }`.

- [ ] **Step 1: Написать падающий тест на роли**

`tests/unit/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveRole } from '@/lib/roles';
import type { ProviderProfile } from '@/lib/types';

const base: ProviderProfile = {
  id: 'p', name: 'p', baseURL: 'http://x', apiKey: 'k',
  generationModel: 'gen', visionModel: 'vis',
};

describe('resolveRole', () => {
  it('по умолчанию текстовые роли идут на generationModel', () => {
    expect(resolveRole(base, 'planner').model).toBe('gen');
    expect(resolveRole(base, 'generator').model).toBe('gen');
    expect(resolveRole(base, 'fixer').model).toBe('gen');
    expect(resolveRole(base, 'refiner').model).toBe('gen');
  });
  it('по умолчанию критик и судья идут на visionModel', () => {
    expect(resolveRole(base, 'critic').model).toBe('vis');
    expect(resolveRole(base, 'judge').model).toBe('vis');
  });
  it('HTML-роли получают крупный лимит токенов, JSON-роли — умеренный', () => {
    expect(resolveRole(base, 'generator').maxTokens).toBe(16000);
    expect(resolveRole(base, 'refiner').maxTokens).toBe(16000);
    expect(resolveRole(base, 'fixer').maxTokens).toBe(16000);
    expect(resolveRole(base, 'planner').maxTokens).toBe(4000);
    expect(resolveRole(base, 'judge').maxTokens).toBe(4000);
  });
  it('роль из настроек побеждает дефолты, extraBody сливается', () => {
    const p: ProviderProfile = {
      ...base,
      extraBody: { enable_thinking: false },
      roles: { generator: { model: 'big', maxTokens: 32000, temperature: 0.9,
        extraBody: { top_p: 0.8 } } },
    };
    const r = resolveRole(p, 'generator');
    expect(r.model).toBe('big');
    expect(r.maxTokens).toBe(32000);
    expect(r.extraBody).toEqual({ enable_thinking: false, top_p: 0.8, temperature: 0.9 });
  });
});
```

В `tests/unit/provider.test.ts` добавить:

```ts
function fakeClientWithFinish(
  chunks: Array<{ content: string; finish?: string }>,
) {
  let i = 0;
  return {
    chat: { completions: { create: vi.fn(async () => {
      const c = chunks[Math.min(i++, chunks.length - 1)];
      return {
        choices: [{ message: { content: c.content }, finish_reason: c.finish ?? 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };
    }) } },
  };
}

describe('обрыв по лимиту токенов', () => {
  it('склеивает продолжение при finish_reason=length', async () => {
    const c = fakeClientWithFinish([
      { content: '<html><body>нача', finish: 'length' },
      { content: 'ло и конец</body></html>', finish: 'stop' },
    ]);
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }]);
    expect(out).toBe('<html><body>начало и конец</body></html>');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('перестаёт продолжать после maxContinuations и отдаёт склеенное', async () => {
    const c = fakeClientWithFinish([{ content: 'кусок', finish: 'length' }]);
    const out = await chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { maxContinuations: 2 });
    expect(out).toBe('кусоккусоккусок');
    expect(c.chat.completions.create).toHaveBeenCalledTimes(3);
  });

  it('передаёт max_tokens и сообщает usage', async () => {
    const c = fakeClientWithFinish([{ content: 'ок' }]);
    const seen: Array<{ promptTokens: number; completionTokens: number }> = [];
    await chatWithClient(c as never, 'm', [{ role: 'user', content: 'x' }],
      { maxTokens: 777, onUsage: (u) => seen.push(u) });
    expect(c.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 777 }));
    expect(seen[0].promptTokens).toBe(10);
    expect(seen[0].completionTokens).toBe(20);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/roles.test.ts tests/unit/provider.test.ts`
Expected: FAIL — модуля `@/lib/roles` нет, продолжение не реализовано.

- [ ] **Step 3: Расширить типы**

В `src/lib/types.ts` добавить перед `ProviderProfile`:

```ts
export type Role = 'planner' | 'generator' | 'fixer' | 'critic' | 'judge' | 'refiner';

export interface RoleConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
}
```

и в `ProviderProfile` — поле:

```ts
  /**
   * Настройки по ролям пайплайна: планировщику можно дать сильную модель,
   * фиксеру — дешёвую. Пустое поле = поведение по умолчанию (см. resolveRole).
   */
  roles?: Partial<Record<Role, RoleConfig>>;
```

В `PipelineEvent` добавить вариант:

```ts
  | { type: 'usage'; role: Role; model: string; promptTokens: number;
      completionTokens: number; ms: number }
```

- [ ] **Step 4: Создать `src/lib/roles.ts`**

```ts
import type { ProviderProfile, Role } from './types';

/** Роли, которые возвращают полный HTML-документ, — им нужен крупный лимит токенов. */
export const HTML_ROLES: Role[] = ['generator', 'fixer', 'refiner'];

/** Роли, работающие по скриншотам: по умолчанию идут на vision-модель. */
const VISION_ROLES: Role[] = ['critic', 'judge'];

const HTML_MAX_TOKENS = 16000;
const JSON_MAX_TOKENS = 4000;

export function resolveRole(
  p: ProviderProfile,
  role: Role,
): { model: string; maxTokens: number; extraBody: Record<string, unknown> } {
  const cfg = p.roles?.[role];
  const fallbackModel = VISION_ROLES.includes(role) ? p.visionModel : p.generationModel;
  const extraBody: Record<string, unknown> = { ...p.extraBody, ...cfg?.extraBody };
  if (cfg?.temperature !== undefined) extraBody.temperature = cfg.temperature;
  return {
    model: cfg?.model || fallbackModel,
    maxTokens: cfg?.maxTokens ?? (HTML_ROLES.includes(role) ? HTML_MAX_TOKENS : JSON_MAX_TOKENS),
    extraBody,
  };
}
```

- [ ] **Step 5: Реализовать продолжение и usage в `provider.ts`**

Заменить `ChatOpts` и `chatWithClient`:

```ts
export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

interface ChatOpts {
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Провайдер-специфичные поля тела запроса (enable_thinking, temperature, ...). */
  extraBody?: Record<string, unknown>;
  maxTokens?: number;
  /** Сколько раз добирать ответ, оборванный по лимиту токенов. */
  maxContinuations?: number;
  onUsage?: (u: UsageInfo) => void;
}

const CONTINUE_PROMPT =
  'Ответ оборвался по лимиту длины. Продолжи РОВНО с места обрыва, ' +
  'не повторяя уже выданное и не начиная заново. Не добавляй пояснений.';

/**
 * Один вызов модели с ретраями. Ответ, оборванный провайдером по лимиту токенов
 * (finish_reason: 'length'), добирается продолжениями и склеивается: без этого
 * HTML на 6-9k токенов у провайдеров с дефолтом 4096 приходит без </html>
 * и кандидат гибнет на разборе.
 */
export async function chatWithClient(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  {
    retries = 3, sleep = defaultSleep, extraBody, maxTokens,
    maxContinuations = 2, onUsage,
  }: ChatOpts = {},
): Promise<string> {
  const convo: ChatMessage[] = [...messages];
  let combined = '';

  for (let round = 0; round <= maxContinuations; round++) {
    const { text, truncated } = await once(
      client, model, convo, { retries, sleep, extraBody, maxTokens, onUsage });
    combined += text;
    if (!truncated) return combined;
    if (round === maxContinuations) return combined;
    convo.push({ role: 'assistant', content: text });
    convo.push({ role: 'user', content: CONTINUE_PROMPT });
  }
  return combined;
}

async function once(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  { retries, sleep, extraBody, maxTokens, onUsage }: Required<Pick<ChatOpts, 'retries' | 'sleep'>>
    & Pick<ChatOpts, 'extraBody' | 'maxTokens' | 'onUsage'>,
): Promise<{ text: string; truncated: boolean }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const started = Date.now();
    try {
      const res = await client.chat.completions.create({
        model,
        messages: messages as never,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...extraBody,
      });
      const choice = res.choices[0];
      const text = choice?.message?.content;
      if (!text) throw new Error('empty response from provider');
      onUsage?.({
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
        ms: Date.now() - started,
      });
      return { text, truncated: choice?.finish_reason === 'length' };
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
      if (attempt < retries - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export function bindChat(
  p: ProviderProfile,
  role: Role,
  onUsage?: (u: UsageInfo & { role: Role; model: string }) => void,
): ChatFn {
  const client = makeClient(p);
  const { model, maxTokens, extraBody } = resolveRole(p, role);
  return (messages) => chatWithClient(client, model, messages, {
    extraBody, maxTokens,
    onUsage: onUsage ? (u) => onUsage({ ...u, role, model }) : undefined,
  });
}
```

Добавить импорты в шапку `src/lib/provider.ts`:

```ts
import type { ProviderProfile, Role } from './types';
import { resolveRole } from './roles';
```

- [ ] **Step 6: Перевести пайплайн на `ctx.chat(role, …)`**

В `src/lib/pipeline/stages.ts` заменить интерфейс `Ctx`:

```ts
export interface Ctx {
  /** Один вход в модель для всех ролей: конфиг роли резолвится в provider-слое. */
  chat: (role: Role, messages: ChatMessage[]) => Promise<string>;
  /** Доступна ли vision-модель (критик и судья). */
  hasVision: boolean;
  render: RenderFn;
  emit: (e: PipelineEvent) => void;
}
```

и заменить обращения:
- `plan`: `ctx.genChat([...])` → `ctx.chat('planner', [...])`
- `generateCandidate`: → `ctx.chat('generator', [...])`
- `fixArtifact`: → `ctx.chat('fixer', [...])`
- `verifyCandidate`: `if (ctx.visionChat)` → `if (ctx.hasVision)`, `ctx.visionChat([...])` → `ctx.chat('critic', [...])`

В `src/lib/pipeline/judge.ts`: `if (!ctx.visionChat)` → `if (!ctx.hasVision)`, `ctx.visionChat([...])` → `ctx.chat('judge', [...])`.

В `src/lib/pipeline/run.ts` заменить `makeCtx`:

```ts
export function makeCtx(emit: (e: PipelineEvent) => void): Ctx {
  const p = activeProvider();
  if (!p) throw new Error('Провайдер не настроен. Откройте Настройки.');
  const onUsage = (u: UsageInfo & { role: Role; model: string }) =>
    emit({ type: 'usage', role: u.role, model: u.model,
      promptTokens: u.promptTokens, completionTokens: u.completionTokens, ms: u.ms });
  const chats = new Map<Role, ChatFn>();
  return {
    chat: (role, messages) => {
      if (!chats.has(role)) chats.set(role, bindChat(p, role, onUsage));
      return chats.get(role)!(messages);
    },
    hasVision: !!p.visionModel,
    render: (html, opts) => renderArtifact(html, opts),
    emit,
  };
}
```

и заменить в `run.ts` все `ctx.visionChat` на `ctx.hasVision`, а `refineHtml` — `ctx.genChat([...])` → `ctx.chat('refiner', [...])`.

Импорты, которые нужно поправить:
- `src/lib/pipeline/stages.ts`: в импорт типов из `../types` добавить `Role`; из `../provider` импортировать `type ChatMessage` (вместо `type ChatFn`, который больше не используется).
- `src/lib/pipeline/judge.ts`: `Ctx` уже импортируется из `./stages` — менять импорты не нужно.
- `src/lib/pipeline/run.ts`: из `../provider` импортировать `bindChat, type ChatFn, type UsageInfo`; из `../types` добавить `Role` в импорт типов.

- [ ] **Step 7: Обновить тесты пайплайна**

В `tests/unit/stages.test.ts`, `run.test.ts`, `judge.test.ts` заменить конструкцию контекста. Пример для `stages.test.ts`:

```ts
function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    chat: vi.fn(async (role: Role) =>
      role === 'critic' || role === 'judge'
        ? '{"physicsOk": true, "issues": []}'
        : '```html\n' + HTML + '\n```'),
    hasVision: true,
    render: vi.fn(async () => okRender),
    emit: vi.fn(),
    ...over,
  };
}
```

Тесты, проверявшие число вызовов фиксера через `c.genChat`, переписать на подсчёт вызовов с ролью:

```ts
    const calls = (c.chat as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.filter((c2) => c2[0] === 'fixer')).toHaveLength(1);
```

Тесты с `visionChat: null` → `hasVision: false`.

- [ ] **Step 8: Полный прогон и коммит**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: всё зелёное.

```bash
git add -A
git commit -m "feat(provider): per-role models, max_tokens, truncation continuation, usage telemetry

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Подбор эталона из `demos/`

Модель видит не только 60-строчный каркас, но и целую одобренную симуляцию — ближайшую по теме и режиму.

**Files:**
- Create: `src/lib/exemplars.ts`, `tests/unit/exemplars.test.ts`
- Modify: `src/lib/demos.ts`, `demos/*/meta.json`, `src/lib/pipeline/stages.ts`
- Test: `tests/unit/stages.test.ts`

**Interfaces:**
- Consumes: `listBundledDemos()` (`src/lib/demos.ts`), `generatorSystem(styleHint, exemplar?)` (Task 8).
- Produces: `scoreExemplar(demo: DemoEntry, spec: PlanSpec): number`; `pickExemplar(demos: DemoEntry[], spec: PlanSpec): DemoEntry | null`; `DemoEntry` получает `mode?: '2d'|'3d'`, `libs?: string[]`, `keywords?: string[]`, `techniques?: string[]`, `exemplar?: boolean`. `generateCandidate(ctx, spec, styleHint, exemplar?)`.

- [ ] **Step 1: Написать падающий тест**

`tests/unit/exemplars.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickExemplar, scoreExemplar } from '@/lib/exemplars';
import type { DemoEntry } from '@/lib/demos';
import type { PlanSpec } from '@/lib/types';

function demo(over: Partial<DemoEntry>): DemoEntry {
  return {
    slug: 'x', title: 't', prompt: 'p', subject: 'Физика', tags: [],
    html: '<html></html>', ...over,
  };
}

const spec: PlanSpec = {
  title: 'Четырёхтактный двигатель', subject: 'Техника', mode: '3d',
  learningGoals: [], physics: 'кривошипно-шатунный механизм, цикл Отто',
  parameters: [], visualPlan: 'разрез цилиндра',
};

describe('scoreExemplar', () => {
  it('совпадение режима и предмета поднимает оценку', () => {
    const same = demo({ slug: 'a', mode: '3d', subject: 'Техника' });
    const other = demo({ slug: 'b', mode: '2d', subject: 'Биология' });
    expect(scoreExemplar(same, spec)).toBeGreaterThan(scoreExemplar(other, spec));
  });
  it('совпадение ключевых слов поднимает оценку', () => {
    const hit = demo({ slug: 'a', keywords: ['двигатель', 'цикл отто'] });
    const miss = demo({ slug: 'b', keywords: ['осмос'] });
    expect(scoreExemplar(hit, spec)).toBeGreaterThan(scoreExemplar(miss, spec));
  });
});

describe('pickExemplar', () => {
  it('выбирает лучшего и детерминирован при равенстве (по slug)', () => {
    const a = demo({ slug: 'bbb', mode: '3d' });
    const b = demo({ slug: 'aaa', mode: '3d' });
    expect(pickExemplar([a, b], spec)!.slug).toBe('aaa');
    expect(pickExemplar([b, a], spec)!.slug).toBe('aaa');
  });
  it('пропускает слишком большие эталоны', () => {
    const big = demo({ slug: 'big', mode: '3d', html: 'x'.repeat(40000) });
    const small = demo({ slug: 'small', mode: '2d', html: '<html></html>' });
    expect(pickExemplar([big, small], spec)!.slug).toBe('small');
  });
  it('пустой список -> null', () => {
    expect(pickExemplar([], spec)).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/exemplars.test.ts`
Expected: FAIL — `Cannot find module '@/lib/exemplars'`.

- [ ] **Step 3: Расширить `DemoEntry`**

В `src/lib/demos.ts` дополнить оба интерфейса и чтение:

```ts
export interface DemoEntry {
  slug: string;
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  html: string;
  /** Метаданные для подбора эталона (см. src/lib/exemplars.ts). */
  mode?: '2d' | '3d';
  libs?: string[];
  keywords?: string[];
  techniques?: string[];
  /** Эталон уровня SimUI 2.0 — к нему применяется строгий гейт качества. */
  exemplar?: boolean;
}

interface DemoMetaFile {
  title: string;
  prompt: string;
  subject: string;
  tags: string[];
  mode?: '2d' | '3d';
  libs?: string[];
  keywords?: string[];
  techniques?: string[];
  exemplar?: boolean;
}
```

и в `listBundledDemos()` заменить push:

```ts
    demos.push({
      slug, title: meta.title, prompt: meta.prompt, subject: meta.subject, tags: meta.tags,
      mode: meta.mode, libs: meta.libs, keywords: meta.keywords,
      techniques: meta.techniques, exemplar: meta.exemplar, html,
    });
```

- [ ] **Step 4: Создать `src/lib/exemplars.ts`**

```ts
import type { DemoEntry } from './demos';
import type { PlanSpec } from './types';

/** Больше этого в промпт не кладём: эталон и так занимает ~7k токенов. */
const MAX_EXEMPLAR_CHARS = 30000;

function haystack(spec: PlanSpec): string {
  return [spec.title, spec.subject, spec.physics, spec.visualPlan, ...spec.learningGoals]
    .join(' ')
    .toLowerCase();
}

/**
 * Детерминированный скоринг близости демки к спецификации: режим важнее предмета,
 * предмет важнее отдельных ключевых слов. Без эмбеддингов — результат воспроизводим
 * и проверяем тестом.
 */
export function scoreExemplar(demo: DemoEntry, spec: PlanSpec): number {
  const text = haystack(spec);
  let score = 0;
  if (demo.mode && demo.mode === spec.mode) score += 5;
  if (demo.subject && demo.subject.toLowerCase() === spec.subject.toLowerCase()) score += 3;
  let keywordHits = 0;
  for (const k of demo.keywords ?? []) {
    if (k && text.includes(k.toLowerCase())) keywordHits++;
  }
  score += Math.min(keywordHits, 3) * 2;
  for (const t of demo.techniques ?? []) {
    if (t && text.includes(t.toLowerCase())) score += 1;
  }
  if (demo.exemplar) score += 2;
  return score;
}

/** Лучший эталон под спецификацию; при равенстве оценок — по slug (детерминизм). */
export function pickExemplar(demos: DemoEntry[], spec: PlanSpec): DemoEntry | null {
  const usable = demos.filter((d) => d.html.length <= MAX_EXEMPLAR_CHARS);
  if (usable.length === 0) return null;
  return usable.reduce((best, d) => {
    const ds = scoreExemplar(d, spec);
    const bs = scoreExemplar(best, spec);
    if (ds > bs) return d;
    if (ds === bs && d.slug < best.slug) return d;
    return best;
  });
}
```

- [ ] **Step 5: Заполнить метаданные демок**

В каждый `demos/<slug>/meta.json` добавить поля. Значения:

| slug | mode | libs | keywords | techniques |
|---|---|---|---|---|
| `engine` | `3d` | `["three"]` | `["двигатель","внутреннего сгорания","цикл отто","такт","поршень","коленвал"]` | `["kinematic-chain","particles","3d-scene"]` |
| `kepler` | `2d` | `[]` | `["орбита","кеплер","планета","тяготение","эллипс"]` | `["orbit-integration","trail"]` |
| `efield` | `2d` | `[]` | `["электрическое поле","заряд","силовые линии","потенциал"]` | `["vector-field","field-lines"]` |
| `diffusion` | `2d` | `[]` | `["диффузия","молекулы","броуновское","перемешивание"]` | `["particles","random-walk"]` |
| `osmosis` | `2d` | `[]` | `["осмос","мембрана","концентрация","растворитель"]` | `["particles","membrane"]` |
| `convection` | `2d` | `[]` | `["конвекция","тёплый воздух","циркуляция","теплообмен"]` | `["vector-field","particles"]` |
| `interference` | `2d` | `[]` | `["интерференция","волны","источник","максимум"]` | `["wave-grid"]` |
| `refraction` | `2d` | `[]` | `["преломление","свет","снелла","полное внутреннее отражение"]` | `["ray-tracing"]` |
| `ideal-gas` | `2d` | `[]` | `["идеальный газ","давление","температура","объём","поршень"]` | `["particles","thermodynamics"]` |
| `pendulum` | `2d` | `[]` | `["маятник","колебания","период","амплитуда","энергия"]` | `["ode-integration","live-chart"]` |

Пример для `demos/engine/meta.json` — добавить в объект:

```json
  "mode": "3d",
  "libs": ["three"],
  "keywords": ["двигатель", "внутреннего сгорания", "цикл отто", "такт", "поршень", "коленвал"],
  "techniques": ["kinematic-chain", "particles", "3d-scene"]
```

- [ ] **Step 6: Подать эталон генератору**

В `src/lib/pipeline/stages.ts` изменить `generateCandidate`:

```ts
export async function generateCandidate(
  ctx: Ctx, spec: PlanSpec, styleHint: string, exemplar?: string,
): Promise<string> {
  const out = await ctx.chat('generator', [
    { role: 'system', content: generatorSystem(styleHint, exemplar) },
    { role: 'user', content: 'Спецификация:\n' + JSON.stringify(spec, null, 2) },
  ]);
  return instrument(extractHtml(out));
}
```

В `src/lib/pipeline/run.ts`, в `runPipeline`, после `ctx.emit({ type: 'plan-ready', … })` добавить:

```ts
  // Ближайшая одобренная демка идёт генератору как эталон уровня проработки.
  const exemplarEntry = pickExemplar(listBundledDemos(), spec);
  const exemplarHtml = exemplarEntry ? exemplarEntry.html : undefined;
```

и в вызове `generateCandidate(ctx, spec, hint)` → `generateCandidate(ctx, spec, hint, exemplarHtml)`.

Импорты в `run.ts`: `import { pickExemplar } from '../exemplars';` и `import { listBundledDemos } from '../demos';`

В `tests/unit/stages.test.ts` добавить:

```ts
  it('передаёт эталон в системный промпт генератора', async () => {
    const c = ctx();
    await generateCandidate(c, SPEC, 'стиль', '<html>ЭТАЛОН_МАРКЕР</html>');
    const sys = String((c.chat as ReturnType<typeof vi.fn>).mock.calls[0][1][0].content);
    expect(sys).toContain('ЭТАЛОН_МАРКЕР');
  });
```

- [ ] **Step 7: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add -A
git commit -m "feat(pipeline): pick nearest bundled demo as few-shot exemplar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Пробы и целевая починка в пайплайне

Пробы начинают влиять на результат: их провалы уходят в фиксер, критик получает severity, блокеры чинятся отдельным раундом, всё видно в UI.

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/renderer.ts`, `src/lib/pipeline/{stages,prompts}.ts`
- Modify: `src/components/progress/deriveProgress.ts`, `src/components/progress/CandidateCard.tsx`
- Test: `tests/unit/{stages,derive-progress}.test.ts`

**Interfaces:**
- Consumes: `runProbes` (Task 4), `openSession` (Task 3), `Ctx.chat` (Task 9).
- Produces: `RenderReport.probes?: ProbeReport`; `RenderFn = (html: string, opts?: { probes?: boolean }) => Promise<RenderReport>`; `CriticIssue { severity: 'blocker'|'major'|'minor'; text: string }`; `CriticReport.issues: CriticIssue[]`; события `{type:'probe-report', index, results, passRate}` и `{type:'targeted-fix', index, issues}`; `CandidateInfo.probes` в `deriveProgress`.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/stages.test.ts` добавить:

```ts
import type { ProbeReport } from '@/lib/pipeline/probes';

const probesOk: ProbeReport = {
  results: [{ id: 'pause', label: 'Пауза', status: 'pass', detail: '' }],
  passRate: 1, failures: [], shots: [],
};
const probesBad: ProbeReport = {
  results: [{ id: 'pause', label: 'Пауза останавливает анимацию', status: 'fail',
    detail: 'кадры продолжают меняться' }],
  passRate: 0, failures: ['Пауза останавливает анимацию: кадры продолжают меняться'], shots: [],
};

describe('пробы в verifyCandidate', () => {
  it('провал пробы отправляет кандидата в фиксер и попадает в текст ошибок', async () => {
    const render = vi.fn()
      .mockResolvedValueOnce({ ...okRender, probes: probesBad })
      .mockResolvedValueOnce({ ...okRender, probes: probesOk });
    const c = ctx({ render });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(true);
    const fixerCalls = (c.chat as ReturnType<typeof vi.fn>).mock.calls
      .filter((call) => call[0] === 'fixer');
    expect(fixerCalls).toHaveLength(1);
    expect(JSON.stringify(fixerCalls[0][1])).toContain('Пауза останавливает анимацию');
  });

  it('эмитит probe-report с долей пройденных проб', async () => {
    const c = ctx({ render: vi.fn(async () => ({ ...okRender, probes: probesOk })) });
    await verifyCandidate(c, SPEC, HTML, 1, 'Данные');
    const ev = (c.emit as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0]).find((e) => e.type === 'probe-report');
    expect(ev).toMatchObject({ index: 1, passRate: 1 });
  });
});

describe('целевая починка по замечаниям критика', () => {
  it('блокер от критика запускает один раунд правки и переpроверку', async () => {
    const chat = vi.fn(async (role: string) => {
      if (role === 'critic') {
        return JSON.stringify({ physicsOk: false, issues: [
          { severity: 'blocker', text: 'частицы вылетают за стенки сосуда' }] });
      }
      return '```html\n' + HTML + '\n```';
    });
    const render = vi.fn(async () => ({ ...okRender, probes: probesOk }));
    const c = ctx({ chat, render });
    const r = await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    expect(r.alive).toBe(true);
    const refinerCalls = chat.mock.calls.filter((call) => call[0] === 'refiner');
    expect(refinerCalls).toHaveLength(1);
    expect(JSON.stringify(refinerCalls[0][1])).toContain('вылетают за стенки');
    const ev = (c.emit as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0]).find((e) => e.type === 'targeted-fix');
    expect(ev).toMatchObject({ index: 0 });
  });

  it('только minor-замечания целевую починку не запускают', async () => {
    const chat = vi.fn(async (role: string) => {
      if (role === 'critic') {
        return JSON.stringify({ physicsOk: true, issues: [
          { severity: 'minor', text: 'подписи мелковаты' }] });
      }
      return '```html\n' + HTML + '\n```';
    });
    const c = ctx({ chat, render: vi.fn(async () => ({ ...okRender, probes: probesOk })) });
    await verifyCandidate(c, SPEC, HTML, 0, 'Реализм');
    expect(chat.mock.calls.filter((call) => call[0] === 'refiner')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/stages.test.ts`
Expected: FAIL — фиксер не вызывается на провал пробы, `probe-report` не эмитится.

- [ ] **Step 3: Расширить типы и рендерер**

В `src/lib/types.ts`:

```ts
export type CriticSeverity = 'blocker' | 'major' | 'minor';

export interface CriticIssue {
  severity: CriticSeverity;
  text: string;
}

export interface CriticReport {
  physicsOk: boolean;
  issues: CriticIssue[];
}
```

в `RenderReport` добавить `probes?: ProbeReport;` (импорт: `import type { ProbeReport } from './pipeline/probes';`), в `PipelineEvent` добавить:

```ts
  | { type: 'probe-report'; index: number; passRate: number;
      results: { id: string; label: string; status: 'pass' | 'fail' | 'skip'; detail: string }[] }
  | { type: 'targeted-fix'; index: number; issues: string[] }
```

В `src/lib/renderer.ts` добавить опцию `probes` в `renderArtifact`:

```ts
export async function renderArtifact(
  html: string,
  { timeoutMs = 15000, shotTimes = [300, 1200, 3000], probes = false }:
    { timeoutMs?: number; shotTimes?: number[]; probes?: boolean } = {},
): Promise<RenderReport> {
```

и после сбора скриншотов, перед `session.close()`:

```ts
  let probeReport: ProbeReport | undefined;
  if (probes) {
    try {
      probeReport = await runProbes(session);
      screenshots.push(...probeReport.shots);
    } catch (e) {
      session.errors().push('probe failure: ' + String(e));
    }
  }
```

в возвращаемый объект добавить `probes: probeReport`. Импорт: `import { runProbes, type ProbeReport } from './pipeline/probes';`

Обновить тип `RenderFn`:

```ts
export type RenderFn = (
  html: string,
  opts?: { timeoutMs?: number; shotTimes?: number[]; probes?: boolean },
) => Promise<RenderReport>;
```

- [ ] **Step 4: Подключить пробы и целевую починку в `verifyCandidate`**

В `src/lib/pipeline/stages.ts`:

1. Первый рендер кандидата — с пробами: `let report = await ctx.render(current, { probes: true });` и внутри цикла починки так же.

2. В сборку `errors` для фиксера добавить провалы проб — после строки с `forbidden`:

```ts
    for (const f of report.probes?.failures ?? []) errors.push('Проба не пройдена — ' + f);
```

3. Условие выхода из цикла починки дополнить провалами проб:

```ts
    const probeFailed = (report.probes?.failures.length ?? 0) > 0;
    if (report.ok && report.animated && forbidden.length === 0 && !probeFailed) break;
```

4. Функция `rank` учитывает пробы (чистый кандидат с пройденными пробами выигрывает у чистого с провалами) — заменить:

```ts
function rank(html: string, report: RenderReport): 0 | 1 | 2 | 3 {
  if (!report.ok || findForbiddenUrls(html, CDN_ALLOWED).length > 0) return 0;
  if (!report.animated) return 1;
  return (report.probes?.failures.length ?? 0) > 0 ? 2 : 3;
}
```

5. После успешного рендера эмитить отчёт проб — перед блоком критика:

```ts
  if (report.probes) {
    ctx.emit({
      type: 'probe-report', index, passRate: report.probes.passRate,
      results: report.probes.results.map((r) => ({
        id: r.id, label: r.label, status: r.status, detail: r.detail })),
    });
  }
```

6. Критик получает отчёт проб и отвечает с severity. Заменить `CRITIC_SYSTEM` в `prompts.ts`:

```ts
export const CRITIC_SYSTEM = `Ты — придирчивый физик-рецензент. Тебе дают спецификацию
симуляции, скриншоты её кадров и отчёт автоматических проб поведения. Проверь:
1) Физическая корректность видимого поведения относительно спецификации (уравнения,
   масштабы, направления, граничные условия).
2) Читаемость: подписи, единицы, цветовое кодирование, не пустой ли экран, не
   перекрывают ли панели сцену.
3) Признаки поломки: наложения, вылет за границы, NaN в подписях, чёрный экран.
Отвечай ТОЛЬКО JSON:
{"physicsOk": true|false,
 "issues": [{"severity": "blocker"|"major"|"minor", "text": "конкретная проблема"}, ...]}
severity: blocker — симуляция учит неверному или неработоспособна; major — заметная
ошибка физики или читаемости; minor — косметика. Пустой массив issues — только если
придраться реально не к чему.`;
```

и передавать пробы в сообщение критика — в `verifyCandidate` заменить `animationNote` на:

```ts
      const probeNote = report.probes && report.probes.failures.length
        ? '\n\nАвтоматические пробы не пройдены:\n- ' + report.probes.failures.join('\n- ')
        : '';
      const animationNote = report.animated
        ? ''
        : `\n\nВНИМАНИЕ: ${STATIC_ANIMATION_ERROR.toLowerCase()} даже после попыток починки.`;
```
и в `textPart(...)` использовать `+ animationNote + probeNote`.

7. Разбор ответа критика с обратной совместимостью (модель может вернуть массив строк):

```ts
      const raw = extractJson<{ physicsOk: boolean; issues: unknown[] }>(out);
      critic = {
        physicsOk: !!raw.physicsOk,
        issues: (raw.issues ?? []).map((i): CriticIssue =>
          typeof i === 'string'
            ? { severity: 'major', text: i }
            : { severity: (i as CriticIssue).severity ?? 'major',
                text: String((i as CriticIssue).text ?? '') }),
      };
```

8. Целевая починка — после эмита `critic-verdict`, перед финальным `candidate: ok`:

```ts
  // Замечания критика раньше уходили только судье и никогда не чинились.
  // Блокеры и мажоры получают один целевой раунд правки с перепроверкой.
  const serious = (critic?.issues ?? []).filter(
    (i) => i.severity === 'blocker' || i.severity === 'major');
  if (serious.length > 0) {
    ctx.emit({ type: 'targeted-fix', index, issues: serious.map((i) => i.text) });
    try {
      const instruction = 'Исправь именно эти замечания рецензента, не трогая остальное:\n- ' +
        serious.map((i) => i.text).join('\n- ');
      const out = await ctx.chat('refiner', [
        { role: 'system', content: REFINER_SYSTEM },
        { role: 'user', content: `${instruction}\n\nHTML:\n\`\`\`html\n${stripRuntime(current)}\n\`\`\`` },
      ]);
      const fixed = instrument(extractHtml(out));
      const fixedReport = await ctx.render(fixed, { probes: true });
      if (rank(fixed, fixedReport) >= rank(current, report)) {
        current = fixed;
        report = fixedReport;
      }
    } catch {
      // Целевая починка — попытка улучшить, а не обязательный этап:
      // её провал не должен убивать живого кандидата.
    }
  }
```

Импорты в `stages.ts`: добавить `CriticIssue` в импорт типов, `REFINER_SYSTEM` в импорт из `./prompts`, `stripRuntime` в импорт из `../artifact`.

- [ ] **Step 5: Показать пробы в UI**

В `src/components/progress/deriveProgress.ts` добавить в `CandidateInfo`:

```ts
  probes?: { passRate: number; failed: string[] };
  targetedFix?: string[];
```

и в редьюсере событий (внутри `deriveProgress`, рядом с обработкой `critic-verdict`) добавить ветки:

```ts
    if (e.type === 'probe-report') {
      const c = candMap.get(e.index);
      if (c) {
        c.probes = {
          passRate: e.passRate,
          failed: e.results.filter((r) => r.status === 'fail').map((r) => `${r.label}: ${r.detail}`),
        };
      }
    }
    if (e.type === 'targeted-fix') {
      const c = candMap.get(e.index);
      if (c) c.targetedFix = e.issues;
    }
```

В `src/components/progress/CandidateCard.tsx` после блока вердикта критика добавить:

```tsx
      {cand.probes && (
        <div className={cand.probes.failed.length ? 'cand-probes warn' : 'cand-probes ok'}>
          {cand.probes.failed.length === 0
            ? `✓ пробы пройдены (${Math.round(cand.probes.passRate * 100)}%)`
            : `⚠ пробы: ${cand.probes.failed.length} провал(ов)`}
          {cand.probes.failed.length > 0 && (
            <ul>{cand.probes.failed.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
        </div>
      )}
```

В `src/app/globals.css` добавить:

```css
.cand-probes { font-size: 12px; margin-top: 6px; }
.cand-probes.ok { color: var(--ok, #2e7d4f); }
.cand-probes.warn { color: var(--warn, #a35b00); }
.cand-probes ul { margin: 4px 0 0; padding-left: 16px; }
```

В `tests/unit/derive-progress.test.ts` добавить:

```ts
  it('probe-report и targeted-fix попадают в карточку кандидата', () => {
    const state = deriveProgress([
      { type: 'candidate', index: 0, status: 'ok', styleHint: 'Реализм' },
      { type: 'probe-report', index: 0, passRate: 0.8,
        results: [{ id: 'pause', label: 'Пауза', status: 'fail', detail: 'не работает' }] },
      { type: 'targeted-fix', index: 0, issues: ['частицы вылетают'] },
    ]);
    expect(state.candidates[0].probes).toEqual({
      passRate: 0.8, failed: ['Пауза: не работает'] });
    expect(state.candidates[0].targetedFix).toEqual(['частицы вылетают']);
  });
```

- [ ] **Step 6: Проверить и закоммитить**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: всё зелёное.

```bash
git add -A
git commit -m "feat(pipeline): probes drive fixer, critic severity triggers targeted fix

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Эталонные демки на SimUI 2.0 и расширенный гейт

`engine` становится «ДВС, но лучше» из спеки, `pendulum` уходит с chart.js на `SimUI.chart`, демо-гейт начинает проверять пробы.

**Files:**
- Modify: `demos/engine/artifact.html`, `demos/engine/meta.json`, `demos/pendulum/artifact.html`, `demos/pendulum/meta.json`
- Modify: `src/lib/cdn.ts`
- Modify: `tests/integration/demos.test.ts`
- Test: `tests/unit/artifact.test.ts`

**Interfaces:**
- Consumes: все примитивы SimUI 2.0 (Tasks 5-6), `three/addons` (Task 7), `runProbes` (Task 4).
- Produces: демки с `"exemplar": true`; `CDN_WHITELIST` без `chart`.

- [ ] **Step 1: Написать падающий гейт**

Заменить тело `describe` в `tests/integration/demos.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { listBundledDemos } from '@/lib/demos';
import { openSession, renderArtifact, closeBrowser } from '@/lib/renderer';
import { instrument } from '@/lib/artifact';
import { runProbes } from '@/lib/pipeline/probes';

const demos = listBundledDemos();

describe('demos quality gate (real demos/ dir)', () => {
  afterAll(() => closeBrowser());

  it('has at least 10 bundled demos', () => {
    expect(demos.length).toBeGreaterThanOrEqual(10);
  });

  it('есть хотя бы две эталонные демки на SimUI 2.0', () => {
    expect(demos.filter((d) => d.exemplar).length).toBeGreaterThanOrEqual(2);
  });

  for (const demo of demos) {
    it(
      `demo "${demo.slug}" renders ok, animated, no errors`,
      async () => {
        expect(demo.title).toBeTruthy();
        expect(demo.prompt).toBeTruthy();
        expect(demo.subject).toBeTruthy();
        expect(Array.isArray(demo.tags)).toBe(true);
        expect(demo.tags.length).toBeGreaterThan(0);

        const report = await renderArtifact(instrument(demo.html), { shotTimes: [300, 1500] });
        expect(report.errors).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.animated).toBe(true);
      },
      60000,
    );

    it(
      `demo "${demo.slug}" проходит поведенческие пробы без провалов`,
      async () => {
        const s = await openSession(instrument(demo.html));
        try {
          const probes = await runProbes(s);
          expect(probes.failures).toEqual([]);
        } finally {
          await s.close();
        }
      },
      90000,
    );
  }

  for (const demo of demos.filter((d) => d.exemplar)) {
    it(`эталон "${demo.slug}" не рисует своих fixed-панелей и реализует expose`, async () => {
      // Кит сам расставляет панели по углам; рукописные position:fixed в эталоне
      // означают, что промпт учит модель плохому примеру.
      const ownFixed = demo.html
        .replace(/canvas[^{]*\{[^}]*\}/g, '')
        .match(/position:\s*fixed/g) ?? [];
      expect(ownFixed).toEqual([]);
      expect(demo.html).toContain('SimUI.expose');
    });
  }
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/integration/demos.test.ts`
Expected: FAIL — нет демок с `exemplar: true`, `engine` и `pendulum` рисуют свои fixed-панели, `pendulum` тянет chart.js.

- [ ] **Step 3: Переписать `demos/engine/artifact.html` на SimUI 2.0**

Правки к существующему файлу (геометрия, частицы, кинематика КШМ и цикл тактов не меняются):

**3.1.** Заменить `<head>` целиком (убрать KaTeX-подключение и все стили панелей — их теперь даёт кит):

```html
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Четырёхтактный двигатель внутреннего сгорания</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #101318; }
  #scene { position: fixed; top: 0; left: 0; display: block; z-index: 0; }
</style>
</head>
```

**3.2.** Удалить из `<body>` блоки `<div id="stroke-banner">…</div>` и `<div id="formula-panel">…</div>` — остаётся только `<canvas id="scene"></canvas>`.

**3.3.** Заменить импорт three и добавить OrbitControls (importmap вставляет кит):

```html
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

**3.4.** Удалить функцию `renderFormula` и её вызов, а также функцию `layoutBanner` и её вызов из `resize()`.

**3.5.** Заменить блок камеры на управляемую орбиту — после создания `renderer` и `camera`:

```js
  var controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CENTER);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.5;
  controls.maxDistance = 12;
  var autoRotate = true;
  controls.addEventListener('start', function () { autoRotate = false; });
```

и заменить `updateCamera()` на:

```js
  function updateCamera(dt) {
    if (autoRotate) {
      orbitAngle += 0.15 * dt;
      var Rc = 5.4;
      camera.position.set(
        CENTER.x + Rc * Math.sin(orbitAngle),
        CENTER.y + 0.55,
        CENTER.z + Rc * Math.cos(orbitAngle));
      camera.lookAt(CENTER);
    }
    controls.update();
  }
```

в `loop(now)` вызов заменить на `updateCamera(dt);` и убрать `orbitAngle += 0.15 * dt;` из `stepPhysics`.

**3.6.** Добавить термодинамику цикла Отто — перед блоком `// ---------- Состояние симуляции ----------`:

```js
  // ---------- Термодинамика цикла Отто ----------
  var GAMMA = 1.4;            // показатель адиабаты для воздуха
  var P0 = 1.0;               // атмосферное давление, бар
  var IGNITION_RATIO = 3.2;   // скачок давления при сгорании при постоянном объёме
  var eps = 10;               // степень сжатия, слайдер 6..14
  var BORE_AREA = Math.PI * PISTON_RADIUS * PISTON_RADIUS;  // условные единицы площади

  /** Объём над поршнем в условных литрах: рабочий объём + камера сгорания. */
  function volume(theta, epsilon) {
    var swept = BORE_AREA * (PISTON_MAX_Y - pistonY(theta));
    var displacement = BORE_AREA * (PISTON_MAX_Y - PISTON_MIN_Y);
    var clearance = displacement / (epsilon - 1);
    return clearance + swept;
  }

  /** Давление в цилиндре по тактам: адиабаты сжатия и расширения, изобары обмена. */
  function pressure(strokeIndex, theta, epsilon) {
    var vmax = volume(Math.PI, epsilon);   // НМТ
    var vmin = volume(0, epsilon);         // ВМТ
    var v = volume(theta, epsilon);
    if (strokeIndex === 0) return P0;
    if (strokeIndex === 1) return P0 * Math.pow(vmax / v, GAMMA);
    if (strokeIndex === 2) {
      var p3 = P0 * Math.pow(vmax / vmin, GAMMA) * IGNITION_RATIO;
      return p3 * Math.pow(vmin / v, GAMMA);
    }
    return P0 * 1.08;
  }

  /** Термический КПД идеального цикла Отто. */
  function efficiency(epsilon) { return 1 - Math.pow(epsilon, 1 - GAMMA); }
```

**3.7.** Заменить весь блок `// ---------- SimUI ----------` и связанные с ним ссылки на элементы:

```js
  // ---------- SimUI ----------
  SimUI.title('Четырёхтактный ДВС');
  SimUI.goals([
    'Как вращение коленвала превращается в ход поршня',
    'Что происходит в каждом из четырёх тактов',
    'Почему степень сжатия поднимает КПД',
  ]);
  SimUI.slider({
    name: 'rpm', label: 'Обороты', min: 60, max: 3000, step: 10, value: rpm, unit: 'об/мин',
    onChange: function (v) { rpm = v; },
  });
  SimUI.slider({
    name: 'eps', label: 'Степень сжатия', min: 6, max: 14, step: 0.5, value: eps, unit: '',
    onChange: function (v) { eps = v; pvChart.clear(); },
  });
  SimUI.presets({ items: [
    { label: 'Холостой ход', values: { rpm: 800, eps: 10 } },
    { label: 'Город', values: { rpm: 1800, eps: 10 } },
    { label: 'Трасса', values: { rpm: 2600, eps: 12 } },
  ] });
  SimUI.select({
    name: 'view', label: 'Ракурс',
    options: [{ value: 'auto', label: 'Облёт' }, { value: 'side', label: 'Сбоку' },
      { value: 'top', label: 'Сверху' }],
    value: 'auto',
    onChange: function (v) {
      autoRotate = v === 'auto';
      if (v === 'side') { camera.position.set(0, CENTER.y + 0.4, 5.4); camera.lookAt(CENTER); }
      if (v === 'top') { camera.position.set(0, CENTER.y + 5.4, 0.01); camera.lookAt(CENTER); }
    },
  });
  SimUI.toggle({
    name: 'cut', label: 'Разрез', value: true,
    onChange: function (on) { linerMat.opacity = on ? 0.32 : 0.95; linerMat.depthWrite = !on; },
  });
  var speedCtl = SimUI.speed({ values: [0.1, 0.25, 0.5, 1, 2], value: 1 });
  SimUI.playPause({
    onPlay: function () { running = true; lastFrame = null; },
    onPause: function () { running = false; },
    onReset: function () { resetSim(); },
  });

  var strokeBanner = SimUI.banner({ items: [
    { name: 'Впуск', sub: 'впускной клапан открыт', color: '#4f8ff7' },
    { name: 'Сжатие', sub: 'оба клапана закрыты', color: '#c9a94f' },
    { name: 'Рабочий ход', sub: 'воспламенение смеси', color: '#ff6a3d' },
    { name: 'Выпуск', sub: 'выпускной клапан открыт', color: '#8b95a3' },
  ] });

  var rRpm = SimUI.readout({ label: 'Обороты', unit: 'об/мин', digits: 0, corner: 'bl' });
  var rTheta = SimUI.readout({ label: 'Угол коленвала', unit: '°', digits: 0, corner: 'bl' });
  var rStroke = SimUI.readout({ label: 'Такт', unit: '', digits: 0, corner: 'bl' });
  var rPress = SimUI.readout({ label: 'Давление', unit: 'бар', digits: 2, corner: 'bl' });
  var rEff = SimUI.readout({ label: 'КПД цикла', unit: '%', digits: 1, corner: 'bl' });

  var pvChart = SimUI.chart({
    title: 'Индикаторная диаграмма p–V', xLabel: 'V, усл.', yLabel: 'p, бар',
    mode: 'xy', series: [{ name: 'цикл', color: '#ff6a3d' }], corner: 'br',
  });
  var valveChart = SimUI.chart({
    title: 'Фазы газораспределения', xLabel: 'θ, °', yLabel: 'подъём',
    mode: 'time', maxPoints: 720, xRange: [0, 720],
    series: [{ name: 'впуск', color: '#5a8fd6' }, { name: 'выпуск', color: '#ffb27a' },
      { name: 'поршень', color: '#8b95a3' }],
    corner: 'br',
  });

  var kinematics = SimUI.formula({
    title: 'Кинематика КШМ',
    tex: 'x = r\\cos\\theta + \\sqrt{l^2 - r^2\\sin^2\\theta}',
    vars: { r: { label: 'r', unit: '' }, l: { label: 'l', unit: '' },
      theta: { label: 'θ', unit: '°' }, x: { label: 'x', unit: '' } },
    note: 'Полный цикл занимает два оборота коленвала — 720°.',
    corner: 'tl',
  });
  var otto = SimUI.formula({
    title: 'Цикл Отто',
    tex: '\\eta = 1 - \\varepsilon^{1-\\gamma}',
    vars: { eps: { label: 'ε', unit: '' }, gamma: { label: 'γ', unit: '' },
      eta: { label: 'η', unit: '%' } },
    note: 'Чем выше степень сжатия, тем выше термический КПД идеального цикла.',
    corner: 'tl',
  });

  SimUI.expose({
    getState: function () {
      var st = cycleState(theta);
      return {
        theta: st.crankPhys, strokeIndex: st.strokeIndex, rpm: rpm, eps: eps,
        pistonY: pistonY(st.crankPhys),
        pressure: pressure(st.strokeIndex, st.crankPhys, eps),
        volume: volume(st.crankPhys, eps),
        efficiency: efficiency(eps),
      };
    },
    reset: function () { resetSim(); },
  });
```

**3.8.** Заменить хвост `stepPhysics(dt)` (весь блок с `valRpm.textContent = …`) на:

```js
    var p = pressure(st.strokeIndex, st.crankPhys, eps);
    var v = volume(st.crankPhys, eps);
    strokeBanner.set(st.strokeIndex);
    rRpm.set(rpm);
    rTheta.set(st.crankPhys * 180 / Math.PI);
    rStroke.set(STROKES[st.strokeIndex].name + ' (' + (st.strokeIndex + 1) + '/4)');
    rPress.set(p);
    rEff.set(efficiency(eps) * 100);
    pvChart.push(v, [p]);
    var cycleDeg = ((theta % (Math.PI * 4)) + Math.PI * 4) % (Math.PI * 4) * 180 / Math.PI;
    valveChart.push(cycleDeg, [
      intakeLift / VALVE_MAX_LIFT,
      exhaustLift / VALVE_MAX_LIFT,
      (pistonY(st.crankPhys) - PISTON_MIN_Y) / (PISTON_MAX_Y - PISTON_MIN_Y),
    ]);
    kinematics.set({ r: R, l: L, theta: st.crankPhys * 180 / Math.PI, x: pistonY(st.crankPhys) });
    otto.set({ eps: eps, gamma: GAMMA, eta: efficiency(eps) * 100 });
```

и удалить функцию `updateBanner` вместе с её вызовом и переменными `strokeNameEl`, `strokeIdxEl`, `valRpm`, `valTheta`, `valStroke`, `banner`.

**3.9.** В `resetSim()` добавить очистку графиков:

```js
    pvChart.clear();
    valveChart.clear();
```

**3.10.** В `loop(now)` учесть множитель скорости:

```js
    var dt = Math.min(0.05, (now - lastFrame) / 1000) * speedCtl.get();
```

**3.11.** В `demos/engine/meta.json` добавить `"exemplar": true` (поля `mode/libs/keywords/techniques` уже добавлены в Task 10).

- [ ] **Step 4: Перевести `demos/pendulum/artifact.html` с chart.js на `SimUI.chart`**

**4.1.** Из `<head>` удалить: строку `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>`, строки подключения KaTeX (`<link …katex.min.css>` и `<script …katex.min.js>`), и все правила стилей `#chart-panel`, `#chart-legend`, `#formula-panel`, `#formula-katex`, `#formula-nums`, `#formula-note` (строки 15-37). Остаются только правила `canvas.scene`, `#bg`, `#fx`.

**4.2.** Из `<body>` удалить блоки `<div id="chart-panel">…</div>` (строки 44-52) и `<div id="formula-panel">…</div>` (строки 54-66). Остаются только два canvas.

**4.3.** В скрипте удалить: функцию `renderFormula` и её вызов (строка 81), переменную `chartPanel` (строка 93) и весь код её позиционирования, функции `initChart()` (строки 291-316) и `resetChart()` (строки 317-…) вместе с переменной `energyChart` в старом смысле, вызов `initChart()` (строка 399), переменные `elL`, `elB`, `elTheor`, `elMeas`, `elT` (строки 345-349) и все присваивания их `textContent`.

**4.4.** Рядом с существующими вызовами `SimUI.title/slider/playPause` добавить:

```js
  var energyChart = SimUI.chart({
    title: 'Энергия', xLabel: 't, с', yLabel: 'E, Дж',
    series: [{ name: 'кинетическая', color: '#4f8ff7' },
      { name: 'потенциальная', color: '#ffb27a' },
      { name: 'полная', color: '#8b95a3' }],
    corner: 'br',
  });
  var rL = SimUI.readout({ label: 'Длина', unit: 'м', digits: 2, corner: 'bl' });
  var rAmp = SimUI.readout({ label: 'Амплитуда', unit: '°', digits: 1, corner: 'bl' });
  var rTheor = SimUI.readout({ label: 'Период (теория)', unit: 'с', digits: 3, corner: 'bl' });
  var rMeas = SimUI.readout({ label: 'Период (измеренный)', unit: 'с', digits: 3, corner: 'bl' });
  var rTime = SimUI.readout({ label: 'Время', unit: 'с', digits: 1, corner: 'bl' });
  var periodFormula = SimUI.formula({
    title: 'Период малых колебаний',
    tex: 'T = 2\\pi\\sqrt{L/g}',
    vars: { L: { label: 'L', unit: 'м' }, g: { label: 'g', unit: 'м/с²' },
      T: { label: 'T', unit: 'с' } },
    note: 'Формула верна для малых углов; при большой амплитуде измеренный период больше теоретического.',
    corner: 'tl',
  });
```

**4.5.** В главном цикле заменить обновление chart.js и старых элементов на:

```js
    energyChart.push(state.t, [kinetic, potential, kinetic + potential]);
    rL.set(L); rAmp.set(amplitudeDeg); rTheor.set(theoreticalPeriod);
    rMeas.set(measuredPeriod); rTime.set(state.t);
    periodFormula.set({ L: L, g: G, T: theoreticalPeriod });
```

Имена `kinetic`, `potential`, `amplitudeDeg`, `theoreticalPeriod`, `measuredPeriod` — уже существующие в файле величины, которые раньше писались в `elB`/`elTheor`/`elMeas`; если они локальные внутри других функций, поднять их в состояние симуляции.

**4.6.** В `resetSim` (существующая функция сброса) заменить вызов `resetChart()` на `energyChart.clear()`.

**4.7.** Добавить перед главным циклом:

```js
  SimUI.expose({
    getState: function () {
      return { t: state.t, angle: state.angle, omega: state.omega, length: L,
        kinetic: kinetic, potential: potential };
    },
    reset: resetSim,
  });
```

**4.8.** В `demos/pendulum/meta.json` добавить `"exemplar": true`.

- [ ] **Step 5: Убрать chart.js из whitelist**

В `src/lib/cdn.ts` удалить строку `chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',`.

В `tests/unit/artifact.test.ts` заменить упоминания `CDN_WHITELIST.chart`, если они есть, на `CDN_WHITELIST.p5`. Добавить тест:

```ts
  it('chart.js больше не в whitelist — графики только через SimUI.chart', () => {
    const html = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>';
    expect(findForbiddenUrls(html, Object.values(CDN_WHITELIST)).length).toBe(1);
  });
```

- [ ] **Step 6: Прогнать гейт демок**

Run: `npx vitest run tests/integration/demos.test.ts`
Expected: PASS — 10 демок рендерятся, все проходят пробы без провалов, `engine` и `pendulum` помечены эталонами и не имеют рукописных fixed-панелей.

Если какая-то из остальных 8 демок проваливает пробу `pause` или `nan` — починить её точечно (типовая причина: `onPause` не останавливает собственный `requestAnimationFrame`). Проба `reset` для них даст `skip` (нет `expose`) — это допустимо.

- [ ] **Step 7: Полный прогон, e2e и коммит**

Run: `npx vitest run && npx tsc --noEmit && npm run build && npm run test:e2e`
Expected: всё зелёное.

```bash
git add -A
git commit -m "feat(demos): engine v2 and pendulum on SimUI 2.0, probe-based demo gate

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Что из фазы A спеки сюда сознательно не вошло

Три пункта спеки отложены с явной причиной — они не блокируют качество генерации и требуют
изменений, которые дешевле делать вместе с фазой C:

- **Стриминг ответа генератора** (§3.5, событие `candidate-progress` «получено 12 КБ»).
  Стриминг плохо сочетается со склейкой оборванных ответов, реализованной в Task 9:
  `finish_reason` в потоке приходит в последнем чанке, и логика продолжения усложняется
  вдвое. Прогресс кандидата и так виден по статусам (`generating` → `rendering` → `fixing`).
  Делать вместе с галереей кандидатов в фазе C.
- **`response_format: {type:'json_object'}`** для JSON-ролей (§3.5). Существующий
  `extractJson` с балансировкой скобок уже устойчив к мусору вокруг JSON и покрыт тестами.
  Флаг поддерживают не все совместимые провайдеры, а выигрыш маргинальный.
- **Кнопка «сделать эталоном»** в библиотеке (§3.3). Это UI-фича, а не качество генерации:
  подбор эталона (Task 10) работает на вшитых демках. Переносится в фазу C вместе с
  остальными изменениями библиотеки.

## Приёмка фазы A

После Task 12 выполнить и зафиксировать результат:

- [ ] `npx vitest run` — все юниты и интеграция зелёные.
- [ ] `npx tsc --noEmit` — без вывода.
- [ ] `npm run build` — успешно.
- [ ] `npm run test:e2e` — зелёный.
- [ ] Ручная проверка на живом провайдере: сгенерировать «Как работает четырёхтактный двигатель внутреннего сгорания» в режиме `standard`. Ожидается: баннер такта, минимум два показания, живой график, формула с подставленными числами, пресеты, ноль ошибок в консоли превью, все пробы зелёными в карточке кандидата.
- [ ] Обновить `README.md`: раздел «Как это работает» дополнить упоминанием проб и эталонов; в разделе «Демо-библиотека» отметить, что `engine` и `pendulum` — эталоны SimUI 2.0.

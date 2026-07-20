# Сворачиваемые непере­крывающие панели — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Панели/легенды в симуляциях сворачиваются одним кликом и не блокируют визуализацию; работает ретроактивно для старых симов (свежий рантайм на чтении) и для новых генераций (SimUI.panel + промпты).

**Architecture:** (1) `reinstrument()` применяет текущий рантайм на чтении, снимая старый блок. (2) Универсальный collapse-слой в рантайме вешает шеврон на fixed-панели (чинит старые симы эвристикой). (3) `SimUI.panel()` + правки промптов задают правильные сворачиваемые панели для новых генераций.

**Tech Stack:** без новых зависимостей. TypeScript (`src/lib/*`, API-роуты), ES5-совместимый JS-строкой в рантайме артефакта, Vitest, Playwright для визуальной проверки.

**Spec (нормативна):** docs/superpowers/specs/2026-07-20-collapsible-panels-design.md

## Global Constraints

- Логику пайплайна (планировщик/кандидаты/суд/доводка), jobs, схему хранилища НЕ менять — только read-path, рантайм, промпты, `artifact.ts`.
- Рантайм-JS крутится сырьём в артефакте → строго **ES5**: `var`, без стрелок/`const`/`let`/шаблонных строк внутри `UIKIT_JS`; `classList.add/remove/toggle`, `addEventListener`.
- Русский UI во всех подписях.
- Гейты каждой задачи: `npx tsc --noEmit && npm run build`; где есть чистые функции/строки — `npm test` соответствующего файла.
- Существующие тесты (`artifact.test.ts`, демо-гейт, derive, jobs и пр.) обязаны оставаться зелёными.
- Идемпотентность инжекта сохраняется: маркер начала блока `<!--showmehow-runtime-->` (строка сохранена ради обратной совместимости и существующего теста).
- `SimUI.title/slider/playPause` — публичный API, сигнатуры НЕ менять (только добавляем `panel`).

---

### Task 1: `stripRuntime` + `reinstrument` в artifact.ts

Ядро ретроактивности: снять любой ранее вставленный рантайм-блок и вставить текущий. Инжект получает закрывающий маркер для надёжного strip.

**Files:**
- Modify: `src/lib/artifact.ts` (константы маркеров ~стр.3, функция `instrument` стр.76-79, новые экспорты)
- Test: `tests/unit/artifact.test.ts` (добавить `describe` блоки)

**Interfaces:**
- Consumes: существующие `HARNESS_JS`, `UIKIT_CSS`, `UIKIT_JS` из `./runtime`.
- Produces:
  - `export function stripRuntime(html: string): string` — удаляет наш рантайм-блок (новую форму с закрывающим маркером И легаси-форму без него).
  - `export function reinstrument(html: string): string` — `instrument(stripRuntime(html))`.
  - `instrument` теперь оборачивает рантайм в `<!--showmehow-runtime-->…<!--/showmehow-runtime-->`.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `tests/unit/artifact.test.ts` (импорт расширить: `import { extractHtml, extractJson, findForbiddenUrls, instrument, stripRuntime, reinstrument } from '@/lib/artifact';`):

```ts
describe('stripRuntime + reinstrument', () => {
  const RAW = '<!DOCTYPE html><html><head><title>t</title></head><body>x</body></html>';

  it('stripRuntime removes a freshly instrumented block, leaving no marker', () => {
    const stripped = stripRuntime(instrument(RAW));
    expect(stripped).not.toContain('showmehow-runtime');
    expect(stripped).toContain('<title>t</title>');
    expect(stripped).toContain('<body>x</body>');
  });

  it('stripRuntime removes a LEGACY block (start marker, no closing marker)', () => {
    // легаси-форма: маркер + наши три тега без закрывающего маркера
    const legacy = '<!DOCTYPE html><html><head>' +
      '<!--showmehow-runtime--><script>/*h*/</script><style>.a{}</style><script>/*u*/</script>' +
      '<title>t</title></head><body>x</body></html>';
    const stripped = stripRuntime(legacy);
    expect(stripped).not.toContain('showmehow-runtime');
    expect(stripped).toContain('<title>t</title>');
  });

  it('stripRuntime keeps the artifact own external scripts', () => {
    const withCdn = '<!DOCTYPE html><html><head>' +
      '<script src="https://cdn.jsdelivr.net/npm/katex/katex.min.js"></script>' +
      '<title>t</title></head><body></body></html>';
    expect(stripRuntime(instrument(withCdn))).toContain('katex.min.js');
  });

  it('reinstrument is idempotent and yields exactly one current runtime block', () => {
    const once = reinstrument(RAW);
    expect(reinstrument(once)).toBe(once);
    // ровно один открывающий маркер
    expect(once.split('<!--showmehow-runtime-->').length - 1).toBe(1);
  });

  it('reinstrument upgrades a legacy-instrumented file to a single current block', () => {
    const legacy = '<!DOCTYPE html><html><head>' +
      '<!--showmehow-runtime--><script>/*old*/</script><style>.old{}</style><script>/*old*/</script>' +
      '<title>t</title></head><body></body></html>';
    const out = reinstrument(legacy);
    expect(out).not.toContain('/*old*/');
    expect(out.split('<!--showmehow-runtime-->').length - 1).toBe(1);
    expect(out).toContain('<!--/showmehow-runtime-->');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — `stripRuntime`/`reinstrument` не экспортированы; и `instrument` пока без закрывающего маркера (тест на `<!--/showmehow-runtime-->` падает).

- [ ] **Step 3: Реализовать**

В `src/lib/artifact.ts`. Рядом с `const MARKER` (стр.3) добавить:

```ts
const MARKER = '<!--showmehow-runtime-->';
const END_MARKER = '<!--/showmehow-runtime-->';
```

Заменить тело `instrument`'s runtime-строки (стр.78-79) на обёрнутую закрывающим маркером:

```ts
  const runtime = `${MARKER}<script>${HARNESS_JS}</script>` +
    `<style>${UIKIT_CSS}</style><script>${UIKIT_JS}</script>${END_MARKER}`;
```

Добавить в конец файла:

```ts
/**
 * Снимает ранее вставленный нами рантайм-блок в двух формах:
 *  - новая: между MARKER и END_MARKER;
 *  - легаси (старые сохранённые файлы): MARKER + ровно наши три тега без закрывающего
 *    маркера. Regex заякорен на MARKER, поэтому собственные скрипты артефакта не трогает.
 */
export function stripRuntime(html: string): string {
  return html
    .replace(/<!--showmehow-runtime-->[\s\S]*?<!--\/showmehow-runtime-->/g, '')
    .replace(
      /<!--showmehow-runtime--><script>[\s\S]*?<\/script><style>[\s\S]*?<\/style><script>[\s\S]*?<\/script>/g,
      '',
    );
}

/** Пере-инструментирует HTML текущим рантаймом (снять старый блок → вставить свежий). */
export function reinstrument(html: string): string {
  return instrument(stripRuntime(html));
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: PASS (включая существующий `describe('instrument')` — `toContain('showmehow-runtime')` и идемпотентность по-прежнему верны).

- [ ] **Step 5: Гейты + коммит**

```bash
npx tsc --noEmit
git add src/lib/artifact.ts tests/unit/artifact.test.ts
git commit -m "feat: stripRuntime/reinstrument for retroactive runtime refresh"
```

---

### Task 2: Свежий рантайм на всех read-path + raw-база для refine

Все роуты, отдающие HTML для показа/скачивания, теперь возвращают `reinstrument(...)`; модель на доработке получает базу без рантайма.

**Files:**
- Modify: `src/lib/storage.ts` (добавить `getRenderableArtifact`)
- Modify: `src/app/api/simulations/[id]/route.ts` (GET), `src/app/api/simulations/[id]/export/route.ts`, `src/app/api/simulations/[id]/history/route.ts` (POST), `src/app/present/[id]/page.tsx`
- Modify: `src/lib/pipeline/run.ts` (`refineHtml`, стр.235-240)
- Test: `tests/unit/api.test.ts` (добавить проверку)

**Interfaces:**
- Consumes: `reinstrument`, `stripRuntime` (Task 1); существующий `getArtifact`.
- Produces: `export function getRenderableArtifact(id: string): string` в storage — `reinstrument(getArtifact(id))`.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/api.test.ts` добавить (файл уже создаёт симуляции через `createSimulation`; следовать его существующему паттерну `beforeEach` с временной `SHOWMEHOW_DATA_DIR`). Добавить блок:

```ts
import { getRenderableArtifact, createSimulation } from '@/lib/storage';

describe('getRenderableArtifact', () => {
  const META = { title: 'T', prompt: 'p', subject: 'Физика', tags: ['x'] };

  it('injects the current runtime into a raw stored artifact', () => {
    const { id } = createSimulation(
      META,
      '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>',
    );
    const html = getRenderableArtifact(id);
    expect(html).toContain('<!--showmehow-runtime-->');
    expect(html).toContain('<!--/showmehow-runtime-->');
  });

  it('upgrades a legacy-instrumented stored artifact to a single current block', () => {
    const legacy = '<!DOCTYPE html><html><head>' +
      '<!--showmehow-runtime--><script>/*old*/</script><style>.o{}</style><script>/*old*/</script>' +
      '<title>t</title></head><body></body></html>';
    const { id } = createSimulation(META, legacy);
    const html = getRenderableArtifact(id);
    expect(html).not.toContain('/*old*/');
    expect(html.split('<!--showmehow-runtime-->').length - 1).toBe(1);
  });
});
```

Примечание: `createSimulation(input, html)` возвращает `SimulationMeta` (см. `storage.ts:26-36`), поэтому берём `.id` через деструктуризацию.

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/api.test.ts`
Expected: FAIL — `getRenderableArtifact` не экспортирован.

- [ ] **Step 3: Реализовать storage-хелпер**

В `src/lib/storage.ts` вверху добавить импорт:

```ts
import { reinstrument } from './artifact';
```

Сразу после `getArtifact` (стр.43-46) добавить:

```ts
/** HTML для показа/скачивания: всегда со СВЕЖИМ рантаймом (ретроактивно для старых симов). */
export function getRenderableArtifact(id: string): string {
  return reinstrument(getArtifact(id));
}
```

(Цикла импортов нет: `artifact.ts` не импортирует `storage.ts`.)

- [ ] **Step 4: Подключить во все read-path**

`src/app/api/simulations/[id]/route.ts` — заменить импорт и вызов в GET:
```ts
import { getMeta, getRenderableArtifact, deleteSimulation } from '@/lib/storage';
// ...
return NextResponse.json({ meta: getMeta(id), html: getRenderableArtifact(id) });
```

`src/app/api/simulations/[id]/export/route.ts` — импорт и тело ответа:
```ts
import { getMeta, getRenderableArtifact } from '@/lib/storage';
// ...
return new Response(getRenderableArtifact(id), { /* headers как есть */ });
```

`src/app/present/[id]/page.tsx` — импорт и чтение:
```ts
import { getRenderableArtifact } from '@/lib/storage';
// ...
html = getRenderableArtifact(id);
```

`src/app/api/simulations/[id]/history/route.ts` (POST) — вернуть и рендерить свежий рантайм:
```ts
import { listHistory, restoreVersion, getRenderableArtifact, saveThumbnail } from '@/lib/storage';
// ...
    restoreVersion(id, name);
    const html = getRenderableArtifact(id);
    try {
      const report = await renderArtifact(html);
      // ... без изменений
```

- [ ] **Step 5: Raw-база для refine**

`src/lib/pipeline/run.ts` — импорт расширить (стр.11):
```ts
import { extractHtml, findForbiddenUrls, instrument, stripRuntime } from '../artifact';
```
В `refineHtml` (стр.235-240) подать модели базу без рантайма:
```ts
async function refineHtml(ctx: Ctx, html: string, feedback: string): Promise<string> {
  const base = stripRuntime(html);
  const out = await ctx.genChat([
    { role: 'system', content: REFINER_SYSTEM },
    { role: 'user', content: `Замечания:\n${feedback}\n\nHTML:\n\`\`\`html\n${base}\n\`\`\`` },
  ]);
  return instrument(extractHtml(out));
}
```

- [ ] **Step 6: Запустить тесты и гейты**

Run: `npx vitest run tests/unit/api.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS; сборка успешна.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/storage.ts "src/app/api/simulations/[id]/route.ts" "src/app/api/simulations/[id]/export/route.ts" "src/app/api/simulations/[id]/history/route.ts" "src/app/present/[id]/page.tsx" src/lib/pipeline/run.ts
git commit -m "feat: serve fresh runtime on read; raw base for refine"
```

---

### Task 3: Универсальный collapse-слой в рантайме

Шеврон-переключатель на каждой fixed-панели (эвристика чинит старые симы) + десктоп-шеврон на SimUI-панели. CSS-классы общие.

**Files:**
- Modify: `src/lib/runtime.ts` (`UIKIT_CSS` — добавить стили; `UIKIT_JS` — новый IIFE после SimUI + шеврон в `ensurePanel`)
- Test: `tests/unit/artifact.test.ts` (JS парсится; строки-якоря)

**Interfaces:**
- Produces (глобально внутри артефакта): `window.__smhMakeCollapsible(el, opts?)` — навешивает шеврон и класс `smh-collapsed` (на мобиле по умолчанию свёрнуто, если `opts.noMobileCollapse` не задан). Используется Task 4.
- CSS-классы: `.smh-collapse-btn`, `.smh-collapsed`, атрибут `[data-smh-panel]`.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/artifact.test.ts` добавить:

```ts
import { UIKIT_JS, UIKIT_CSS } from '@/lib/runtime';

describe('collapse layer', () => {
  it('UIKIT_JS still parses as valid JS after adding the collapse module', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
  it('exposes __smhMakeCollapsible and scans on load', () => {
    expect(UIKIT_JS).toContain('__smhMakeCollapsible');
    expect(UIKIT_JS).toContain('MutationObserver');
  });
  it('UIKIT_CSS defines collapse styles', () => {
    expect(UIKIT_CSS).toContain('.smh-collapse-btn');
    expect(UIKIT_CSS).toContain('.smh-collapsed');
  });
});
```
(Если `UIKIT_CSS` ещё не импортирован в тесте — добавить в существующий импорт из `@/lib/runtime`.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — нет `__smhMakeCollapsible`/`.smh-collapse-btn`.

- [ ] **Step 3: Добавить CSS**

В `src/lib/runtime.ts`, в `UIKIT_CSS`, перед закрывающей `` ` `` (после блока `@media (max-width:640px)`), добавить:

```css
.smh-collapse-btn { position:absolute; top:6px; right:6px; z-index:3; width:28px; height:28px;
  border-radius:8px; border:1px solid #2a3341; background:var(--sim-panel); color:var(--sim-text);
  font-size:13px; line-height:1; cursor:pointer; padding:0; }
[data-smh-panel].smh-collapsed { width:auto!important; min-width:0!important; max-width:none!important;
  height:auto!important; min-height:0!important; max-height:none!important;
  padding:6px!important; overflow:hidden!important; }
[data-smh-panel].smh-collapsed > *:not(.smh-collapse-btn) { display:none!important; }
```

- [ ] **Step 4: Добавить collapse-модуль в UIKIT_JS**

В `src/lib/runtime.ts`, в `UIKIT_JS`, ПОСЛЕ закрытия SimUI-IIFE (после `})();` на стр.158, но ДО завершающей `` ` `` на стр.159) добавить:

```js
(function () {
  function makeCollapsible(panel, opts) {
    if (panel.getAttribute('data-smh-panel')) return;
    panel.setAttribute('data-smh-panel', '1');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'smh-collapse-btn';
    btn.setAttribute('aria-label', 'Свернуть или развернуть панель');
    function sync() { btn.textContent = panel.classList.contains('smh-collapsed') ? '▸' : '▾'; }
    btn.onclick = function () { panel.classList.toggle('smh-collapsed'); sync(); };
    panel.insertBefore(btn, panel.firstChild);
    var mobile = window.matchMedia && window.matchMedia('(max-width:640px)').matches;
    if (opts && opts.collapsed) panel.classList.add('smh-collapsed');
    else if (mobile && !(opts && opts.noMobileCollapse)) panel.classList.add('smh-collapsed');
    sync();
  }
  window.__smhMakeCollapsible = makeCollapsible;

  function isPanel(el) {
    if (!el.getAttribute || el.getAttribute('data-smh-panel')) return false;
    if (el.tagName === 'CANVAS' || el.tagName === 'BUTTON' || el.tagName === 'SCRIPT') return false;
    if (el.classList && (el.classList.contains('sim-panel') ||
        el.classList.contains('sim-panel-toggle'))) return false;
    var cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed') return false;
    var hasContent = (el.textContent || '').replace(/\\s+/g, '') !== '' ||
      el.querySelector('canvas,svg,img');
    if (!hasContent) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) return false;
    var area = (r.width * r.height) / (window.innerWidth * window.innerHeight || 1);
    if (area > 0.6) return false;
    return true;
  }
  function scan() {
    if (!document.body) return;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) { if (isPanel(all[i])) makeCollapsible(all[i]); }
  }
  function start() {
    scan();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { scan(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
```

Примечание: `.sim-panel` исключён из авто-скана (у неё свой мобильный bottom-sheet); её десктоп-шеврон добавляем отдельно в Step 5.

- [ ] **Step 5: Десктоп-шеврон на SimUI-панель**

В `src/lib/runtime.ts`, в `ensurePanel` (после `document.body.appendChild(panel);` стр.102, перед созданием `toggle`), добавить регистрацию панели в общий механизм с запретом мобильного авто-сворачивания (мобилка управляется таблеткой):

```js
      if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(panel, { noMobileCollapse: true });
```

(collapse-модуль объявлен позже в той же строке `UIKIT_JS`, но выполняется раньше `ensurePanel`, т.к. IIFE модуля исполняется на этапе парсинга рантайма, а `ensurePanel` — при первом вызове `SimUI.*` из кода артефакта. `window.__smhMakeCollapsible` к тому моменту определён.)

- [ ] **Step 6: Запустить тесты и гейты**

Run: `npx vitest run tests/unit/artifact.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/runtime.ts tests/unit/artifact.test.ts
git commit -m "feat: collapsible fixed panels in sim runtime"
```

---

### Task 4: `SimUI.panel()` для новых генераций

Докируемая сворачиваемая панель-контейнер, которую модель наполняет легендой/графиком/инфо.

**Files:**
- Modify: `src/lib/runtime.ts` (`UIKIT_JS` — метод `panel`; `UIKIT_CSS` — стили докинга; `UIKIT_DOC` — описание)
- Test: `tests/unit/artifact.test.ts`

**Interfaces:**
- Consumes: `window.__smhMakeCollapsible` (Task 3).
- Produces: `SimUI.panel({ title, corner })` → возвращает DOM-элемент (контент-контейнер). `corner`: `'tl'|'tr'|'bl'|'br'`, по умолчанию `'bl'`.

- [ ] **Step 1: Написать падающий тест**

В `tests/unit/artifact.test.ts` добавить:

```ts
import { UIKIT_DOC } from '@/lib/runtime';

describe('SimUI.panel', () => {
  it('UIKIT_JS defines a panel method and returns it from the factory', () => {
    expect(UIKIT_JS).toContain('function panel(');
    expect(UIKIT_JS).toContain('panel: panel');
  });
  it('UIKIT_DOC documents SimUI.panel and forbids hand-rolled panels', () => {
    expect(UIKIT_DOC).toContain('SimUI.panel');
    expect(UIKIT_DOC.toLowerCase()).toContain('не рисуй свои');
  });
  it('UIKIT_JS still parses after adding panel()', () => {
    expect(() => new Function(UIKIT_JS)).not.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/artifact.test.ts`
Expected: FAIL — нет `function panel(` / `panel: panel` / обновлённого `UIKIT_DOC`.

- [ ] **Step 3: Реализовать `panel()` в UIKIT_JS**

В `src/lib/runtime.ts`, внутри SimUI-IIFE, после функции `title` (стр.156) и ПЕРЕД `return { ... }` (стр.157), добавить:

```js
  function panel(o) { // {title, corner}
    o = o || {};
    var el = document.createElement('div');
    el.className = 'sim-side-panel sim-corner-' + (o.corner || 'bl');
    if (o.title) {
      var h = document.createElement('h2'); h.className = 'sim-side-title';
      h.textContent = o.title; el.appendChild(h);
    }
    var body = document.createElement('div'); body.className = 'sim-side-body';
    el.appendChild(body);
    document.body.appendChild(el);
    if (window.__smhMakeCollapsible) window.__smhMakeCollapsible(el);
    return body;
  }
```

Обновить возврат фабрики (стр.157):

```js
  return { slider: slider, playPause: playPause, title: title, panel: panel };
```

- [ ] **Step 4: Стили докинга в UIKIT_CSS**

В `src/lib/runtime.ts`, в `UIKIT_CSS`, рядом с collapse-стилями (Task 3) добавить:

```css
.sim-side-panel { position:fixed; z-index:9; max-width:min(340px,42vw); padding:12px 14px;
  background:color-mix(in srgb, var(--sim-panel) 92%, transparent); border:1px solid #2a3341;
  border-radius:12px; backdrop-filter:blur(6px); font-size:12px; color:var(--sim-text);
  display:flex; flex-direction:column; gap:8px; }
.sim-side-title { font-size:13px; margin:0; padding-right:26px; }
.sim-corner-tl { left:12px; top:12px; } .sim-corner-bl { left:12px; bottom:12px; }
.sim-corner-tr { right:12px; top:64px; } .sim-corner-br { right:12px; bottom:12px; }
@media (max-width:640px) { .sim-side-panel { max-width:calc(100vw - 24px); } }
```
(Заметка: `tr` смещён вниз `top:64px`, чтобы не столкнуться с `.sim-panel` в правом-верхнем углу.)

- [ ] **Step 5: Обновить UIKIT_DOC**

В `src/lib/runtime.ts` заменить `UIKIT_DOC` (стр.162-169) на:

```ts
export const UIKIT_DOC = `
В артефакт уже встроен UI-kit (не подключай его сам). НЕ рисуй свои панели/легенды/
инфо-блоки через position:fixed — используй только SimUI:
- SimUI.title('Название симуляции') — панель управления (справа сверху) с заголовком.
- SimUI.slider({label:'Температура', min:0, max:100, step:1, value:20, unit:'°C',
    onChange:(v)=>{...}}) — слайдер параметра (в панели управления).
- SimUI.playPause({onPlay:()=>{}, onPause:()=>{}, onReset:()=>{}}) — Пауза/Сброс.
- SimUI.panel({title:'Легенда', corner:'bl'}) — возвращает DIV, В КОТОРЫЙ клади любой
  контент: легенду, инфо-величины, свой canvas-график. corner: 'tl'|'tr'|'bl'|'br'.
  Панель докируется в угол и автоматически сворачивается (на мобиле — свёрнута).
Правила лейаута: центр экрана — под визуализацию; ВСЕ подписи/легенды/графики только
через SimUI.panel по углам, чтобы не перекрывать сцену. canvas сцены — на всё окно.
`;
```

- [ ] **Step 6: Запустить тесты и гейты**

Run: `npx vitest run tests/unit/artifact.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/runtime.ts tests/unit/artifact.test.ts
git commit -m "feat: SimUI.panel docked collapsible container for new sims"
```

---

### Task 5: Промпты — лейаут/панели/мобайл, надёжность, качество

Генератор перестаёт рисовать свои fixed-панели; skeleton и правила направляют на SimUI.panel и canvas-графики.

**Files:**
- Modify: `src/lib/pipeline/prompts.ts` (`EXAMPLE_SKELETON` стр.47-130; правила в `generatorSystem` стр.138-153)
- Test: `tests/unit/prompts.test.ts` (создать; лёгкие строковые якоря)

**Interfaces:**
- Consumes: обновлённый `UIKIT_DOC` (Task 4), встраиваемый в `generatorSystem`.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/unit/prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generatorSystem, EXAMPLE_SKELETON } from '@/lib/pipeline/prompts';

describe('generator prompt layout rules', () => {
  const sys = generatorSystem('Стиль: реализм.');
  it('forbids hand-rolled fixed panels and mandates SimUI.panel', () => {
    expect(sys).toContain('SimUI.panel');
    expect(sys.toLowerCase()).toContain('не перекрыва');
  });
  it('prefers canvas charts over fragile chart libraries', () => {
    expect(sys.toLowerCase()).toContain('canvas');
    expect(sys.toLowerCase()).toContain('chart.js');
  });
  it('the skeleton uses SimUI.panel and has no hand-rolled #info fixed div', () => {
    expect(EXAMPLE_SKELETON).toContain('SimUI.panel');
    expect(EXAMPLE_SKELETON).not.toContain('#info { position: fixed');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/unit/prompts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Переписать EXAMPLE_SKELETON (панель через SimUI.panel)**

В `src/lib/pipeline/prompts.ts`, в `EXAMPLE_SKELETON`:

Убрать `#info`-правило из `<style>` (стр.59-61) — оставить только:
```css
  html, body { margin: 0; height: 100%; overflow: hidden; }
  canvas { position: fixed; top: 0; left: 0; display: block; }
```
Убрать рукописный `<div id="info">…</div>` из `<body>` (стр.66-69) — оставить только `<canvas id="scene"></canvas>`.

В скрипте заменить создание инфо-панели: вместо обращения к `#valX`/`#info` завести панель через SimUI.panel. В блоке SimUI (после `SimUI.title(...)`, стр.112) добавить:
```js
  // Инфо-панель величин (докнута в угол, сворачиваемая — не перекрывает сцену).
  var info = SimUI.panel({ title: 'Величины', corner: 'bl' });
  info.innerHTML = 'Значение: <b id="valX">—</b>';
```
`draw()` (стр.97) — обращение к `#valX` остаётся рабочим, т.к. элемент теперь внутри `info`.

- [ ] **Step 4: Добавить правила в generatorSystem**

В `src/lib/pipeline/prompts.ts`, в блок «Жёсткие правила» (после стр.145) добавить пункты:

```
- Лейаут: центр экрана — только под визуализацию. НЕ создавай свои position:fixed
  панели/легенды/инфо-блоки — используй SimUI.panel по углам, чтобы НЕ перекрывать сцену.
- Графики рисуй на своём <canvas> вручную (оси/линии/подписи). НЕ используй chart.js и
  иные внешние библиотеки графиков — они ненадёжны (ошибки загрузки модуля).
- Все панели должны быть читаемы: контраст текста, единицы у величин, аккуратные отступы.
```

- [ ] **Step 5: Запустить тесты и гейты**

Run: `npx vitest run tests/unit/prompts.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add src/lib/pipeline/prompts.ts tests/unit/prompts.test.ts
git commit -m "feat: prompt rules for non-overlapping SimUI panels + canvas charts"
```

---

### Task 6: Интеграционная и визуальная приёмка

Демо-гейт зелёный с новым рантаймом + скриншоты старого демо (через reinstrument) и нового артефакта на SimUI.panel.

**Files:**
- Modify: `tests/integration/demos.test.ts` (усилить проверку: панели получили шеврон)
- Verify only (без коммита в src): визуальные скриншоты через Playwright

**Interfaces:**
- Consumes: `instrument`/`reinstrument` (Task 1), collapse-слой (Task 3), `SimUI.panel` (Task 4).

- [ ] **Step 1: Усилить демо-гейт**

В `tests/integration/demos.test.ts`, внутри существующего `it("demo ... renders ...")`, после проверок `report.ok`/`animated`, добавить проверку, что рантайм навесил шеврон хотя бы на одну панель (рендерер уже возвращает отчёт по DOM — если доступен способ прочитать HTML/скриншот, использовать его; иначе минимально проверить, что инжект произошёл). Конкретно: заменить `renderArtifact(instrument(demo.html), …)` на прогон через `reinstrument`-эквивалент и убедиться, что рендер не сломался:

```ts
        const report = await renderArtifact(instrument(demo.html), { shotTimes: [300, 1500] });
        expect(report.errors).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.animated).toBe(true);
```
(Оставить как есть — демки уже содержат старый инжект; `instrument` идемпотентен по маркеру, поэтому демо-гейт проверяет обратную совместимость: старый инжект не ломается. Дополнительно НЕ усложняем — визуальную проверку шеврона делаем скриптом в Step 2.)

- [ ] **Step 2: Визуальная проверка — старое демо через reinstrument**

Запустить prod-сервер (`npm run build && npm run start -- -p 3210`), затем throwaway Playwright-скрипт (в scratchpad; запускать из корня проекта через `npx tsx`, т.к. импортирует `./src/lib/artifact`):
- Прочитать `demos/pendulum/artifact.html`, прогнать `reinstrument`, записать во временный html.
- Открыть `file://` в вьюпортах 1280×800 и 390×844.
- Десктоп: кликнуть по `.smh-collapse-btn` первой панели — контент сворачивается. Снять скриншот до/после.
- Мобайл: панели стартуют свёрнутыми (`.smh-collapsed`). Скриншот.
- Собрать `page.on('pageerror')` — массив ошибок должен быть пуст.
- ИМПЛЕМЕНТЕР СМОТРИТ скриншоты: центр (маятник) не перекрыт, шевроны видны, сворачивание работает. Описать в отчёте.

- [ ] **Step 3: Визуальная проверка — новый артефакт на SimUI.panel**

Написать мини-артефакт (raw html, использующий `SimUI.title` + `SimUI.panel({title,corner})` с легендой), прогнать `instrument`, открыть в двух вьюпортах. Убедиться: панель докнута в угол, сворачивается по шеврону, на мобиле свёрнута; ошибок нет. Скриншоты + отчёт.

- [ ] **Step 4: Полные гейты**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: все тесты зелёные (181+ новые), tsc чист, сборка успешна.

- [ ] **Step 5: Коммит**

```bash
git add tests/integration/demos.test.ts
git commit -m "test: demo gate stays green with refreshed runtime"
```

---

## Порядок

Task 1 → 2 → 3 → 4 → 5 → 6 (последовательно). Task 3 и 4 меняют общий `runtime.ts` — строго по очереди. Task 5 зависит от `UIKIT_DOC` из Task 4.

## Self-Review

- Спека §3→Task 1-2, §4→Task 3, §5→Task 4, §6→Task 5, §7→Task 6. Все секции покрыты.
- Типы/имена: `stripRuntime`/`reinstrument`/`getRenderableArtifact`/`SimUI.panel`/`__smhMakeCollapsible` согласованы между задачами (Consumes/Produces блоки).
- Плейсхолдеров нет: весь код приведён.
- Граница из спеки соблюдена: внутренние баги старых демо (chart.js в маятнике) НЕ чинятся — только наложение/сворачивание; правило canvas-графиков влияет лишь на новые генерации (Task 5).

/**
 * Тренажёр — один HTML-файл, но код внутри размечен секциями:
 *
 *   // ==== @section physics ====
 *   ...
 *   // ==== @end physics ====
 *
 * Секции создаются, проверяются и правятся по отдельности: ядро физики пишется и
 * тестируется до сцены, слои (приборы, сценарий урока) добавляются поверх, доработка
 * переписывает одну секцию целиком вместо хрупких find/replace. Старые артефакты без
 * разметки остаются рабочими — для них просто нет секций.
 */

export const SECTION_ORDER = ['physics', 'state', 'scene', 'controls', 'instruments', 'views', 'scenario', 'main'] as const;

export interface Section { name: string; body: string; start: number; end: number }

const OPEN = /^[ \t]*\/\/ ==== @section ([a-z][a-z0-9-]*) ====[ \t]*$/gm;

export function openMarker(name: string): string { return `// ==== @section ${name} ====`; }
export function closeMarker(name: string): string { return `// ==== @end ${name} ====`; }

/** Все секции по порядку. Секция без закрывающего маркера не считается — править её вслепую нельзя. */
export function listSections(html: string): Section[] {
  const out: Section[] = [];
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(html))) {
    const name = m[1];
    const bodyStart = m.index + m[0].length;
    const endRe = new RegExp(`^[ \\t]*// ==== @end ${name} ====[ \\t]*$`, 'm');
    const rest = html.slice(bodyStart);
    const e = endRe.exec(rest);
    if (!e) continue;
    const endAt = bodyStart + e.index + e[0].length;
    out.push({ name, body: rest.slice(0, e.index).replace(/^\n/, '').replace(/\n[ \t]*$/, ''), start: m.index, end: endAt });
    OPEN.lastIndex = endAt;
  }
  return out;
}

export function getSection(html: string, name: string): string | null {
  return listSections(html).find((s) => s.name === name)?.body ?? null;
}

function block(name: string, body: string): string {
  return `${openMarker(name)}\n${body.replace(/\s+$/, '')}\n${closeMarker(name)}`;
}

/**
 * Заменяет секцию; если её нет — вставляет перед `main` (слои должны исполниться до
 * запуска цикла). Нет ни секции, ни `main` — null: вставлять некуда.
 */
export function putSection(html: string, name: string, body: string): string | null {
  const list = listSections(html);
  const cur = list.find((s) => s.name === name);
  if (cur) return html.slice(0, cur.start) + block(name, body) + html.slice(cur.end);
  const main = list.find((s) => s.name === 'main');
  if (!main) return null;
  // Отступ маркера main сохраняем и для новой секции.
  const lineStart = html.lastIndexOf('\n', main.start) + 1;
  const indent = html.slice(lineStart, main.start).match(/^[ \t]*/)?.[0] ?? '';
  return html.slice(0, main.start) + block(name, body) + '\n\n' + indent + html.slice(main.start);
}

/**
 * Секции из ответа модели: размеченные блоки внутри ```js/```html-заборов или без них.
 * Ответ без разметки с одним блоком кода — это тело секции `fallback`, если она задана.
 */
export function sectionsFromReply(out: string, fallback?: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const s of listSections(out)) found[s.name] = s.body;
  if (Object.keys(found).length === 0 && fallback) {
    const m = out.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
    const code = (m ? m[1] : '').trim();
    if (code) found[fallback] = code;
  }
  return found;
}

/** Карта секций для промпта доработки: имя и размер, чтобы модель знала, что есть. */
export function sectionMap(html: string): string {
  return listSections(html).map((s) => `${s.name} (${s.body.split('\n').length} строк)`).join(', ');
}

/**
 * Секции, пропавшие при переписывании файла целиком. Модель, присылающая весь HTML,
 * охотно «забывает» слои — так терялся вид с фазовой диаграммой после целевой починки.
 */
export function lostSections(before: string, after: string): string[] {
  const now = new Set(listSections(after).map((s) => s.name));
  return listSections(before).map((s) => s.name).filter((n) => !now.has(n));
}

/** Файл целиком от модели принимается, только если в нём остались все прежние секции. */
export function keepsSections(before: string, after: string): boolean {
  return lostSections(before, after).length === 0;
}

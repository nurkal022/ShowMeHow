/**
 * Точечные правки вместо переписывания файла целиком: модель присылает пары
 * «найти → заменить», а мы применяем их к исходнику. Ответ в десятки раз короче
 * полного HTML — починка идёт секунды, а не минуты. Если хоть одна правка не
 * находит своё место, возвращаем null: вызывающий перейдёт к полному переписыванию.
 */

import { sanitizeConfig } from './config';

export interface Edit { find: string; replace: string }

/**
 * Что модель рассказала о своей правке. Отчёт идёт тем же ответом, что и правки:
 * отдельный запрос «а что ты сделал?» стоил бы ещё одного круга к модели, а человеку
 * нужно знать это сразу — иначе доработка выглядит как молчаливая подмена файла.
 */
export interface RefineReport {
  summary: string;
  changed: string[];
  skipped: string[];
  next: string[];
}

export const EDITS_FORMAT = `Ответь ТОЛЬКО JSON без пояснений вокруг:
{"edits": [{"find": "точный фрагмент из исходного HTML", "replace": "чем его заменить"}, ...]}
Правила: "find" копируй из исходника символ в символ, с отступами, 1–15 строк, и так, чтобы
фрагмент встречался в файле ровно один раз. Правок — сколько нужно, обычно 1–6. Не присылай весь файл.`;

/** Общий разбор ответа: модель любит обрамлять JSON пояснениями и ```-заборами. */
function readObject(out: string): Record<string, unknown> | null {
  const fenced = out.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : out).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function textList(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, 220);
    if (text) out.push(text);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * Отчёт о правке. Пустой отчёт (модель промолчала) — не ошибка: правки всё равно
 * применяются, просто человек увидит дежурное «готово» вместо разбора.
 */
export function parseRefineReport(out: string): RefineReport | null {
  const raw = readObject(out);
  if (!raw) return null;
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : '';
  const report: RefineReport = {
    summary,
    changed: textList(raw.changed, 6),
    skipped: textList(raw.skipped, 4),
    next: textList(raw.next, 3),
  };
  const empty = !report.summary && report.changed.length === 0
    && report.skipped.length === 0 && report.next.length === 0;
  return empty ? null : report;
}

export function parseEdits(out: string): Edit[] | null {
  const raw = readObject(out);
  if (!raw) return null;
  if (!Array.isArray(raw.edits) || raw.edits.length === 0 || raw.edits.length > 40) return null;
  const edits: Edit[] = [];
  for (const e of raw.edits) {
    if (typeof e !== 'object' || e === null) return null;
    const { find, replace } = e as { find?: unknown; replace?: unknown };
    if (typeof find !== 'string' || !find || typeof replace !== 'string') return null;
    edits.push({ find, replace });
  }
  return edits;
}

/** Применяет все правки или ни одной. Фрагмент ищется точно, затем — без учёта отступов строк. */
export function applyEdits(source: string, edits: Edit[]): string | null {
  let out = source;
  for (const { find, replace } of edits) {
    const at = out.indexOf(find);
    if (at !== -1 && out.indexOf(find, at + 1) === -1) {
      out = out.slice(0, at) + replace + out.slice(at + find.length);
      continue;
    }
    if (at !== -1) return null; // фрагмент не уникален — куда вставлять, неясно
    const loose = looseFind(out, find);
    if (!loose) return null;
    out = out.slice(0, loose.start) + replace + out.slice(loose.end);
  }
  return out === source ? null : out;
}

/** Модели часто теряют ведущие пробелы: ищем по строкам, сравнивая их без отступов. */
function looseFind(source: string, find: string): { start: number; end: number } | null {
  const want = find.split('\n').map((l) => l.trim()).filter((l, i, a) => l || (i > 0 && i < a.length - 1));
  if (want.length === 0) return null;
  const lines = source.split('\n');
  const offsets: number[] = [];
  let pos = 0;
  for (const l of lines) { offsets.push(pos); pos += l.length + 1; }
  let found: { start: number; end: number } | null = null;
  for (let i = 0; i + want.length <= lines.length; i++) {
    let ok = true;
    for (let k = 0; k < want.length; k++) if (lines[i + k].trim() !== want[k]) { ok = false; break; }
    if (!ok) continue;
    if (found) return null; // второе совпадение — неоднозначно
    const last = i + want.length - 1;
    found = { start: offsets[i], end: offsets[last] + lines[last].length };
  }
  return found;
}

/** Модель проигнорировала формат и прислала файл целиком — берём его, второй раз не спрашиваем. */
export function looksLikeHtml(out: string): boolean {
  return /<(!doctype|html|body|script|canvas)\b/i.test(out);
}

/** Ответ доработки по секциям: наложение настроек, точечные правки и секции целиком. */
export interface RefinePatch {
  config: import('./config').SimConfig | null;
  edits: Edit[];
  sections: Record<string, string>;
}

export function parseRefinePatch(out: string): RefinePatch | null {
  const raw = readObject(out);
  if (!raw) return null;
  const edits: Edit[] = [];
  if (Array.isArray(raw.edits)) {
    for (const e of raw.edits.slice(0, 40)) {
      if (typeof e !== 'object' || e === null) continue;
      const { find, replace } = e as { find?: unknown; replace?: unknown };
      if (typeof find === 'string' && find && typeof replace === 'string') edits.push({ find, replace });
    }
  }
  const sections: Record<string, string> = {};
  if (typeof raw.sections === 'object' && raw.sections !== null && !Array.isArray(raw.sections)) {
    for (const [name, body] of Object.entries(raw.sections as Record<string, unknown>)) {
      if (/^[a-z][a-z0-9-]*$/.test(name) && typeof body === 'string' && body.trim()) sections[name] = body;
    }
  }
  const config = typeof raw.config === 'object' && raw.config !== null && !Array.isArray(raw.config)
    ? sanitizeConfig(raw.config) : null;
  const hasConfig = !!config && Object.keys(config).length > 0;
  if (!hasConfig && edits.length === 0 && Object.keys(sections).length === 0) return null;
  return { config: hasConfig ? config : null, edits, sections };
}

/**
 * Точечные правки вместо переписывания файла целиком: модель присылает пары
 * «найти → заменить», а мы применяем их к исходнику. Ответ в десятки раз короче
 * полного HTML — починка идёт секунды, а не минуты. Если хоть одна правка не
 * находит своё место, возвращаем null: вызывающий перейдёт к полному переписыванию.
 */

export interface Edit { find: string; replace: string }

export const EDITS_FORMAT = `Ответь ТОЛЬКО JSON без пояснений вокруг:
{"edits": [{"find": "точный фрагмент из исходного HTML", "replace": "чем его заменить"}, ...]}
Правила: "find" копируй из исходника символ в символ, с отступами, 1–15 строк, и так, чтобы
фрагмент встречался в файле ровно один раз. Правок — сколько нужно, обычно 1–6. Не присылай весь файл.`;

export function parseEdits(out: string): Edit[] | null {
  const fenced = out.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : out).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { edits?: unknown };
    if (!Array.isArray(raw.edits) || raw.edits.length === 0 || raw.edits.length > 40) return null;
    const edits: Edit[] = [];
    for (const e of raw.edits) {
      if (typeof e !== 'object' || e === null) return null;
      const { find, replace } = e as { find?: unknown; replace?: unknown };
      if (typeof find !== 'string' || !find || typeof replace !== 'string') return null;
      edits.push({ find, replace });
    }
    return edits;
  } catch {
    return null;
  }
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

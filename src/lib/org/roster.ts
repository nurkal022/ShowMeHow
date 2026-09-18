/**
 * Ученики списком: транслит, логины и разбор вставленного списка или CSV.
 * Модуль чистый — без базы: его зовут роуты, клиентская форма, сид и юнит-тесты.
 */

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Казахские буквы: школы Казахстана — первые пилоты.
  ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
};

/** Строчная латиница, цифры и дефис. Пробелы становятся дефисом, прочие знаки выпадают. */
export function transliterate(raw: string): string {
  let out = '';
  for (const ch of raw.toLowerCase()) {
    if (ch in TRANSLIT) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch === '-' || /\s/.test(ch)) out += '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Слаг организации из названия: «Школа №12» → shkola-12. Пустая строка — подобрать не удалось. */
export function slugify(name: string): string {
  return transliterate(name).slice(0, 32).replace(/-+$/, '');
}

export type RosterIssue = 'empty' | 'incomplete' | 'too_long' | 'duplicate' | 'in_group';

export const ROSTER_ISSUE_LABELS: Record<RosterIssue, string> = {
  empty: 'пустая строка',
  incomplete: 'нужны фамилия и имя',
  too_long: 'слишком длинное имя',
  duplicate: 'дубль в списке',
  in_group: 'уже есть в группе',
};

export const MAX_ROSTER_LINES = 300;
export const MAX_ROSTER_TEXT = 30000;
export const MAX_NAME_PART = 60;

export interface RosterLine {
  /** Номер строки во вставленном тексте, с единицы. */
  line: number;
  lastName: string;
  firstName: string;
  issue: RosterIssue | null;
}

export type RosterParse = { ok: true; lines: RosterLine[] } | { ok: false; error: string };

const HEADER_RE = /^\s*фамилия\s*[;,\t ]\s*имя/i;

/** Ключ сравнения людей: регистр, «ё» и лишние пробелы не различаются. */
export function rosterKey(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** «Иванов Иван Петрович» → ['Иванов', 'Иван']: отчество в логин и имя не входит. */
export function splitName(displayName: string): [string, string] {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return [parts[0] ?? '', parts[1] ?? ''];
}

/** CSV-строка «Фамилия;Имя» (или через запятую, табуляцию) либо «Фамилия Имя». */
function splitLine(raw: string): [string, string] {
  const cells = raw.split(/[;,\t]/).map((s) => s.trim().replace(/\s+/g, ' '));
  if (cells.length > 1) return [cells[0], splitName(cells[1])[0]];
  return splitName(raw);
}

export function parseRoster(text: string, inGroup: ReadonlySet<string> = new Set()): RosterParse {
  if (text.length > MAX_ROSTER_TEXT) {
    return { ok: false, error: `Список слишком длинный: не больше ${MAX_ROSTER_TEXT} символов.` };
  }
  let rawLines = text.replace(/^﻿/, '').split(/\r?\n/);
  while (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') rawLines.pop();
  const offset = rawLines.length > 0 && HEADER_RE.test(rawLines[0]) ? 1 : 0;
  rawLines = rawLines.slice(offset);
  if (rawLines.length > MAX_ROSTER_LINES) {
    return { ok: false, error: `В списке больше ${MAX_ROSTER_LINES} строк. Разделите его на части.` };
  }
  const seen = new Set<string>();
  const lines = rawLines.map((raw, i): RosterLine => {
    const line = i + 1 + offset;
    if (raw.trim() === '') return { line, lastName: '', firstName: '', issue: 'empty' };
    const [lastName, firstName] = splitLine(raw);
    if (!lastName || !firstName) return { line, lastName, firstName, issue: 'incomplete' };
    if (lastName.length > MAX_NAME_PART || firstName.length > MAX_NAME_PART) {
      return { line, lastName, firstName, issue: 'too_long' };
    }
    const key = rosterKey(lastName, firstName);
    if (seen.has(key)) return { line, lastName, firstName, issue: 'duplicate' };
    seen.add(key);
    if (inGroup.has(key)) return { line, lastName, firstName, issue: 'in_group' };
    return { line, lastName, firstName, issue: null };
  });
  return { ok: true, lines };
}

const MAX_LOGIN = 40;

/**
 * Логин ученика: фамилия.и.slug; n-я попытка при занятости — фамилия.иN.slug.
 * Фамилия обрезается так, чтобы логин уложился в 40 символов правила LOGIN_RE.
 */
export function candidateLogin(lastName: string, firstName: string, slug: string, n: number): string {
  const initial = transliterate(firstName).replace(/[^a-z0-9]/g, '').charAt(0) || 'x';
  const suffix = n > 1 ? String(n) : '';
  const room = Math.max(1, MAX_LOGIN - (initial.length + suffix.length + slug.length + 2));
  const stem = (transliterate(lastName).replace(/^-+/, '') || 'user').slice(0, room).replace(/-+$/, '') || 'u';
  return `${stem}.${initial}${suffix}.${slug}`;
}

/** Логины для строк без пометок: по порядку, в обход занятых и уже выданных в этом списке. */
export function planLogins(lines: RosterLine[], slug: string, taken: ReadonlySet<string>): Map<number, string> {
  const used = new Set(taken);
  const out = new Map<number, string>();
  for (const l of lines) {
    if (l.issue) continue;
    let n = 1;
    let login = candidateLogin(l.lastName, l.firstName, slug, n);
    while (used.has(login)) {
      n++;
      login = candidateLogin(l.lastName, l.firstName, slug, n);
    }
    used.add(login);
    out.set(l.line, login);
  }
  return out;
}

export function displayNameOf(l: Pick<RosterLine, 'lastName' | 'firstName'>): string {
  return `${l.lastName} ${l.firstName}`;
}

/** «Создать 1 ученика», «Создать 2 учеников»: после числа — родительный падеж. */
export function createStudentsLabel(n: number): string {
  const one = n % 10 === 1 && n % 100 !== 11;
  return `Создать ${n} ${one ? 'ученика' : 'учеников'}`;
}

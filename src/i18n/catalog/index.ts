import type { Locale } from '../config';
import type { CatalogEntry } from './types';
import { catalog as common } from './common';
import { catalog as lms } from './lms';
import { catalog as research } from './research';
import { catalog as org } from './org';
import { catalog as learn } from './learn';
import { catalog as app } from './app';
import { catalog as generation } from './generation';

/**
 * Перевод сообщений, пришедших с сервера. Сервер и библиотеки пишут по-русски
 * (так их понимают логи, тесты и воркер без запроса), а интерфейс показывает текст
 * на языке пользователя: точное совпадение, затем шаблоны с {параметрами}.
 * Неизвестное сообщение остаётся как есть — лучше русский текст, чем пустота.
 */
const ALL: CatalogEntry[] = [...common, ...lms, ...research, ...org, ...learn, ...app, ...generation];

const exact = new Map<string, CatalogEntry>();
const patterns: { re: RegExp; names: string[]; entry: CatalogEntry }[] = [];
for (const e of ALL) {
  if (!e.ru.includes('{')) { exact.set(e.ru, e); continue; }
  const names: string[] = [];
  const src = e.ru.split(/(\{\w+\})/).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m) { names.push(m[1]); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  patterns.push({ re: new RegExp(`^${src}$`), names, entry: e });
}

export function localizeMessage(text: string, locale: Locale): string {
  if (locale === 'ru' || !text) return text;
  const hit = exact.get(text);
  if (hit) return hit[locale];
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (m) return p.entry[locale].replace(/\{(\w+)\}/g, (_, n: string) => m[p.names.indexOf(n) + 1] ?? '');
  }
  return text;
}

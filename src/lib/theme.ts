/**
 * Тема оформления. Значение хранится в двух местах: в localStorage — чтобы
 * применить его ДО первой отрисовки и не показать вспышку светлого фона, и в
 * настройках пользователя на сервере — чтобы выбор переезжал между устройствами.
 * localStorage здесь ведущий: серверное значение подтягивается при загрузке,
 * если локально ещё ничего не выбрано.
 */
export type Theme = 'light' | 'dark' | 'system';

export const THEME_KEY = 'teseract-theme';
export const THEMES: Theme[] = ['light', 'dark', 'system'];

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as string[]).includes(v);
}

/** Во что превращается выбор с учётом системной настройки: 'light' | 'dark'. */
export function resolveTheme(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

/** Скрипт, который выполняется в <head> до отрисовки тела страницы. */
export const THEME_BOOT_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||'light';
if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','light');}})()`;

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const prefersDark = typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', resolveTheme(theme, prefersDark));
}

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* приватный режим — не беда */ }
  applyTheme(theme);
}

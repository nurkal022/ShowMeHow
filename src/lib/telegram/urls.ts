import type { Persona } from './store';

/** Адрес сайта для ссылок из бота. На сервере задаётся TELEGRAM_SITE_URL. */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.TELEGRAM_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export function claimUrl(token: string): string {
  return `${siteUrl()}/tg/claim?t=${encodeURIComponent(token)}`;
}

export function loginUrl(token: string): string {
  return `${siteUrl()}/api/tg/login?t=${encodeURIComponent(token)}`;
}

/** Telegram отвергает кнопки с localhost и голыми IP без домена. */
export function canUseUrlButton(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && h.includes('.');
  } catch {
    return false;
  }
}

/** Куда вести после привязки или входа по ссылке. */
export function personaHome(persona: Persona | null): string {
  if (persona === 'teacher') return '/teach';
  if (persona === 'student') return '/learn';
  if (persona === 'researcher') return '/research';
  return '/';
}

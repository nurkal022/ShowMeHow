import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';
import { currentLocale } from '@/i18n/client';
import { translator } from '@/i18n/core';
import { localizeMessage } from '@/i18n/catalog';
import { cabinet } from '@/i18n/messages/cabinet';

/**
 * Запрос из клиентских компонентов кабинетов: одна обработка сети, 401 и ошибок.
 * Протухшая сессия уводит на вход с возвратом на текущую страницу.
 * Текст ошибки сразу на языке интерфейса: сервер пишет по-русски, каталог переводит.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callApi<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  const locale = currentLocale();
  const t = translator(cabinet, locale);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: t('netDown') };
  }
  if (isUnauthorized(res)) {
    loginWithReturnTo(window.location.pathname + window.location.search);
    return { ok: false, error: t('sessionEnded') };
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? localizeMessage((data as { error: string }).error, locale)
      : res.status === 404 ? t('notFoundRefresh') : t('serverError', { n: res.status });
    return { ok: false, error: message };
  }
  return { ok: true, data: data as T };
}

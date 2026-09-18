import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';

/**
 * Запрос из клиентских компонентов кабинетов: одна обработка сети, 401 и ошибок.
 * Протухшая сессия уводит на вход с возвратом на текущую страницу.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callApi<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'Сеть недоступна. Проверьте соединение и попробуйте снова.' };
  }
  if (isUnauthorized(res)) {
    loginWithReturnTo(window.location.pathname + window.location.search);
    return { ok: false, error: 'Сессия закончилась. Войдите снова.' };
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : res.status === 404 ? 'Не найдено. Обновите страницу.' : `Ошибка сервера (${res.status}). Попробуйте ещё раз.`;
    return { ok: false, error: message };
  }
  return { ok: true, data: data as T };
}

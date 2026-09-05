/**
 * Имя cookie сессии в отдельном модуле без зависимостей от Postgres и node:crypto:
 * его подключает middleware, которое исполняется в Edge-рантайме и не может тянуть
 * за собой ./users (pg) и ./session (node:crypto) — сборка webpack иначе падает
 * на "node:crypto" при бандлинге middleware.
 */
export const SESSION_COOKIE = 'showmehow_session';

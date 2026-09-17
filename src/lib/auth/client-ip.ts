/**
 * Адрес клиента для лимитов входа. x-forwarded-for подделывается как угодно, поэтому
 * ему верим только за своим прокси (SHOWMEHOW_TRUST_PROXY=1) и берём последний адрес —
 * тот, что дописал прокси; первые клиент может подставить сам.
 *
 * Адреса сокета обработчики App Router не получают, поэтому без прокси адрес неизвестен:
 * возвращаем null, и счётчик IP не ведётся. Общий ключ для всех запросов был бы хуже —
 * триста чужих ошибок закрыли бы вход всему сайту. Каждый аккаунт при этом по-прежнему
 * защищает счётчик по идентификатору.
 */
export function clientIp(req: Request, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.SHOWMEHOW_TRUST_PROXY !== '1') return null;
  const parts = (req.headers.get('x-forwarded-for') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? null;
}

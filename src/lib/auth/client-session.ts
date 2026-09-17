/**
 * Клиентские страницы уже отрисованы, когда сессия протухает (например, кто-то
 * разлогинил пользователя с другого устройства): 401 от API — единственный
 * сигнал об этом. Вместо общей ошибки уводим на вход с возвратом на текущую
 * страницу, а не молчим и не пишем «не удалось загрузить».
 */
export function isUnauthorized(res: Response): boolean {
  return res.status === 401;
}

export function loginWithReturnTo(path: string): void {
  window.location.assign(`/login?next=${encodeURIComponent(path)}`);
}

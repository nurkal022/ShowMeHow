/** Названия действий админки для журнала. Модуль чистый — его рендерит страница. */
export type AdminActionName =
  | 'org.create' | 'org.archive' | 'org.restore' | 'org.settings'
  | 'user.reset_password' | 'user.disable' | 'user.enable' | 'user.make_admin' | 'user.revoke_admin' | 'user.impersonate' | 'platform.registration'
  | 'catalog.add' | 'catalog.remove';

export const ADMIN_ACTION_LABELS: Record<AdminActionName, string> = {
  'org.create': 'создал организацию',
  'org.archive': 'отправил организацию в архив',
  'org.restore': 'вернул организацию из архива',
  'org.settings': 'изменил настройки организации',
  'user.reset_password': 'сбросил пароль',
  'user.disable': 'заблокировал',
  'user.enable': 'разблокировал',
  'user.make_admin': 'сделал админом платформы',
  'user.revoke_admin': 'снял права админа платформы',
  'user.impersonate': 'вошёл от имени',
  'platform.registration': 'изменил регистрацию',
  'catalog.add': 'добавил в общий каталог',
  'catalog.remove': 'убрал из общего каталога',
};

export function adminActionLabel(action: string): string {
  return (ADMIN_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

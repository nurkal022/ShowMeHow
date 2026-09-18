/** Адреса страниц кабинетов и урока. Модуль чистый: его зовут сервер и клиент. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Выбор организации живёт в адресе: ссылки внутри кабинета его сохраняют. */
export function withOrgParam(href: string, org: string | null | undefined): string {
  if (!org) return href;
  return `${href}${href.includes('?') ? '&' : '?'}org=${encodeURIComponent(org)}`;
}

export function courseEditorHref(courseId: string, topicId?: string | null): string {
  return topicId ? `/teach/courses/${courseId}?topic=${topicId}` : `/teach/courses/${courseId}`;
}

export function answersHref(
  courseId: string, blockId: string, opts: { pending?: boolean; s?: string | null } = {},
): string {
  const q = new URLSearchParams();
  if (opts.pending) q.set('pending', '1');
  if (opts.s) q.set('s', opts.s);
  const tail = q.toString();
  return `/teach/courses/${courseId}/answers/${blockId}${tail ? `?${tail}` : ''}`;
}

export function learnCourseHref(courseId: string, preview: boolean): string {
  return `/learn/courses/${courseId}${preview ? '?preview=1' : ''}`;
}

export function learnTopicHref(topicId: string, preview: boolean): string {
  return `/learn/topics/${topicId}${preview ? '?preview=1' : ''}`;
}

/** «Сгенерировать тренажёр для этого блока»: мастерская вернёт симуляцию в блок. */
export function generateForBlockHref(blockId: string): string {
  return `/?returnTo=${blockId}`;
}

/** «Предыдущий» и «Следующий» в списке ответов; без текущего «следующий» — первый. */
export function neighbours(
  ids: string[], current: string | null | undefined,
): { prev: string | null; next: string | null } {
  const i = current ? ids.indexOf(current) : -1;
  if (i === -1) return { prev: null, next: ids[0] ?? null };
  return { prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}

/** returnTo из адреса мастерской: только uuid блока, иначе ссылку не показываем. */
export function lessonBlockFromSearch(value: string | null): string | null {
  return value && UUID_RE.test(value) ? value.toLowerCase() : null;
}
